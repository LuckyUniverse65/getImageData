'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),script='tests/unicode-color-case.js';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex').toUpperCase();
const browser=JSON.parse(fs.readFileSync(path.join(root,'out/cdp-unicode-color-browser.json'),'utf8'));
assert.equal(browser.browserMode,'user-chrome-cdp');
assert.equal(browser.script,script);
assert.equal(browser.scriptSHA256,hash(script));
// A native panic must terminate only this disposable child, never the test runner.
const child=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024});
const local={status:child.status,signal:child.signal,error:child.error?.message,stdout:child.stdout,stderr:child.stderr};
let matched=false;
if(child.status===0&&!child.error){try{assert.deepEqual(JSON.parse(child.stdout.trim()),browser.value);matched=true;}catch{}}
const report={matched,nodeVersion:process.version,nativeSHA256:hash('webgl.node'),local,browser};
fs.writeFileSync(path.join(root,'out/cdp-unicode-color-diff.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({matched,status:child.status,signal:child.signal,error:child.error?.message,browser:browser.value}));
process.exitCode=matched?0:1;
