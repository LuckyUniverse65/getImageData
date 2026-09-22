'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '');
const output = path.join(root, 'out', 'build-' + stamp);
const candidate = path.join(output, 'package');
const binary = path.join(candidate, 'canvas.node');
const configPath = path.join(output, 'machine-config.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(executable, args, options = {}) {
    const result = spawnSync(executable, args, {cwd:root, env:process.env, encoding:'utf8', windowsHide:true,
        timeout:600000, maxBuffer:64 * 1024 * 1024, ...options});
    if (result.status !== 0) throw new Error(`${path.basename(executable)} failed: ${result.error?.message || result.stderr || result.stdout}`);
    return result.stdout.trim();
}
function json(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function progress(message) { console.log('[canvas] ' + message); }
async function main() {
    if (process.platform !== 'win32' || process.arch !== 'x64' || Number(os.release().split('.')[0]) < 10)
        throw new Error('Only Windows 10/11 x64 is supported. Linux, macOS, ARM64 and older Windows are not supported.');
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required');
    fs.mkdirSync(candidate, {recursive:true});
    const lock = path.join(root, 'out/canvas-build.lock');
    const fd = fs.openSync(lock, 'wx');
    fs.writeFileSync(fd, JSON.stringify({pid:process.pid, output}));
    const report = {startedAt:new Date().toISOString(), status:'building', output, node:process.versions,
        scope:'Windows 10/11 x64; validation applies to this machine, profile, browser version and recorded test cases.'};
    try {
        const skia = path.resolve(process.env.CANVAS_SKIA_ROOT || path.join(root, 'third_party/skia'));
        const skiaOut = path.resolve(process.env.CANVAS_SKIA_OUT || path.join(skia, 'out/canvas2d-clang'));
        const clang = path.resolve(process.env.CANVAS_CLANG_ROOT || path.join(root, 'third_party/chrome153-clang'));
        const libraries = ['skia','skshaper','skunicode_bidi','skunicode_core','icu_bidi','allocator_shim','allocator_core','allocator_base','raw_ptr',
            'libjpeg','libjpeg12','libjpeg16','libpng','libwebp','libwebp_sse41','wuffs','zlib','dawn_combined'];
        for (const file of [path.join(clang, 'bin/clang-cl.exe'), path.join(clang, 'bin/lld-link.exe'),
            path.join(skiaOut, 'args.gn'), path.join(root, 'node_modules/@petamoriken/float16/browser/float16.js'),
            ...libraries.map(name => path.join(skiaOut, name + '.lib'))]) {
            if (!fs.existsSync(file)) throw new Error('Missing build prerequisite: ' + file + '. See docs/2026-09-22_windows-canvas-build.md');
        }
        const overrides = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('CANVAS_')));
        const buildKeys = new Set(['CANVAS_SKIA_ROOT','CANVAS_SKIA_OUT','CANVAS_CLANG_ROOT','CANVAS_VCVARS','CANVAS_NODE']);
        const unexpected = Object.keys(overrides).filter(key => !buildKeys.has(key));
        if (unexpected.length) throw new Error('Clear rendering/test overrides before a calibrated build: ' + unexpected.join(', '));
        progress('Reading Windows, CPU, graphics drivers and installed font hashes');
        report.windows = JSON.parse(run('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-environment.ps1')]));
        if (report.windows.os.productType !== 1 || !/Windows (10|11)\b/i.test(report.windows.os.caption))
            throw new Error('Only Windows 10/11 desktop is supported; Windows Server is not supported');
        report.tools = {rust:run('rustc',['--version']), cargo:run('cargo',['--version']), clang:run(path.join(clang,'bin/clang-cl.exe'),['--version'])};
        report.tools.visualStudio = run(path.join(process.env['ProgramFiles(x86)'],'Microsoft Visual Studio/Installer/vswhere.exe'),
            ['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath']);
        report.dependencies = {skiaRevision:run('git',['-C',skia,'rev-parse','HEAD']),
            dawnRevision:run('git',['-C',path.join(skia,'third_party/externals/dawn'),'rev-parse','HEAD']),
            skiaArgs:fs.readFileSync(path.join(skiaOut,'args.gn'),'utf8'),
            libraries:Object.fromEntries(libraries.map(name => [name, hash(path.join(skiaOut,name+'.lib'))]))};
        report.buildOverrides = overrides;
        progress('Capturing this Chrome session; the existing CDP connection is reused');
        const probe = await require('./capture-build-probe.cjs')(fs.readFileSync(path.join(root,'tests/machine-probe.js'),'utf8'), 'machine-profile');
        json(path.join(output,'machine-browser.json'), probe);
        report.chrome = {version:probe.chromeVersion, revision:probe.browserRevision, connectionId:probe.connectionId,
            runId:probe.runId, scriptSHA256:probe.scriptSHA256, environment:probe.value.environment};
        const profile = {backend:'graphite', genericFonts:{}, fallbackFont:'Noto Sans SC'};
        const buildEnv = {...process.env, CANVAS_NODE:process.execPath, CANVAS_MACHINE_CONFIG:configPath};
        const compile = () => {
            json(configPath, profile);
            const compiled = spawnSync('cargo', ['build','--release','--features','bundled'], {cwd:root, env:buildEnv, windowsHide:true,
                encoding:'utf8', timeout:600000, maxBuffer:16*1024*1024});
            fs.appendFileSync(path.join(output,'compile.log'), (compiled.stdout || '') + (compiled.stderr || ''));
            if (compiled.status !== 0) throw new Error(compiled.error?.message || compiled.stderr || 'Cargo build failed');
            fs.copyFileSync(path.join(root,'target/release/webgl.dll'), binary);
        };
        progress('Compiling the self-contained native module without ANGLE DLL dependencies');
        compile();
        progress('Comparing renderer and generic font candidates with live Chrome pixels');
        const calibrate = backend => JSON.parse(run(process.execPath, [path.join(__dirname,'machine-child.cjs'),'calibrate',path.join(output,'machine-browser.json')],
            {env:{...process.env, CANVAS_TEST_MODULE:binary, CANVAS_DIAGNOSTICS:'1', CANVAS_RASTER_SURFACE:backend === 'raster' ? '1' : '0'}}));
        let calibration = calibrate('graphite');
        report.calibration = {graphite:calibration};
        if (!calibration.shapeMatches || calibration.unresolved.length) {
            const raster = calibrate('raster'); report.calibration.raster = raster;
            if (raster.shapeMatches && !raster.unresolved.length) { calibration = raster; profile.backend = 'raster'; }
        }
        if (!calibration.shapeMatches || calibration.unresolved.length) {
            throw new Error('This Chrome rendering environment is not matched by available Graphite/CPU configurations. See calibration results; no verified package was published.');
        }
        // If Graphite initialization fell back to software, record and persist that selection.
        if (profile.backend === 'graphite' && !calibration.diagnostics.graphiteSurfaces) profile.backend = 'raster';
        profile.genericFonts = calibration.genericFonts;
        profile.fallbackFont = calibration.genericFonts['sans-serif'];
        report.profile = profile;
        compile();
        const version = '0.1.0-local.' + stamp;
        json(path.join(candidate,'package.json'), {name:'canvas', version, description:'Canvas built and verified against this Windows machine Chrome',
            main:'canvas.node', os:['win32'], cpu:['x64'], engines:{node:'>=22'}, files:['canvas.node','environment.json','THIRD_PARTY_NOTICES.txt'],
            canvasBuild:{generator:'native-offscreen-canvas', stamp}, private:true});
        // Retain the ponyfill's license; no JS or external npm dependency is shipped.
        const notices = [['@petamoriken/float16',path.join(root,'node_modules/@petamoriken/float16/LICENSE')],['Skia',path.join(skia,'LICENSE')]];
        for (const name of ['dawn','harfbuzz','icu','libjpeg-turbo','libpng','libwebp','wuffs','zlib','partition_alloc','abseil-cpp']) {
            const directory = path.join(skia,'third_party/externals',name);
            for (const file of ['LICENSE','LICENSE.txt','LICENSE.md','COPYING','COPYING.txt','README.ijg','LICENSE-PNG.txt']) {
                if (fs.existsSync(path.join(directory,file))) notices.push([name+'/'+file,path.join(directory,file)]);
            }
        }
        fs.writeFileSync(path.join(candidate,'THIRD_PARTY_NOTICES.txt'),notices.map(([name,file]) => name+'\n\n'+fs.readFileSync(file,'utf8')).join('\n\n----------------\n\n'));
        progress('Running the complete live comparison against the candidate binary');
        report.verification = await require('./verify-machine.cjs')({binary, output});
        if (report.verification.chromeVersion !== report.chrome.version || report.verification.captures.some(c => c.connectionId !== report.chrome.connectionId))
            throw new Error('Chrome/session changed since calibration');
        if (!report.verification.browserVerified) throw new Error('Live Chrome comparison failed; see verification.json');
        report.nativeRuns = fs.readdirSync(path.join(output,'native-diagnostics')).map(file =>
            JSON.parse(fs.readFileSync(path.join(output,'native-diagnostics',file))));
        progress('Testing require("canvas") and worker loading from an isolated consumer directory');
        const consumer = fs.mkdtempSync(path.join(os.tmpdir(),'canvas-consumer-'));
        const installed = path.join(consumer,'node_modules/canvas');
        try {
            fs.mkdirSync(installed,{recursive:true});
            fs.cpSync(candidate,installed,{recursive:true});
            const cleanEnv = {...process.env, PATH:path.join(process.env.WINDIR,'System32')};
            delete cleanEnv.NODE_OPTIONS; delete cleanEnv.NODE_PATH;
            report.packageSmoke = JSON.parse(run(process.execPath,[path.join(__dirname,'package-smoke.cjs'),consumer],{cwd:consumer,env:cleanEnv}));
        } finally {
            // Only remove the exact temporary directory created above, after checking its parent and prefix.
            if (path.dirname(consumer) === os.tmpdir() && path.basename(consumer).startsWith('canvas-consumer-')) fs.rmSync(consumer,{recursive:true});
        }
        report.sources = Object.fromEntries(['index.js','src/dommatrix.js','src/webgl_native.rs','src/skia_backend.cpp','src/render_diagnostics.h','build.rs','Cargo.lock','package-lock.json'].map(file => [file,hash(path.join(root,file))]));
        report.binarySHA256 = hash(binary);
        report.status = 'verified'; report.finishedAt = new Date().toISOString();
        json(path.join(candidate,'environment.json'), report);
        json(path.join(output,'environment.json'), report);
        const dist = path.join(root,'dist'); fs.mkdirSync(dist,{recursive:true});
        const destination = path.join(dist,'canvas');
        const npmCLI = process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
        const packed = JSON.parse(run(process.execPath,[npmCLI,'pack',candidate,'--ignore-scripts','--json','--pack-destination',dist]));
        if (fs.existsSync(destination)) {
            const archive = path.join(dist,'archive'); fs.mkdirSync(archive,{recursive:true});
            fs.renameSync(destination,path.join(archive,'canvas-'+stamp));
        }
        fs.renameSync(candidate,destination);
        const localInstall = path.join(root,'node_modules/canvas');
        if (fs.existsSync(localInstall)) {
            const previous = JSON.parse(fs.readFileSync(path.join(localInstall,'package.json'),'utf8'));
            if (previous.canvasBuild?.generator !== 'native-offscreen-canvas') throw new Error('node_modules/canvas already contains another package. Verified output is in dist; install it explicitly.');
            fs.renameSync(localInstall,path.join(output,'previous-local-canvas'));
        }
        fs.cpSync(destination,localInstall,{recursive:true});
        progress('Verified package: ' + destination);
        progress('Installed locally: const {OffscreenCanvas} = require("canvas")');
        progress('Install in a consumer project: npm install "' + path.join(dist,packed[0].filename) + '"');
        progress('Environment and verification report: ' + path.join(destination,'environment.json'));
        console.log(JSON.stringify({status:report.status, chromeVersion:report.chrome.version, backend:profile.backend,
            cases:report.verification.tested, demoMismatches:report.verification.demoMismatches, package:destination}));
    } catch (error) {
        report.status='failed'; report.error=error.stack; report.finishedAt=new Date().toISOString();
        json(path.join(output,'environment.json'),report);
        throw error;
    } finally {
        fs.closeSync(fd); fs.unlinkSync(lock);
    }
}
main().catch(error => {console.error('[canvas] ' + error.message); console.error('Build evidence: ' + output); process.exitCode=1;});
