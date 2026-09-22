'use strict';
// One-time upstream setup. Normal builds use npm run build:canvas instead.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
function configuration() {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 is required');
    const vswhere = path.join(process.env['ProgramFiles(x86)'],'Microsoft Visual Studio/Installer/vswhere.exe');
    const result = spawnSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true});
    if (result.status !== 0 || !result.stdout.trim()) throw new Error('Visual Studio C++ Build Tools not found');
    const vc = path.join(result.stdout.trim(),'VC');
    const toolset = fs.readFileSync(path.join(vc,'Auxiliary/Build/Microsoft.VCToolsVersion.default.txt'),'utf8').trim();
    const sdkRoot = path.join(process.env['ProgramFiles(x86)'],'Windows Kits/10/Include');
    const sdks = fs.readdirSync(sdkRoot).filter(name => /^10\.0\.\d+\.0$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if (!sdks.length) throw new Error('Windows 10/11 SDK not found');
    const clang = path.resolve(process.env.CANVAS_CLANG_ROOT || path.join(root,'third_party/chrome153-clang'));
    if (!fs.existsSync(path.join(clang,'bin/clang-cl.exe'))) throw new Error('Chromium Clang not found: ' + clang);
    const quote = value => JSON.stringify(value.replaceAll('\\','/'));
    return fs.readFileSync(path.join(root,'snapshot/windows-skia-args.gn'),'utf8') +
        `\nwin_vc = ${quote(vc)}\nwin_toolchain_version = ${quote(toolset)}\nwin_sdk_version = ${quote(sdks.at(-1))}\nclang_win = ${quote(clang)}\n`;
}
if (require.main === module) {
    const args = configuration();
    if (process.argv.includes('--print')) process.stdout.write(args);
    else {
        const skia = path.resolve(process.env.CANVAS_SKIA_ROOT || path.join(root,'third_party/skia'));
        const output = path.resolve(process.env.CANVAS_SKIA_OUT || path.join(skia,'out/canvas2d-clang'));
        fs.mkdirSync(output,{recursive:true});
        const file = path.join(output,'args.gn');
        if (fs.existsSync(file)) fs.copyFileSync(file,path.join(output,'args-before-'+Date.now()+'.gn'));
        fs.writeFileSync(file,args);
        const gn = [path.join(root,'third_party/gn/out/gn.exe'),path.join(skia,'bin/gn.exe')].find(fs.existsSync);
        if (!gn) throw new Error('GN not found; run python third_party/skia/bin/fetch-gn');
        const python = spawnSync('python',['-c','import sys; print(sys.executable)'],{encoding:'utf8',windowsHide:true});
        if (python.status !== 0) throw new Error('Python 3 must be available as python');
        const result = spawnSync(gn,['gen',output,'--script-executable='+python.stdout.trim()],{cwd:skia,stdio:'inherit',windowsHide:true});
        if (result.status !== 0) process.exit(result.status || 1);
        console.log('Generated ' + output + '; now run ninja -C this-directory');
    }
}
module.exports = configuration;
