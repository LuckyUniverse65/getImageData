'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex').toUpperCase();
if(process.argv.includes('--local-child')){
    Promise.resolve().then(()=>require('./fourth-round-cases').runTwelfthRoundCases(require('..').OffscreenCanvas))
        .then(value=>console.log(JSON.stringify(value))).catch(e=>{console.error(e);process.exitCode=1;});
}else{
    const browser=JSON.parse(fs.readFileSync(path.join(root,'out/cdp-twelfth-round-browser.json'),'utf8'));
    assert.equal(browser.browserMode,'user-chrome-cdp');assert.equal(browser.script,'tests/fourth-round-cases.js');
    assert.equal(browser.scriptSHA256,hash(browser.script));
    const child=spawnSync(process.execPath,[__filename,'--local-child'],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,windowsHide:true});
    assert.equal(child.status,0,child.stderr||String(child.error));
    const local=JSON.parse(child.stdout.trim()),reference=browser.value.twelfthRound;
    assert.deepEqual(Object.keys(local).sort(),Object.keys(reference).sort());
    const matches=[],differences=[];
    for(const name of Object.keys(local)){
        try{assert.deepEqual(local[name],reference[name]);matches.push(name);}
        catch{differences.push({name,local:local[name],browser:reference[name]});}
    }
    const {value,...capture}=browser;
    const report={tested:Object.keys(local).length,matched:matches.length,differing:differences.length,localExitCode:child.status,capture,sha256:Object.fromEntries(['index.js','src/webgl_native.rs','src/canvas_css.rs','src/skia_backend.cpp','webgl.node',browser.script].map(p=>[p,hash(p)])),matches,differences};
    fs.writeFileSync(path.join(root,'out/cdp-twelfth-round-local.json'),JSON.stringify(local,null,2)+'\n');
    fs.writeFileSync(path.join(root,'out/cdp-twelfth-round-diff.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({tested:report.tested,matched:matches.length,differing:differences.length,runId:browser.runId,cases:differences.map(d=>d.name)}));
    process.exitCode=differences.length?1:0;
}
