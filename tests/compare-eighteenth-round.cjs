'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {isDeepStrictEqual} = require('node:util');
const root = path.resolve(__dirname, '..');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const local = require('./fourth-round-cases').runEighteenthRoundCases(require('..').OffscreenCanvas);
if (!process.argv.includes('--local-child')) fs.writeFileSync(path.join(root, 'out/cdp-eighteenth-round-local.json'), JSON.stringify(local) + '\n');
if (process.argv.includes('--local-child')) {
    console.log(JSON.stringify(local));
} else if (process.argv.includes('--local')) {
    console.log(JSON.stringify({tested: Object.keys(local).length, errors: Object.entries(local).filter(([, v]) => v.error)}));
} else {
    const browser = JSON.parse(fs.readFileSync(path.join(root, 'out/cdp-eighteenth-round-browser.json'), 'utf8'));
    assert.equal(browser.scriptSHA256.toLowerCase(), hash('tests/fourth-round-cases.js'));
    assert.equal(browser.browserMode, 'user-chrome-cdp');
    const reference = browser.value.eighteenthRound;
    assert.deepEqual(Object.keys(local), Object.keys(reference));
    const differences = [];
    for (const name of Object.keys(local)) {
        if (isDeepStrictEqual(local[name], reference[name])) continue;
        const actual = local[name].value, expected = reference[name].value;
        if (Array.isArray(actual) && Array.isArray(expected)) {
            let mismatches = 0; const first = [];
            for (let i = 0; i < Math.max(actual.length, expected.length); i++) if (actual[i] !== expected[i]) {
                mismatches++;
                if (first.length < 4) first.push({index: i, x: Math.floor(i / 4) % 32, y: Math.floor(i / 128), channel: i % 4, local: actual[i], browser: expected[i]});
            }
            differences.push({name, mismatches, first});
        } else differences.push({name, local: local[name], browser: reference[name]});
    }
    const {value, ...capture} = browser;
    const report = {tested: Object.keys(local).length, matched: Object.keys(local).length - differences.length, differing: differences.length, capture,
        sha256: Object.fromEntries(['demo.js', 'index.js', 'src/webgl_native.rs', 'src/skia_backend.cpp', 'webgl.node', 'tests/fourth-round-cases.js'].map(file => [file, hash(file)])), differences};
    fs.writeFileSync(path.join(root, 'out/cdp-eighteenth-round-diff.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
    process.exitCode = differences.length ? 1 : 0;
}
