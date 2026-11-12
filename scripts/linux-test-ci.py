"""Validate the exact release tarball on a GitHub-hosted Ubuntu runner.

Uses Git's existing GitHub credential without printing or saving it. Creates
only the dedicated codex/linux-canvas-validation branch, never updates main.
"""
import argparse
import base64
import io
import hashlib
import json
import pathlib
import subprocess
import urllib.error
import urllib.request
import urllib.parse
import uuid
import zipfile
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'out/linux-ci'
REPO = 'LuckyUniverse65/getImageData'
BRANCH = 'codex/linux-canvas-validation-' + uuid.uuid4().hex[:8]
VERSION = json.loads((ROOT / 'npm/package.json').read_text())['version']
TARBALL = 'lucky65_canvas-' + VERSION + '.tgz'


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if urllib.parse.urlparse(req.full_url).netloc != urllib.parse.urlparse(newurl).netloc:
            redirected.remove_header('Authorization')
        return redirected


OPENER = urllib.request.build_opener(SafeRedirect())


def credential():
    result = subprocess.run(['git', 'credential', 'fill'], cwd=ROOT,
        input='protocol=https\nhost=github.com\npath=' + REPO + '.git\n\n',
        text=True, capture_output=True, check=True, timeout=60)
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    return values['password']


def api(token, path, data=None, method=None, raw=False):
    request = urllib.request.Request('https://api.github.com/repos/' + REPO + '/' + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                 'User-Agent': 'lucky65-canvas-linux-validation', 'X-GitHub-Api-Version': '2022-11-28'},
        method=method)
    try:
        with OPENER.open(request, timeout=90) as response:
            body = response.read()
            return body if raw else json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        message = error.read().decode(errors='replace')
        raise RuntimeError('GitHub HTTP ' + str(error.code) + ': ' + message) from None


