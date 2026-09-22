'use strict';
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const matches=require('./nineteenth-comparison.cjs');
const {runLocal}=require('./continuation-suites.cjs');
const browser=JSON.parse(fs.readFileSync('out/cdp-twentieth-review-browser.json'));
assert.equal(browser.scriptSHA256.toLowerCase(),createHash('sha256').update(fs.readFileSync('tests/fourth-round-cases.js')).digest('hex'));
(async()=>{
const reports={};
for(const [key,actual] of Object.entries(await runLocal(require('..').OffscreenCanvas))) {
    const expected=browser.value[key];
    assert.deepEqual(Object.keys(actual),Object.keys(expected));
    const differences=Object.keys(actual).filter(k=>!matches(actual[k],expected[k])).map(name=>({name,actual:actual[name],expected:expected[name]}));
    reports[key]={tested:Object.keys(actual).length,exact:Object.keys(actual).filter(k=>require('node:util').isDeepStrictEqual(actual[k],expected[k])).length,differences};
    console.log(JSON.stringify({suite:key,tested:Object.keys(actual).length,differing:differences.length,names:differences.map(d=>d.name)}));
    if(differences.length)process.exitCode=1;
}
fs.writeFileSync('out/continuation-diff.json',JSON.stringify(reports,null,2)+'\n');

})().catch(e=>{console.error(e);process.exitCode=1;});
