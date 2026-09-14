'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex').toUpperCase();
const browser=read('out/cdp-fourth-round-browser.json');
assert.equal(browser.browserMode,'user-chrome-cdp');
assert.equal(browser.script,'tests/fourth-round-cases.js');
assert.equal(browser.scriptSHA256,hash(browser.script));
const local=require('./fourth-round-cases')(require('..').OffscreenCanvas);
assert.deepEqual(Object.keys(local).sort(),Object.keys(browser.value).sort());
const matches=[],differences=[];
for(const name of Object.keys(local)){
    try{assert.deepEqual(local[name],browser.value[name]);matches.push(name);}
    catch{differences.push({name,local:local[name],browser:browser.value[name]});}
}
const {value,...capture}=browser;
const report={tested:Object.keys(local).length,matched:matches.length,differing:differences.length,capture,
    sha256:Object.fromEntries(['index.js','src/webgl_native.rs','src/canvas_css.rs','src/skia_backend.cpp','webgl.node',browser.script].map(p=>[p,hash(p)])),matches,differences};
fs.writeFileSync(path.join(root,'out/cdp-fourth-round-local.json'),JSON.stringify(local,null,2)+'\n');
fs.writeFileSync(path.join(root,'out/cdp-fourth-round-diff.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tested:report.tested,matched:matches.length,differing:differences.length,runId:browser.runId,cases:differences.map(d=>d.name)}));
process.exitCode=differences.length?1:0;
