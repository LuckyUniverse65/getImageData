'use strict';
// Capture tests/additional-cases.js over CDP in the existing Chrome before running.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').toUpperCase();
const capture = read('out/cdp-additional-review-browser.json');
assert.equal(capture.browserMode, 'user-chrome-cdp');
assert.equal(capture.script, 'tests/additional-cases.js');
assert.equal(capture.scriptSHA256, hash(capture.script), 'Capture source differs from current cases');
const local = require('./additional-cases')(require('..').OffscreenCanvas);
assert.deepEqual(Object.keys(local).sort(), Object.keys(capture.value).sort());
const matches = [], differences = [];
for (const name of Object.keys(local)) {
    try { assert.deepEqual(local[name], capture.value[name]); matches.push(name); }
    catch { differences.push({ name, local: local[name], browser: capture.value[name] }); }
}
const {value, ...browserCapture} = capture;
const report = {
    tested: Object.keys(local).length, matched: matches.length, differing: differences.length,
    browserCapture, nodeVersion: process.version, nativeSHA256: hash('webgl.node'),
    matches, differences
};
fs.writeFileSync(path.join(root, 'out/cdp-additional-review-local.json'), JSON.stringify(local, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'out/cdp-additional-review-diff.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({tested: report.tested, matched: report.matched, differing: report.differing,
    runId: capture.runId, capturedAt: capture.capturedAt, cases: differences.map(d => d.name)}));
// This diagnostic deliberately reports failure until the detected differences are fixed.
process.exitCode = differences.length ? 1 : 0;
