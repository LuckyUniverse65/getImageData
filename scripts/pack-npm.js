'use strict';

// npm run pack:npm -- [verified package directory]
// Builds and tests a public tarball; never publishes it or connects to Chrome.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const input = path.resolve(root, process.argv[2] || 'dist/canvas');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

function run(executable, args, cwd) {
    const result = spawnSync(executable, args, {
        cwd, env: process.env, encoding: 'utf8', windowsHide: true,
        timeout: 120000, maxBuffer: 8 * 1024 * 1024
    });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
}

function main() {
    const npmCLI = process.env.npm_execpath;
    if (!npmCLI || !fs.existsSync(npmCLI)) throw new Error('Run this script using npm run pack:npm.');
    const binary = path.join(input, 'canvas.node');
    const report = JSON.parse(fs.readFileSync(path.join(input, 'environment.json'), 'utf8'));
    if (report.status !== 'verified' || !report.verification?.browserVerified) {
        throw new Error('Input must be a successfully verified build.');
    }
    const binarySHA256 = hash(binary);
    if (binarySHA256 !== report.binarySHA256) throw new Error('Binary differs from the verified build report.');
    const linuxDir = path.join(root, 'dist/canvas-linux');
    const linuxBinary = path.join(linuxDir, 'canvas.node');
    const linuxBuild = JSON.parse(fs.readFileSync(path.join(linuxDir, 'build-info.json')));
    const linuxTest = JSON.parse(fs.readFileSync(path.join(linuxDir, 'test-result.json')));
    if (hash(linuxBinary) !== linuxBuild.sha256 || !linuxTest.passed || linuxTest.platform !== 'linux' ||
        linuxTest.exports !== 41 || linuxTest.contextMethodsExercised !== 44) {
        throw new Error('A verified complete Linux native build is required.');
    }
    if (!linuxTest.bundledRuntime?.fontconfigFromPackage || !linuxTest.bundledRuntime?.cjkFontUsed) {
        throw new Error('Bundled Linux runtime and fonts must pass verification.');
    }
    if (!linuxBuild.sources) throw new Error('Linux build must record its source hashes.');
    if (linuxBuild.minimumGlibc !== '2.31' || !linuxBuild.glibcRequirements?.['canvas.node']) {
        throw new Error('Linux build must verify glibc 2.31 compatibility for the addon and bundled libraries.');
    }
    for (const version of Object.values(linuxBuild.glibcRequirements)) {
        if (version && (Number(version.split('.')[0]) > 2 || Number(version.split('.')[1]) > 31)) {
            throw new Error('Linux binary or dependency requires a newer glibc: ' + version);
        }
    }
    for (const [name, expected] of Object.entries(linuxBuild.sources)) {
        if (hash(path.join(root, name)) !== expected) throw new Error('Linux binary is stale: ' + name + ' changed after compilation.');
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'npm/package.json'), 'utf8'));
    if (manifest.name !== 'lucky65_canvas' || manifest.private) throw new Error('Unexpected public package metadata.');
    const macOS = {};
    for (const arch of ['x64', 'arm64']) {
        const directory = path.join(root, 'dist/canvas-darwin-' + arch);
        const build = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json')));
        const test = JSON.parse(fs.readFileSync(path.join(directory, 'test-result.json')));
        if (build.platform !== 'darwin' || build.arch !== arch || build.minimumMacOS !== '14.0' ||
            hash(path.join(directory, 'canvas.node')) !== build.sha256 || !test.passed || test.platform !== 'darwin' ||
            test.exports !== 41 || test.contextMethodsExercised !== 44 || test.macOS?.arch !== arch ||
            !test.macOS?.textRendered || !test.macOS?.cjkFontUsed) {
            throw new Error('Verified macOS native build and system font tests required: ' + arch);
        }
        if (!build.dependencies?.length || !build.dependencies.every(name => /^\/(usr\/lib|System\/Library)\//.test(name))) {
            throw new Error('macOS binaries must use only system dynamic libraries: ' + arch);
        }
        if (!build.sources || !Object.keys(build.sources).length) throw new Error('Missing macOS source provenance');
        for (const [name, expected] of Object.entries(build.sources)) {
            if (path.isAbsolute(name) || name.includes('..') || hash(path.join(root, name)) !== expected) {
                throw new Error('macOS binary is stale or source path invalid: ' + name);
            }
        }
        macOS[arch] = {binarySHA256: build.sha256, minimumMacOS: build.minimumMacOS, skiaRevision: build.skiaRevision,
            backend: build.backend, fontBackend: build.fontBackend, compiler: build.compiler,
            dependencies: build.dependencies, verification: test};
    }

    fs.mkdirSync(path.join(root, 'out'), { recursive: true });
    const output = fs.mkdtempSync(path.join(root, 'out/npm-release-'));
    const stage = path.join(output, 'package');
    fs.mkdirSync(stage);
    for (const name of ['package.json', 'index.js', 'README.md']) {
        fs.copyFileSync(path.join(root, 'npm', name), path.join(stage, name));
    }
    fs.copyFileSync(binary, path.join(stage, 'canvas-win32-x64.node'));
    fs.copyFileSync(linuxBinary, path.join(stage, 'canvas-linux-x64-gnu.node'));
    for (const arch of ['x64', 'arm64']) {
        fs.copyFileSync(path.join(root, 'dist/canvas-darwin-' + arch, 'canvas.node'), path.join(stage, 'canvas-darwin-' + arch + '.node'));
    }
    const bundledFiles = linuxBuild.bundledFiles;
    if (!bundledFiles?.['linux-libs/libfontconfig.so.1'] || !bundledFiles?.['fonts/NotoSansCJKsc-Regular.otf']) {
        throw new Error('Linux runtime libraries and fallback fonts must be bundled.');
    }
    for (const [name, expected] of Object.entries(bundledFiles)) {
        if (!/^(linux-libs|fonts)\/[^/]+$/.test(name) || name.includes('..')) throw new Error('Invalid bundled file path');
        const source = path.join(linuxDir, name);
        if (hash(source) !== expected) throw new Error('Bundled file changed: ' + name);
        fs.mkdirSync(path.dirname(path.join(stage, name)), {recursive:true});
        fs.copyFileSync(source, path.join(stage, name));
    }
    fs.copyFileSync(path.join(input, 'THIRD_PARTY_NOTICES.txt'), path.join(stage, 'THIRD_PARTY_NOTICES.txt'));
    fs.appendFileSync(path.join(stage, 'THIRD_PARTY_NOTICES.txt'), '\n\n' + fs.readFileSync(path.join(linuxDir, 'LINUX_NOTICES.txt'), 'utf8'));
    fs.appendFileSync(path.join(stage, 'THIRD_PARTY_NOTICES.txt'), '\n\n' + fs.readFileSync(path.join(root, 'dist/canvas-darwin-arm64/MACOS_NOTICES.txt'), 'utf8'));
    // Only publish a small build summary. The complete report includes local
    // paths, machine inventories and CDP session identifiers and stays local.
    writeJSON(path.join(stage, 'build-info.json'), {
        binarySHA256, builtAt: report.finishedAt, profile: report.profile,
        macOS,
        linux: {binarySHA256: linuxBuild.sha256, skiaRevision: linuxBuild.skiaRevision,
            backend: linuxBuild.backend, libc: linuxBuild.libc, compiler: linuxBuild.compiler,
            bundledFiles, minimumGlibc:linuxBuild.minimumGlibc, glibcRequirements:linuxBuild.glibcRequirements,
            verification: linuxTest},
        historicalValidation: {
            chromeVersion: report.chrome.version,
            cases: report.verification.tested,
            demoMismatches: report.verification.demoMismatches,
            scope: 'Build machine and historical test cases only; no automatic calibration on installation.'
        }
    });

    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    const [packed] = JSON.parse(run(process.execPath,
        [npmCLI, 'pack', stage, '--ignore-scripts', '--json', '--pack-destination', dist], root));
    const expectedFiles = ['README.md', 'THIRD_PARTY_NOTICES.txt', 'build-info.json', 'canvas-win32-x64.node', 'canvas-linux-x64-gnu.node', 'canvas-darwin-x64.node', 'canvas-darwin-arm64.node', 'index.js', 'package.json', ...Object.keys(bundledFiles)];
    if (JSON.stringify(packed.files.map(file => file.path).sort()) !== JSON.stringify(expectedFiles.sort())) {
        throw new Error('Unexpected files in the public tarball: ' + packed.files.map(file => file.path).join(', '));
    }
    const tarball = path.join(dist, packed.filename);
    const consumer = path.join(output, 'consumer');
    fs.mkdirSync(consumer);
    writeJSON(path.join(consumer, 'package.json'), { name: 'lucky-canvas-install-check', version: '1.0.0', private: true });
    console.log('[npm] Installing the actual tarball into an isolated consumer');
    run(process.execPath, [npmCLI, 'install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
    console.log('[npm] Testing require("lucky65_canvas"), pixels, codecs and Worker loading');
    const smoke = JSON.parse(run(process.execPath, [path.join(__dirname, 'smoke-npm.js'), consumer, binary], consumer));
    const nativeSmoke = JSON.parse(run(process.execPath, ['--expose-gc', path.join(__dirname, 'test-native-api.js'),
        path.join(consumer, 'node_modules/lucky65_canvas/index.js')], consumer));
    const evidence = { package: packed.name, version: packed.version, tarball, tarballSHA256: hash(tarball),
        integrity: packed.integrity, packedBytes: packed.size, files: packed.files, smoke, nativeSmoke, linuxTest, macOS, published: false };
    writeJSON(path.join(output, 'verification.json'), evidence);
    console.log(JSON.stringify({ tarball, packedBytes: packed.size, smoke, nativeSmoke, linuxTest, evidence: path.join(output, 'verification.json'), published: false }, null, 2));
}

try { main(); } catch (error) { console.error('[npm] ' + error.stack); process.exitCode = 1; }
