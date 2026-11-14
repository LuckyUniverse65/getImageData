"""Build the original bundled Canvas using macOS CoreText and Skia CPU."""
import concurrent.futures
import hashlib
import json
import os
import pathlib
import platform
import re
import runpy
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
linux = runpy.run_path(str(ROOT / 'scripts/build-linux.py'))
checkout, run, REVISION = linux['checkout'], linux['run'], linux['REVISION']
SKIA = ROOT / 'third_party/skia'


def main():
    arch = {'arm64': 'arm64', 'x86_64': 'x64'}.get(platform.machine())
    if platform.system() != 'Darwin' or not arch:
        raise SystemExit('Build on macOS 14+ with native x64 or arm64 Python/Node/Rust.')
    if int(platform.mac_ver()[0].split('.')[0]) < 14:
        raise SystemExit('macOS 14 or newer is required.')
    if subprocess.check_output(['node', '-p', 'process.arch'], text=True).strip() != arch:
        raise SystemExit('Python and Node architectures differ; do not mix Rosetta and native tools.')
    os.environ['MACOSX_DEPLOYMENT_TARGET'] = '14.0'
    checkout(SKIA, 'https://skia.googlesource.com/skia.git', REVISION)
    required = {'buildtools', 'harfbuzz', 'highway', 'icu', 'libjpeg-turbo', 'libpng', 'libwebp', 'wuffs', 'zlib'}
    deps = re.findall(r'[\"\']([^\"\']+)[\"\']\s*:\s*[\"\'](https://[^\"\']+)@([0-9a-f]{40})[\"\']', (SKIA / 'DEPS').read_text())
    selected = [(d, u, r) for d, u, r in deps if d.split('/')[-1] in required]
    assert len(selected) == len(required), 'Pinned dependency list changed'
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(checkout, SKIA / d, u, r) for d, u, r in selected]
        for future in futures:
            future.result()
    run('python3', 'bin/fetch-gn', cwd=SKIA)
    build = pathlib.Path(os.environ.get('CANVAS_SKIA_OUT', str(SKIA / ('out/canvas-darwin-' + arch)))).resolve()
    os.environ['CANVAS_SKIA_OUT'] = str(build)
    build.mkdir(parents=True, exist_ok=True)
    (build / 'args.gn').write_text((ROOT / 'snapshot/macos-skia-args.gn').read_text() + '\ntarget_cpu = "' + arch + '"\n')
    run('bin/gn', 'gen', str(build), cwd=SKIA)
    run('ninja', '-C', str(build), '-j', os.environ.get('CANVAS_BUILD_JOBS', '3'), 'skia', 'skshaper', 'skunicode_bidi', 'skunicode_core', cwd=SKIA)
    run('npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund')
    target = 'aarch64-apple-darwin' if arch == 'arm64' else 'x86_64-apple-darwin'
    run('cargo', 'build', '--release', '--features', 'bundled', '--target', target)
    output = ROOT / ('dist/canvas-darwin-' + arch)
    output.mkdir(parents=True, exist_ok=True)
    binary = output / 'canvas.node'
    shutil.copyfile(ROOT / 'target' / target / 'release/libwebgl.dylib', binary)
    actual_arch = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).strip()
    assert actual_arch == ('x86_64' if arch == 'x64' else 'arm64'), actual_arch
    dependencies = subprocess.check_output(['otool', '-L', str(binary)], text=True)
    # First load command is this dylib's own install name, not an external dependency.
    libraries = [line.strip().split(' (')[0] for line in dependencies.splitlines()[1:]]
    own_id = subprocess.check_output(['otool', '-D', str(binary)], text=True).splitlines()[1].strip()
    external = [name for name in libraries if name != own_id]
    assert all(name.startswith(('/usr/lib/', '/System/Library/')) for name in external), external
    commands = subprocess.check_output(['otool', '-l', str(binary)], text=True)
    minimum = re.search(r'\bminos\s+(\S+)', commands)
    assert minimum and minimum.group(1) in ('14.0', '14.0.0'), 'Unexpected deployment target'
    version = json.loads((ROOT / 'npm/package.json').read_text())['version']
    (output / 'package.json').write_text(json.dumps({'name': 'canvas', 'version': version, 'private': True, 'main': 'canvas.node', 'os': ['darwin'], 'cpu': [arch]}, indent=2) + '\n')
    notices = []
    for relative in ['LICENSE', 'third_party/externals/harfbuzz/COPYING', 'third_party/externals/highway/LICENSE',
                     'third_party/externals/libjpeg-turbo/LICENSE.md', 'third_party/externals/libjpeg-turbo/README.ijg',
                     'third_party/externals/libpng/LICENSE',
                     'third_party/externals/libwebp/COPYING', 'third_party/externals/wuffs/LICENSE',
                     'third_party/externals/zlib/LICENSE', 'third_party/externals/icu/LICENSE']:
        notices.append(relative + '\n\n' + (SKIA / relative).read_text())
    (output / 'MACOS_NOTICES.txt').write_text('\n\n'.join(notices), encoding='utf-8')
    sources = ['build.rs', 'index.js', 'src/webgl_native.rs', 'src/canvas_css.rs', 'src/skia_backend.cpp',
               'src/render_diagnostics.h', 'src/dommatrix.js', 'scripts/prepare-native.cjs', 'scripts/bundle-canvas.cjs',
               'scripts/build-macos.py', 'scripts/build-linux.py', 'snapshot/macos-skia-args.gn']
    (output / 'build-info.json').write_text(json.dumps({
        'platform': 'darwin', 'arch': arch, 'backend': 'skia-raster', 'fontBackend': 'CoreText',
        'minimumMacOS': '14.0', 'osVersion': platform.mac_ver()[0], 'skiaRevision': REVISION,
        'sha256': hashlib.sha256(binary.read_bytes()).hexdigest(), 'dependencies': external,
        'compiler': subprocess.check_output(['xcrun', 'clang++', '--version'], text=True).splitlines()[0],
        'rust': subprocess.check_output(['rustc', '--version'], text=True).strip(),
        'sources': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sources},
    }, indent=2) + '\n')
    print('Built', binary, flush=True)


if __name__ == '__main__':
    main()
