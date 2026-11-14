"""Read-only audit of this project's saved release evidence; never contacts registries."""
import argparse
import base64
import hashlib
import json
import pathlib
import sys


def read_json(file):
    return json.loads(pathlib.Path(file).read_text(encoding='utf-8-sig'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(file):
    with pathlib.Path(file).open('rb') as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def child(root, relative):
    relative = pathlib.PurePosixPath(relative.replace('\\', '/'))
    require(not relative.is_absolute() and '..' not in relative.parts and ':' not in str(relative), 'Unsafe relative path')
    target = (root / str(relative)).resolve()
    require(target.is_relative_to(root.resolve()), 'Path outside evidence root')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--verification', required=True)
    parser.add_argument('--ci', required=True)
    parser.add_argument('--publication')
    parser.add_argument('--tarball', help='Override archived absolute path after moving the project')
    args = parser.parse_args()
    root = pathlib.Path(args.project).resolve()
    verified, ci = read_json(args.verification), read_json(args.ci)
    manifest = read_json(root / 'npm/package.json')
    require(verified['package'] == manifest['name'] and verified['version'] == manifest['version'], 'Manifest differs from verification')
    tarball = pathlib.Path(args.tarball) if args.tarball else root / 'dist' / (manifest['name'] + '-' + manifest['version'] + '.tgz')
    require(sha256(tarball) == verified['tarballSHA256'], 'Tarball SHA-256 mismatch')
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(tarball.read_bytes()).digest()).decode()
    require(integrity == verified['integrity'], 'Tarball integrity mismatch')
    require(ci.get('mode') == 'package' and ci.get('conclusion') == 'success', 'Package CI did not succeed')
    require(ci.get('version') == verified['version'] and ci.get('tarballSHA256') == verified['tarballSHA256'], 'CI tested a different version/tarball')
    for field in ('smoke', 'nativeSmoke', 'linuxTest'):
        require(verified.get(field, {}).get('passed'), 'Missing passing result: ' + field)
    require(verified['smoke'].get('demoMismatches') == 0, 'Windows demo regressed')
    build = read_json(root / 'dist/canvas-linux/build-info.json')
    require(sha256(root / 'dist/canvas-linux/canvas.node') == build['sha256'], 'Linux binary hash mismatch')
    windows = read_json(root / 'dist/canvas/environment.json')
    require(windows.get('status') == 'verified' and windows.get('verification', {}).get('browserVerified'), 'Windows build lacks verification')
    require(sha256(root / 'dist/canvas/canvas.node') == windows['binarySHA256'], 'Windows binary hash mismatch')
    for name, expected in build['sources'].items():
        require(sha256(child(root, name)) == expected, 'Source changed since build: ' + name)
    for name, expected in build['bundledFiles'].items():
        require(name.startswith(('linux-libs/', 'fonts/')), 'Unexpected runtime file')
        require(sha256(child(root / 'dist/canvas-linux', name)) == expected, 'Runtime file hash mismatch: ' + name)
    minimum = tuple(map(int, build['minimumGlibc'].split('.')))
    requirements = build['glibcRequirements']
    for name in ['canvas.node'] + [pathlib.PurePosixPath(n).name for n in build['bundledFiles'] if n.startswith('linux-libs/')]:
        require(name in requirements, 'Missing ABI check: ' + name)
        if requirements[name]:
            require(tuple(map(int, requirements[name].split('.'))) <= minimum, 'ABI exceeds minimum: ' + name)
    for arch, recorded in verified.get('macOS', {}).items():
        require(arch in ('x64', 'arm64'), 'Unexpected macOS architecture')
        directory = root / ('dist/canvas-darwin-' + arch)
        mac_build = read_json(directory / 'build-info.json')
        mac_test = read_json(directory / 'test-result.json')
        require(sha256(directory / 'canvas.node') == mac_build['sha256'] == recorded['binarySHA256'], 'macOS binary mismatch: ' + arch)
        require(mac_build['arch'] == arch and mac_build['platform'] == 'darwin', 'macOS architecture mismatch')
        require(mac_test['passed'] and mac_test['macOS']['arch'] == arch and mac_test['macOS']['cjkFontUsed'], 'macOS native tests missing')
        for name, expected in mac_build['sources'].items():
            require(sha256(child(root, name)) == expected, 'macOS source changed: ' + name)
    if 'darwin' in manifest.get('os', []):
        require(set(verified.get('macOS', {})) == {'x64', 'arm64'}, 'Both macOS builds must be verified')
    if args.publication:
        published = read_json(args.publication)
        require(published.get('published') and published.get('registryInstallVerified'), 'Publication was not verified')
        for field in ('package', 'version', 'tarballSHA256', 'integrity'):
            require(published[field] == verified[field], 'Publication differs: ' + field)
        require(published.get('linuxValidationURL') == ci.get('html_url'), 'Publication refers to different CI')
    print(json.dumps({'localEvidencePassed': True, 'version': verified['version'], 'minimumGlibc': build['minimumGlibc'],
                      'bundledFilesChecked': len(build['bundledFiles']), 'ciURL': ci.get('html_url'),
                      'registryVerificationRecorded': bool(args.publication), 'registryCheckedNow': False}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('Evidence audit failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
