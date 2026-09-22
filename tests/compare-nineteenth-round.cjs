'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const matches = require('./nineteenth-comparison.cjs');
const root = path.resolve(__dirname, '..');
const local = require('./fourth-round-cases').runNineteenthRoundCases(require('..').OffscreenCanvas);
if (process.argv.includes('--local-child')) {
    console.log(JSON.stringify(local));
} else {
    const browser = JSON.parse(fs.readFileSync(path.join(root, 'out/cdp-nineteenth-round-browser.json'), 'utf8'));
    const hash = createHash('sha256').update(fs.readFileSync(path.join(root, 'tests/fourth-round-cases.js'))).digest('hex').toUpperCase();
    assert.equal(browser.scriptSHA256, hash, 'Browser capture must use the current test source');
    const reference = browser.value.nineteenthRound;
    assert.deepEqual(Object.keys(local), Object.keys(reference));
    const exact = Object.keys(local).filter(name => isDeepStrictEqual(local[name], reference[name])).length;
    const differences = Object.keys(local).filter(name => !matches(local[name], reference[name]))
        .map(name => ({name,local:local[name],browser:reference[name]}));
    fs.writeFileSync(path.join(root, 'out/nineteenth-local.json'), JSON.stringify(local));
    const report = {tested:Object.keys(local).length,matched:Object.keys(local).length-differences.length,exact,
        floatColorAbsoluteTolerance:1e-5,
        toleratedCases:Object.keys(local).filter(name=>!isDeepStrictEqual(local[name],reference[name])&&matches(local[name],reference[name])),
        differing:differences.length,chromeVersion:browser.chromeVersion,runId:browser.runId,differences};
    fs.writeFileSync(path.join(root, 'out/cdp-nineteenth-round-diff.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({...report,differences:differences.map(d=>d.name)}));
    process.exitCode = differences.length ? 1 : 0;
}
