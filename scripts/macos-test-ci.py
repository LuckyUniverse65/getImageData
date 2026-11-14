"""Build and validate macOS on a dedicated GitHub branch using existing Git credentials."""
import argparse
import base64
import concurrent.futures
import hashlib
import io
import json
import pathlib
import runpy
import uuid
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'out/macos-ci'
shared = runpy.run_path(str(ROOT / 'scripts/linux-test-ci.py'))
api, credential = shared['api'], shared['credential']


def start(token, package=False):
    previous = json.loads((OUT / 'run.json').read_text()) if (OUT / 'run.json').exists() else {}
    branch = previous.get('branch', 'codex/macos-canvas-validation-' + uuid.uuid4().hex[:8])
    assert branch.startswith('codex/macos-canvas-validation-')
    base = api(token, 'git/ref/heads/' + (branch if previous else 'main'))['object']['sha']
    tree = api(token, 'git/commits/' + base)['tree']['sha']
    names = ['Cargo.toml', 'Cargo.lock', 'build.rs', 'package.json', 'package-lock.json', 'npm/package.json',
             'index.js', 'src/webgl_native.rs', 'src/canvas_css.rs', 'src/skia_backend.cpp', 'src/render_diagnostics.h',
             'src/dommatrix.js', 'scripts/prepare-native.cjs', 'scripts/bundle-canvas.cjs', 'scripts/build-linux.py',
             'scripts/build-macos.py', 'scripts/test-native-api.js', 'scripts/test-macos.js', 'scripts/build-canvas.cjs',
             'snapshot/macos-skia-args.gn', 'snapshot/native-api-contract.json', 'demo/demo_server.js',
             '.github/workflows/macos-canvas-validation.yml']
    version = json.loads((ROOT / 'npm/package.json').read_text())['version']
    files = {name: (ROOT / name).read_bytes() for name in names}
    info = {'branch': branch, 'version': version, 'mode': 'package' if package else 'native'}
    if package:
        names = ['scripts/test-native-api.js', 'scripts/test-macos.js', 'snapshot/native-api-contract.json',
                 'demo/demo_server.js', '.github/workflows/macos-package-validation.yml']
        files = {name: (ROOT / name).read_bytes() for name in names}
        filename = 'lucky65_canvas-' + version + '.tgz'
        tarball = (ROOT / 'dist' / filename).read_bytes()
        info['tarballSHA256'] = hashlib.sha256(tarball).hexdigest()
        size = 4 * 1024 * 1024
        for i, offset in enumerate(range(0, len(tarball), size)):
            files['.ci/' + filename + '.part-' + str(i).zfill(3)] = tarball[offset:offset + size]
        files['.ci/' + filename + '.sha256'] = (info['tarballSHA256'] + '  .ci/' + filename + '\n').encode()
    reusable = {}
    linux_record = ROOT / 'out/linux-ci/run.json'
    if package and linux_record.exists():
        linux_info = json.loads(linux_record.read_text())
        if linux_info.get('mode') == 'package' and linux_info.get('tarballSHA256') == info['tarballSHA256']:
            # Both CI branches live in the same repository. Reuse the identical
            # already uploaded blobs; never infer an object exists from its hash alone.
            remote = api(token, 'git/trees/' + linux_info['commit'] + '?recursive=1')
            assert not remote.get('truncated'), 'Cannot verify reusable package objects'
            reusable = {entry['path']: entry['sha'] for entry in remote['tree'] if entry['type'] == 'blob' and entry['path'].startswith('.ci/')}
    def upload(item):
        name, content = item
        expected = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
        if reusable.get(name) == expected:
            sha = expected
            print('Reusing verified uploaded blob: ' + name, flush=True)
        else:
            blob = api(token, 'git/blobs', {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
            sha = blob['sha']
        return {'path': name, 'mode': '100644', 'type': 'blob', 'sha': sha}
    with concurrent.futures.ThreadPoolExecutor(max_workers=1 if package else 3) as pool:
        entries = list(pool.map(upload, files.items()))
    new_tree = api(token, 'git/trees', {'base_tree': tree, 'tree': entries})
    commit = api(token, 'git/commits', {'message': 'Validate original Canvas on macOS: ' + info['mode'], 'tree': new_tree['sha'], 'parents': [base]})
    if previous:
        api(token, 'git/refs/heads/' + branch, {'sha': commit['sha']}, method='PATCH')
    else:
        api(token, 'git/refs', {'ref': 'refs/heads/' + branch, 'sha': commit['sha']})
    info['commit'] = commit['sha']
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'run.json').write_text(json.dumps(info, indent=2) + '\n')
    print(json.dumps(info), flush=True)


def status(token):
    info = json.loads((OUT / 'run.json').read_text())
    expected = 'Native macOS npm package validation' if info['mode'] == 'package' else 'Native macOS Canvas validation'
    runs = [r for r in api(token, 'actions/runs?head_sha=' + info['commit'])['workflow_runs'] if r['name'] == expected]
    if not runs:
        print('Waiting for workflow')
        return
    run = runs[0]
    info.update({key: run[key] for key in ['id', 'status', 'conclusion', 'html_url']})
    (OUT / 'run.json').write_text(json.dumps(info, indent=2) + '\n')
    print(json.dumps(info), flush=True)
    if run['status'] != 'completed':
        for job in api(token, 'actions/runs/' + str(run['id']) + '/jobs')['jobs']:
            print(json.dumps({'job': job['name'], 'status': job['status'], 'conclusion': job['conclusion'], 'steps': [s['name'] + ': ' + str(s['conclusion'] or s['status']) for s in job.get('steps', []) if s['status'] != 'queued']}))
            if job['conclusion'] in ('failure', 'cancelled'):
                annotations = api(token, 'check-runs/' + str(job['id']) + '/annotations')
                print(json.dumps([a['message'] for a in annotations]))
                if job.get('steps'):
                    print(api(token, 'actions/jobs/' + str(job['id']) + '/logs', raw=True).decode(errors='replace')[-14000:])
        return
    if run['conclusion'] != 'success':
        archive = api(token, 'actions/runs/' + str(run['id']) + '/logs', raw=True)
        (OUT / ('logs-' + str(run['id']) + '.zip')).write_bytes(archive)
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            for name in zipped.namelist():
                if name.endswith('.txt') and any(step in name for step in ['Install build', 'Build complete', 'Test original', 'Install exact']):
                    print(name + '\n' + zipped.read(name).decode(errors='replace')[-7000:])
        return
    artifacts = api(token, 'actions/runs/' + str(run['id']) + '/artifacts')['artifacts']
    if info['mode'] == 'package':
        assert hashlib.sha256((ROOT / 'dist' / ('lucky65_canvas-' + info['version'] + '.tgz')).read_bytes()).hexdigest() == info['tarballSHA256']
        expected_names = {'macos-package-' + arch + '-' + node for arch in ['x64', 'arm64'] for node in ['22.13.1', '24']}
    else:
        expected_names = {'macos-canvas-arm64', 'macos-canvas-x64'}
    assert expected_names.issubset({a['name'] for a in artifacts}), 'Missing macOS validation artifacts'
    for artifact in artifacts:
        if artifact['name'] not in expected_names:
            continue
        archive = api(token, 'actions/artifacts/' + str(artifact['id']) + '/zip', raw=True)
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            result = json.loads(zipped.read('package-result.json' if info['mode'] == 'package' else 'test-result.json'))
            arch = result['macOS']['arch']
            assert result['passed'] and result['platform'] == 'darwin' and result['exports'] == 41 and result['contextMethodsExercised'] == 44
            assert result['macOS']['cjkFontUsed'] and result['macOS']['textRendered']
            if info['mode'] == 'package':
                assert result['esmDefaultImport']
                assert artifact['name'].startswith('macos-package-' + arch + '-')
                (OUT / (artifact['name'] + '.json')).write_bytes(zipped.read('package-result.json'))
            else:
                build = json.loads(zipped.read('build-info.json'))
                assert build['arch'] == arch and artifact['name'] == 'macos-canvas-' + arch
                assert hashlib.sha256(zipped.read('canvas.node')).hexdigest() == build['sha256']
                for name, expected_hash in build['sources'].items():
                    relative = pathlib.PurePosixPath(name)
                    assert not relative.is_absolute() and '..' not in relative.parts and ':' not in name
                    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected_hash, 'Build source mismatch: ' + name
                destination = ROOT / ('dist/canvas-darwin-' + arch)
                destination.mkdir(parents=True, exist_ok=True)
                for name in ['canvas.node', 'build-info.json', 'test-result.json', 'MACOS_NOTICES.txt', 'package.json']:
                    (destination / name).write_bytes(zipped.read(name))
            print('Verified ' + artifact['name'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--action', choices=['start', 'status', 'package', 'logs'], required=True)
    parser.add_argument('--run-id', type=int)
    args = parser.parse_args()
    token = credential()
    if args.action == 'logs':
        if not args.run_id:
            parser.error('--run-id is required for logs')
        shared['logs'](token, args.run_id)
    elif args.action == 'status':
        status(token)
    else:
        start(token, args.action == 'package')
