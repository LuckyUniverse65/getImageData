'use strict';
// Run in a fresh process with CANVAS_DIAGNOSTICS=1, after the full API test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
assert.equal(process.platform, 'darwin');
process.env.CANVAS_DIAGNOSTICS = '1';
const api = require(path.resolve(process.argv[2]));
const canvas = new api.OffscreenCanvas(400, 80);
const ctx = canvas.getContext('2d');
ctx.font = '24px sans-serif';
for (const text of ['Canvas Hello', '中文绘图']) {
    ctx.clearRect(0, 0, 400, 80);
    assert.ok(ctx.measureText(text).width > 0);
    ctx.fillText(text, 4, 40);
    assert.ok(ctx.getImageData(0, 0, 400, 80).data.some((value, i) => i % 4 === 3 && value > 0));
}
const diagnostics = JSON.parse(api.getRenderDiagnostics());
assert.equal(diagnostics.defaultBackend, 'raster');
assert.ok(diagnostics.rasterSurfaces > 0);
assert.ok(diagnostics.usedFonts.length > 0);
assert.ok(diagnostics.usedFonts.some(font => /PingFang|Heiti|Songti|Hiragino|Kaiti/i.test(font.family)), 'Chinese must use a system CJK font');
const result = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
assert.equal(result.passed, true);
assert.equal(result.platform, 'darwin');
result.macOS = {arch: process.arch, version: execFileSync('sw_vers', ['-productVersion'], {encoding:'utf8'}).trim(),
    nodeVersion: process.versions.node, backend: 'skia-raster', fontBackend: 'CoreText',
    textRendered: true, cjkFontUsed: true, usedFonts: diagnostics.usedFonts};
fs.writeFileSync(process.argv[3], JSON.stringify(result) + '\n');
console.log(JSON.stringify(result.macOS));
