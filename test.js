'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const runCases = require('./tests/browser-cases');
const decodePng = require('./tests/png-reader');
const { OffscreenCanvas } = require('./');
const { capture: captureCDP } = require('./capture-cdp.cjs');

function run(command, args) {
    const result = spawnSync(command, args, {cwd:__dirname, encoding:'utf8', maxBuffer:16*1024*1024, timeout:90000, windowsHide:true});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Child process failed').trim());
    return result.stdout;
}
async function capture(script, name) {
    const result=await captureCDP({script,outputName:'cdp-'+name});
    assert.equal(result.browserMode,'user-chrome-cdp');
    const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,script))).digest('hex').toUpperCase();
    assert.equal(result.scriptSHA256,hash,'Browser result must match current test source');
    return result;
}
async function main() {
    fs.mkdirSync(path.join(__dirname,'out'),{recursive:true});
    const local=await runCases(OffscreenCanvas,decodePng);
    const red=[255,0,0,255],clear=[0,0,0,0];
    for(const [name,value] of Object.entries(local))assert.ok(!value?.unexpectedError,name+': '+value?.message);
    assert.deepEqual(local.gradientLive,{same:true,pixel:red});
    assert.ok(local.gradientSavedReference.fill && local.gradientSavedReference.stroke);
    assert.deepEqual(local.radialGradientValidation,['IndexSizeError','IndexSizeError','IndexSizeError',null,'TypeError','TypeError','TypeError']);
    assert.deepEqual(local.gradientArgumentValidation,Array(4).fill('TypeError'));
    for(const sample of local.conicFullTurns) assert.deepEqual(sample,local.conicFullTurns[0]);
    assert.deepEqual(local.conicRotations[2],local.conicRotations[3]);
    assert.notDeepEqual(local.conicRotations[0],local.conicRotations[1]);
    assert.deepEqual(local.globalAlphaValidation,{invalid:Array(6).fill(0.5),coerced:0.25,symbolError:'TypeError',after:0.25});
    assert.deepEqual(local.drawImageAlphaState,[clear,[255,0,0,128],[255,0,0,128],red]);
    assert.deepEqual(local.drawImageCompositeState,[clear,red]);
    assert.deepEqual(local.strokeHitCurrentWidth,[true,true,false]);
    assert.equal(local.strokeHitSavedState,true);
    assert.deepEqual(local.strokeHitCapsAndDash,{butt:false,round:true,dash:[true,false],offset:[false,true]});
    for(const row of local.contextModes) {
        assert.ok(row.created && row.same,row.mode);
        assert.deepEqual(row.blocked,[true,true,true],row.mode);
    }
    assert.deepEqual(local.contextInvalidNames,{invalid:Array(5).fill('TypeError'),missing:'TypeError',after:true});
    assert.ok(local.resize.same && local.resize.canvas && local.resizeZeroAndBack.same);
    assert.deepEqual(local.resetClipTransform.outside,red);
    assert.deepEqual(local.pathTranslateAfterCreation,[red,clear]);
    assert.deepEqual(local.pathMixedTransforms,[red,red,clear]);
    assert.deepEqual(local.pathHitTest,[false,true]);
    assert.notDeepEqual(local.arcCW,local.arcCCW);
    assert.notDeepEqual(local.ellipseCW,local.ellipseCCW);
    assert.equal(local.negativeRead.width,2);
    assert.deepEqual(local.readErrors,['IndexSizeError','IndexSizeError','TypeError','TypeError']);
    assert.deepEqual(local.bitmapTransfer.transferred,red);
    assert.deepEqual(local.bitmapTransfer.empty,clear);
    assert.equal(local.bitmapTransfer.style,'#ff0000');
    assert.equal(local.bitmapTransfer.translation,2);
    assert.equal(local.bitmapTransfer.restored,0);
    for(const name of ['blob-default','blob-image/png','blob-image/unsupported']) {
        assert.equal(local[name].type,'image/png');assert.deepEqual(local[name].decoded,Array(4).fill(red).flat());assert.deepEqual(local[name].after,red);
    }
    run(process.execPath,['--expose-gc',path.join(__dirname,'tests/gradient-gc.cjs')]);
    const localOutput=run(process.execPath,[path.join(__dirname,'data.js')]);
    const demo=localOutput.trim().split(/\r?\n/).at(-1).split(',').map(Number);
    assert.equal(demo.length,9216);assert.ok(demo.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
    fs.writeFileSync(path.join(__dirname,'out/local-cases.json'),JSON.stringify(local));
    const report={localCases:Object.keys(local).length,gradientGC:true,demoValues:demo.length,browserVerified:false};
    if(!process.argv.includes('--local')) {
        const browser=await capture('tests/browser-cases.js','compatibility');
        const failures=[];
        for(const name of Object.keys(local)) {
            try{assert.deepEqual(local[name],browser.value[name]);}catch{failures.push(name);}
        }
        const browserDemo=await capture('demo.js','demo');
        const mismatches=demo.filter((value,index)=>value!==browserDemo.value[index]).length;
        Object.assign(report,{browserMode:browser.browserMode,chromeVersion:browser.chromeVersion,caseRunId:browser.runId,demoRunId:browserDemo.runId,caseFailures:failures,demoMismatches:mismatches,browserVerified:failures.length===0&&mismatches===0&&browserDemo.value.length===demo.length});
        fs.writeFileSync(path.join(__dirname,'out/cdp-verification-result.json'),JSON.stringify(report,null,2)+'\n');
        assert.deepEqual(failures,[],'Browser compatibility differences');
        assert.equal(browserDemo.value.length,demo.length);assert.equal(mismatches,0,'Demo pixels differ from the existing Chrome over CDP');
    }
    console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
