'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
assert.equal(process.platform, 'linux');
process.env.CANVAS_DIAGNOSTICS = '1';
const entry = path.resolve(process.argv[2]);
const api = require(entry);
const directory = path.dirname(entry);
const maps = fs.readFileSync('/proc/self/maps', 'utf8');
assert.ok(maps.includes(path.join(directory, 'linux-libs/libfontconfig.so.1')), 'Fontconfig must load from the installed package');
for (const [font, text] of [['DejaVu Sans', 'Canvas العربية'], ['Noto Sans CJK SC', '中文绘图测试']]) {
    const canvas = new api.OffscreenCanvas(240, 48);
    const ctx = canvas.getContext('2d');
    ctx.font = `24px "${font}"`;
    ctx.fillText(text, 2, 32);
    assert.ok(ctx.measureText(text).width > 0);
    const pixels = ctx.getImageData(0, 0, 240, 48).data;
    assert.ok(Array.from(pixels).some((value, i) => i % 4 === 3 && value > 0));
}
const diagnostics = JSON.parse(api.getRenderDiagnostics());
assert.ok(diagnostics.usedFonts.some(f => f.family === 'Noto Sans CJK SC'), 'Chinese text must use the real CJK font');
const result = {fontconfigFromPackage:true, textRendered:true, cjkFontUsed:true,
    nodeVersion:process.versions.node, glibcVersion:process.report.getReport().header.glibcVersionRuntime,
    osRelease:fs.readFileSync('/etc/os-release', 'utf8'),
    availableFamilies:diagnostics.availableFontFamilies, usedFonts:diagnostics.usedFonts};
if (process.argv[3]) {
    const previous = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    previous.bundledRuntime = result;
    fs.writeFileSync(process.argv[3], JSON.stringify(previous) + '\n');
}
console.log(JSON.stringify(result));
