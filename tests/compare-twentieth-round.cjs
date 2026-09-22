'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const matches=require('./nineteenth-comparison.cjs');
const cases=require('./fourth-round-cases');
const root=path.resolve(__dirname,'..');
if(process.argv[2]==='--allocation-child') {
    console.log(JSON.stringify(cases.runTwentiethAllocationCase(require('..').OffscreenCanvas,process.argv[3])));
} else {
    const local=cases.runTwentiethRoundCases(require('..').OffscreenCanvas);
    const allocations={};
    for(const name of ['putLast','readFirst','resizeWide']) {
        const child=spawnSync(process.execPath,[__filename,'--allocation-child',name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000});
        allocations[name]=child.status===0?JSON.parse(child.stdout):{processFailure:{status:child.status,signal:child.signal,error:child.error?.message,stderr:child.stderr}};
    }
    const browser=JSON.parse(fs.readFileSync(path.join(root,'out/cdp-twentieth-review-browser.json'),'utf8'));
    const hash=file=>createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
    assert.equal(browser.scriptSHA256.toLowerCase(),hash('tests/fourth-round-cases.js'));
    const actual={...local,...Object.fromEntries(Object.entries(allocations).map(([k,v])=>['allocation_'+k,v]))};
    const expected={...browser.value.twentiethRound,...Object.fromEntries(Object.entries(browser.value.twentiethAllocation).map(([k,v])=>['allocation_'+k,v]))};
    assert.deepEqual(Object.keys(actual),Object.keys(expected));
    const differences=[];
    for(const name of Object.keys(actual)) {
        if(matches(actual[name],expected[name]))continue;
        const first=[];let count=0,maxAbsoluteDifference=0;
        function walk(a,b,p='') {
            if(a&&b&&typeof a==='object'&&typeof b==='object')for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],p+'.'+key);
            else if(!Object.is(a,b)) {count++;if(typeof a==='number'&&typeof b==='number')maxAbsoluteDifference=Math.max(maxAbsoluteDifference,Math.abs(a-b));if(first.length<8)first.push({path:p,local:a,browser:b});}
        }
        walk(actual[name],expected[name]);differences.push({name,count,maxAbsoluteDifference,first});
    }
    const {value,...capture}=browser;
    const report={tested:Object.keys(actual).length,matched:Object.keys(actual).length-differences.length,differing:differences.length,
        processCrashes:Object.values(allocations).filter(v=>v.processFailure).length,floatColorAbsoluteTolerance:1e-5,capture,allocations,
        sha256:Object.fromEntries(['index.js','src/webgl_native.rs','src/skia_backend.cpp','webgl.node','tests/fourth-round-cases.js','tests/compare-twentieth-round.cjs'].map(file=>[file,hash(file)])),differences};
    fs.writeFileSync(path.join(root,'out/twentieth-local.json'),JSON.stringify(actual));
    fs.writeFileSync(path.join(root,'out/twentieth-review-diff.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({...report,allocations:undefined,sha256:undefined,capture:undefined,differences:differences.map(d=>d.name)}));
    process.exitCode=differences.length?1:0;
}