def start(token, package=False):
    previous = json.loads((OUT / 'run.json').read_text()) if (OUT / 'run.json').exists() else {}
    branch = previous.get('branch', BRANCH)
    assert branch.startswith('codex/linux-canvas-validation-')
    base = api(token, 'git/ref/heads/' + branch)['object']['sha'] if previous else api(token, 'git/ref/heads/main')['object']['sha']
    base_tree = api(token, 'git/commits/' + base)['tree']['sha']
    names = ['Cargo.toml', 'Cargo.lock', 'build.rs', 'package.json', 'package-lock.json',
             'index.js', 'src/webgl_native.rs', 'src/canvas_css.rs', 'src/skia_backend.cpp',
             'src/render_diagnostics.h', 'src/linux_fontconfig.h', 'src/dommatrix.js', 'scripts/prepare-native.cjs',
             'scripts/bundle-canvas.cjs', 'scripts/build-canvas.cjs', 'scripts/build-linux.py', 'scripts/test-native-api.js',
             'scripts/bundle-linux-runtime.py', 'scripts/test-bundled-linux.js', 'scripts/linux-builder.Dockerfile',
             'snapshot/linux-skia-args.gn', 'snapshot/native-api-contract.json', 'demo/demo_server.js',
             '.github/workflows/linux-canvas-validation.yml']
    files = {name: (ROOT / name).read_bytes() for name in names}
    if package:
        names = ['scripts/test-native-api.js', 'scripts/test-bundled-linux.js', 'snapshot/native-api-contract.json', 'demo/demo_server.js',
                 '.github/workflows/linux-package-validation.yml']
        files = {name: (ROOT / name).read_bytes() for name in names}
        package_bytes = (ROOT / 'dist' / TARBALL).read_bytes()
        chunk_size = 4 * 1024 * 1024
        for index, offset in enumerate(range(0, len(package_bytes), chunk_size)):
            files['.ci/' + TARBALL + '.part-' + str(index).zfill(3)] = package_bytes[offset:offset + chunk_size]
        files['.ci/' + TARBALL + '.sha256'] = (hashlib.sha256(package_bytes).hexdigest() + '  .ci/' + TARBALL + '\n').encode()
    entries = []
    for name, content in files.items():
        print('Uploading ' + name + ' (' + str(len(content)) + ' bytes)', flush=True)
        blob = api(token, 'git/blobs', {'content': base64.b64encode(content).decode(), 'encoding': 'base64'})
        entries.append({'path': name, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
    tree = api(token, 'git/trees', {'base_tree': base_tree, 'tree': entries})
    commit = api(token, 'git/commits', {'message': 'Test Linux Canvas release on Ubuntu', 'tree': tree['sha'], 'parents': [base]})
    if previous:
        api(token, 'git/refs/heads/' + branch, {'sha': commit['sha']}, method='PATCH')
    else:
        api(token, 'git/refs', {'ref': 'refs/heads/' + branch, 'sha': commit['sha']})
    OUT.mkdir(parents=True, exist_ok=True)
    info = {'commit': commit['sha'], 'branch': branch, 'version': VERSION, 'mode': 'package' if package else 'native'}
    if package:
        info['tarballSHA256'] = hashlib.sha256(package_bytes).hexdigest()
    (OUT / 'run.json').write_text(json.dumps(info, indent=2))
    print(json.dumps({'commit': commit['sha'], 'branch': branch, 'actions': 'https://github.com/' + REPO + '/actions'}))


def status(token):
    info = json.loads((OUT / 'run.json').read_text())
    runs = api(token, 'actions/runs?head_sha=' + info['commit'])['workflow_runs']
    expected = 'Native Linux npm package validation' if info.get('mode') == 'package' else 'Native Linux Canvas validation'
    runs = [r for r in runs if r['name'] == expected]
    if not runs:
        print(json.dumps({'status': 'waiting-for-workflow'}))
        return
    run = runs[0]
    print(json.dumps({key: run[key] for key in ['id', 'status', 'conclusion', 'html_url']}))
    if run['status'] != 'completed':
        jobs = api(token, 'actions/runs/' + str(run['id']) + '/jobs')['jobs']
        for job in jobs:
            print(json.dumps({'job': job['name'], 'steps': [s['name'] + ': ' + str(s['conclusion'] or s['status']) for s in job.get('steps', []) if s['status'] != 'queued']}))
        return
    info.update({key: run[key] for key in ['id', 'status', 'conclusion', 'html_url']})
    (OUT / 'run.json').write_text(json.dumps(info, indent=2))
    if run['conclusion'] == 'success':
        artifacts = api(token, 'actions/runs/' + str(run['id']) + '/artifacts')['artifacts']
        if info.get('mode') == 'package':
            tarball = (ROOT / 'dist' / ('lucky65_canvas-' + info['version'] + '.tgz')).read_bytes()
            if hashlib.sha256(tarball).hexdigest() != info['tarballSHA256']:
                raise RuntimeError('Local tarball changed since the CI upload')
            expected = {'linux-package-' + os + '-' + node for os in ('ubuntu-22.04', 'ubuntu-24.04') for node in ('22.13.1', '24')}
            expected.update({'linux-minimal-bullseye-node-22.13.1', 'linux-minimal-bullseye-node-22',
                             'linux-minimal-bookworm-node-22.13.1', 'linux-minimal-bookworm-node-24'})
            if {artifact['name'] for artifact in artifacts} != expected:
                raise RuntimeError('Expected all eight Linux installation test artifacts')
            for artifact in artifacts:
                archive = api(token, 'actions/artifacts/' + str(artifact['id']) + '/zip', raw=True)
                with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
                    result = zipped.read('package-result.json')
                    checked = json.loads(result)
                    runtime = checked.get('bundledRuntime', {})
                    if 'bullseye' in artifact['name'] and runtime.get('glibcVersion') != '2.31':
                        raise RuntimeError('Debian 11 must be tested on real glibc 2.31')
                    if not (checked.get('passed') and checked.get('exports') == 41 and checked.get('contextMethodsExercised') == 44
                            and runtime.get('fontconfigFromPackage') and runtime.get('cjkFontUsed')):
                        raise RuntimeError('Incomplete Linux package verification: ' + artifact['name'])
                    (OUT / (artifact['name'] + '.json')).write_bytes(result)
                    print(result.decode())
            return
        artifact = next(item for item in artifacts if item['name'] == 'linux-canvas-native')
        archive = api(token, 'actions/artifacts/' + str(artifact['id']) + '/zip', raw=True)
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            result = json.loads(zipped.read('test-result.json'))
            build = json.loads(zipped.read('build-info.json'))
            if not result.get('passed') or result.get('platform') != 'linux' or result.get('contextMethodsExercised') != 44:
                raise RuntimeError('Linux artifact has not passed the complete API checks')
            if hashlib.sha256(zipped.read('canvas.node')).hexdigest() != build['sha256']:
                raise RuntimeError('Linux artifact binary hash mismatch')
            destination = ROOT / 'dist/canvas-linux'
            destination.mkdir(parents=True, exist_ok=True)
            for name, expected in build.get('bundledFiles', {}).items():
                relative = pathlib.PurePosixPath(name)
                if relative.is_absolute() or '..' in relative.parts or relative.parts[0] not in ('linux-libs', 'fonts'):
                    raise RuntimeError('Unsafe artifact path: ' + name)
                data = zipped.read(name)
                if hashlib.sha256(data).hexdigest() != expected:
                    raise RuntimeError('Bundled file hash mismatch: ' + name)
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            for name in ['canvas.node', 'build-info.json', 'test-result.json', 'LINUX_NOTICES.txt', 'package.json']:
                (destination / name).write_bytes(zipped.read(name))
            print((destination / 'test-result.json').read_text())
    else:
        archive = api(token, 'actions/runs/' + str(run['id']) + '/logs', raw=True)
        (OUT / ('logs-' + str(run['id']) + '.zip')).write_bytes(archive)
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            for name in zipped.namelist():
                if name.endswith('.txt') and any(step in name for step in ['Install build', 'Build complete', 'Test original', 'Install exact']):
                    print(zipped.read(name).decode(errors='replace')[-8000:])

def logs(token, run_id):
    archive = api(token, 'actions/runs/' + str(run_id) + '/logs', raw=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        for name in zipped.namelist():
            if name.endswith('.txt') and ('Install build' in name or 'Build complete' in name or 'Test original' in name):
                print(zipped.read(name).decode('utf-8-sig', errors='replace')[-12000:])

def tail(token, run_id):
    run = api(token, 'actions/runs/' + str(run_id))
    print(json.dumps({k: run[k] for k in ['id', 'status', 'conclusion', 'run_started_at']}))
    for job in api(token, 'actions/runs/' + str(run_id) + '/jobs')['jobs']:
        print(json.dumps({'job': job['id'], 'steps': [{'name': s['name'], 'status': s['status'], 'started_at': s['started_at']} for s in job.get('steps', []) if s['status'] == 'in_progress']}))
        try:
            print(api(token, 'actions/jobs/' + str(job['id']) + '/logs', raw=True).decode('utf-8-sig', errors='replace')[-10000:])
        except RuntimeError as error:
            if '404' not in str(error):
                raise
            print('Job logs are not available until completion.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--action', choices=['start', 'status', 'package', 'logs', 'tail'], required=True)
    parser.add_argument('--run-id', type=int)
    args = parser.parse_args()
    action = args.action
    token = credential()
    if action in ('start', 'package'):
        start(token, action == 'package')
    elif action == 'logs':
        logs(token, args.run_id)
    elif action == 'tail':
        tail(token, args.run_id)
    else:
        status(token)
