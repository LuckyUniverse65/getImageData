"""Build the complete bundled native Canvas on Linux x64; never requires Chrome."""
import concurrent.futures
import hashlib
import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import runpy

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIA = ROOT / 'third_party/skia'
REVISION = '4f574af2444846ceca4d277a8095c5d4229d175f'
FONTCONFIG_REVISION = '00fbdb00e3efafbde7cac84d70678ff87dbed866'

def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)

def checkout(destination, url, revision):
    destination.mkdir(parents=True, exist_ok=True)
    # CI cache files may belong to the host UID rather than the container UID.
    git = ['git', '-c', 'safe.directory=' + str(destination)]
    if not (destination / '.git').exists():
        run(*git, 'init', str(destination))
    current = subprocess.run(git + ['rev-parse', 'HEAD'], cwd=destination, capture_output=True, text=True)
    if current.stdout.strip() != revision:
        run(*git, 'fetch', '--depth=1', url, revision, cwd=destination)
        run(*git, 'checkout', '--detach', 'FETCH_HEAD', cwd=destination)

def main():
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise SystemExit('This build requires Linux x64 (glibc).')
    checkout(SKIA, 'https://skia.googlesource.com/skia.git', REVISION)
    # Only dependencies used by the CPU build. Revisions come from pinned Skia DEPS.
    required = {'buildtools', 'freetype', 'harfbuzz', 'highway', 'icu', 'libjpeg-turbo', 'libpng', 'libwebp', 'wuffs', 'zlib'}
    deps = re.findall(r'[\"\']([^\"\']+)[\"\']\s*:\s*[\"\'](https://[^\"\']+)@([0-9a-f]{40})[\"\']', (SKIA / 'DEPS').read_text())
    selected = [(d, u, r) for d, u, r in deps if d.split('/')[-1] in required]
    assert len(selected) == len(required), 'Pinned dependency list changed'
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(checkout, SKIA / d, u, r) for d, u, r in selected]
        for future in futures:
            future.result()
    checkout(SKIA / 'third_party/externals/fontconfig', 'https://github.com/fontconfig/fontconfig.git', FONTCONFIG_REVISION)
    run('python3', 'bin/fetch-gn', cwd=SKIA)
    build = pathlib.Path(os.environ.get('CANVAS_SKIA_OUT', str(SKIA / 'out/canvas-linux')))
    build.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'snapshot/linux-skia-args.gn', build / 'args.gn')
    run('bin/gn', 'gen', str(build), cwd=SKIA)
    run('ninja', '-C', str(build), '-j', os.environ.get('CANVAS_BUILD_JOBS', '2'), 'skia', 'skshaper', 'skunicode_bidi', 'skunicode_core', cwd=SKIA)
    run('npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund')
    run('cargo', 'build', '--release', '--features', 'bundled')
    output = ROOT / 'dist/canvas-linux'
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'target/release/libwebgl.so', output / 'canvas.node')
    (output / 'package.json').write_text(json.dumps({'name': 'canvas', 'version': json.loads((ROOT / 'npm/package.json').read_text())['version'],
        'private': True, 'main': 'canvas.node', 'os': ['linux'], 'cpu': ['x64']}, indent=2) + '\n')
    binary = output / 'canvas.node'
    notices = ['Portions of this software are copyright (c) 2026 The FreeType Project (www.freetype.org). All rights reserved.\nFreeType is used under the FreeType License (FTL).\n']
    for relative in ['freetype/LICENSE.TXT', 'freetype/docs/FTL.TXT', 'freetype/src/bdf/README',
                     'freetype/src/pcf/README', 'fontconfig/COPYING', 'highway/LICENSE']:
        notices.append(relative + '\n\n' + (SKIA / 'third_party/externals' / relative).read_text())
    runtime = runpy.run_path(str(ROOT / 'scripts/bundle-linux-runtime.py'))
    bundled, dependencies, runtime_notices = runtime['bundle'](output, SKIA / 'out/npm-fonts')
    abi = runtime['verify_glibc']([binary] + [output / name for name in bundled if name.startswith('linux-libs/')])
    notices.append(runtime_notices)
    (output / 'LINUX_NOTICES.txt').write_text('\n\n'.join(notices), encoding='utf-8')
    (output / 'build-info.json').write_text(json.dumps({
        'platform': 'linux', 'arch': 'x64', 'backend': 'skia-raster',
        'skiaRevision': REVISION, 'sha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
        'fontconfigHeadersRevision': FONTCONFIG_REVISION,
        'libc': platform.libc_ver(), 'dependencies': dependencies,
        'bundledFiles': bundled, 'glibcRequirements': abi, 'minimumGlibc': '2.31',
        'compiler': subprocess.check_output(['clang++', '--version'], text=True).splitlines()[0],
        'rust': subprocess.check_output(['rustc', '--version'], text=True).strip(),
        'sources': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in [
            'build.rs', 'index.js', 'src/webgl_native.rs', 'src/canvas_css.rs', 'src/skia_backend.cpp',
            'src/render_diagnostics.h', 'src/linux_fontconfig.h', 'src/dommatrix.js', 'scripts/prepare-native.cjs',
            'scripts/bundle-canvas.cjs', 'scripts/build-linux.py', 'scripts/bundle-linux-runtime.py', 'snapshot/linux-skia-args.gn']},
    }, indent=2) + '\n')
    print('Built', binary, flush=True)

if __name__ == '__main__':
    main()
