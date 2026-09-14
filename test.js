'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const runCases = require('./tests/browser-cases');
const runAdditionalCases = require('./tests/additional-cases');
const runThirdRoundCases = require('./tests/third-round-cases');
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
    // Keep native panic regressions inside a disposable process.
    const unicodeColor=JSON.parse(run(process.execPath,[path.join(__dirname,'tests/unicode-color-case.js')]).trim());
    assert.deepEqual(unicodeColor,{style:'#ff0000',pixel:[255,0,0,255]});
    const local=await runCases(OffscreenCanvas,decodePng);
    const red=[255,0,0,255],clear=[0,0,0,0];
    const additional=runAdditionalCases(OffscreenCanvas);
    const thirdRound=runThirdRoundCases(OffscreenCanvas);
    const thirdErrors={textSymbol:'TypeError',measureTextMissing:'TypeError',drawImageMissing:'TypeError',drawImageFourArguments:'TypeError',drawImageNull:'TypeError',drawImageFakeSource:'TypeError',drawImageZeroSource:'InvalidStateError',drawImageClosedBitmap:'InvalidStateError',patternInvalidRepetition:'SyntaxError',patternZeroSource:'InvalidStateError',createImageDataMissing:'TypeError',createImageDataFakeSource:'TypeError',putImageDataMissing:'TypeError',putImageDataFakeSource:'TypeError',putImageDataInfiniteOrigin:'TypeError',invalidFillRule:'TypeError',invalidClipRule:'TypeError',hitTestMissing:'TypeError',hitTestInvalidRule:'TypeError',roundRectMissing:'TypeError',matrixContradictory2D:'TypeError'};
    for(const [name,result] of Object.entries(thirdRound)){
        if(thirdErrors[name])assert.equal(result.error,thirdErrors[name],name);
        else assert.ok(Object.hasOwn(result,'value'),name+': '+result.error);
    }
    assert.equal(thirdRound.numericText.value.painted,true);
    assert.equal(thirdRound.textObjectConversion.value.calls,1);
    assert.equal(thirdRound.textWhitespace.value.space,thirdRound.textWhitespace.value.tab);
    assert.equal(thirdRound.textWhitespace.value.space,thirdRound.textWhitespace.value.newline);
    assert.deepEqual(thirdRound.textActualBounds.value,{left:0,right:10,ascent:9,descent:0});
    assert.equal(thirdRound.fontPointUnits.value,'16px Arial');
    assert.equal(thirdRound.fontDuplicateStyle.value,'12px Arial');
    assert.equal(thirdRound.fontMalformedFamily.value,'12px Arial');
    assert.equal(thirdRound.textMaxWidthConversionOrder.value,1);
    assert.deepEqual(thirdRound.drawImageShadow.value,[red,[0,0,255,255]]);
    assert.deepEqual(thirdRound.roundRectIterableRadii.value,[false,true]);
    assert.deepEqual(thirdRound.roundRectRadiusGetter.value,{x:1,y:1,inside:true});
    assert.deepEqual(thirdRound.colorModernSyntax.value,{style:'rgba(255, 0, 0, 0.5)',pixel:[255,0,0,127]});
    assert.equal(thirdRound.modernColorInvalid.value,'#ff0000');
    const expectedErrors={zeroCreateImageData:'IndexSizeError',negativeArcTo:'IndexSizeError',missingScaleArgument:'TypeError',missingCanvasDimensions:'TypeError',undefinedCanvasDimension:'TypeError'};
    for(const [name,result] of Object.entries(additional)) {
        if(expectedErrors[name])assert.equal(result.error,expectedErrors[name],name);
        else assert.ok(Object.hasOwn(result,'value'),name+': '+result.error);
    }
    assert.deepEqual(additional.emptyClip.value,clear);
    assert.deepEqual(additional.setTransformObject.value,[2,0,0,3,4,5]);
    assert.deepEqual(additional.setTransformNoArgs.value,[1,0,0,1,0,0]);
    assert.deepEqual(additional.invalidLineDash.value,[3,4]);
    assert.deepEqual(additional.copyFillOutside.value,[[0,0,255,255],clear]);
    assert.deepEqual(additional.copyEmptyOperations.value,[clear,red,red]);
    assert.deepEqual(additional.copyOutsideSource.value,Array(2).fill([0,0,255,255]));
    assert.deepEqual(additional.nineArgumentImageCrop.value,[[64,0,191,255],[0,0,255,255],clear,clear]);
    assert.deepEqual(additional.negativeImageCropOrder.value,[red,[0,0,255,255],clear]);
    assert.deepEqual(additional.partialImageSource.value,[clear,red,clear]);
    assert.deepEqual(additional.negativeCreateImageData.value,{width:2,height:3,length:24});
    assert.deepEqual(additional.putNegativeDirtySize.value,red);
    assert.deepEqual(additional.putFractionalOrigin.value,red);
    assert.deepEqual(additional.imageSmoothingState.value,{before:true,after:true});
    assert.deepEqual(additional.opaqueContext.value.before,[0,0,0,255]);
    assert.deepEqual(additional.opaqueContext.value.after,[0,0,0,255]);
    assert.equal(additional.opaqueContext.value.attributes.alpha,false);
    assert.equal(additional.fillTextMaxWidth.value.pixelsPastMaxWidth,0);
    assert.deepEqual(additional.invalidTextWidth.value,[false,false,false,false,true]);
    assert.deepEqual(additional.fractionalCanvasDimension.value,{before:[2,3],after:[0,3]});
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
    fs.writeFileSync(path.join(__dirname,'out/cdp-additional-review-local.json'),JSON.stringify(additional,null,2)+'\n');
    fs.writeFileSync(path.join(__dirname,'out/cdp-third-round-local.json'),JSON.stringify(thirdRound,null,2)+'\n');
    const report={localCases:Object.keys(local).length,additionalCases:Object.keys(additional).length,thirdRoundCases:Object.keys(thirdRound).length,unicodeColor:true,totalCases:Object.keys(local).length+Object.keys(additional).length+Object.keys(thirdRound).length+1,gradientGC:true,demoValues:demo.length,browserVerified:false};
    if(!process.argv.includes('--local')) {
        const browser=await capture('tests/browser-cases.js','compatibility');
        const failures=[];
        for(const name of Object.keys(local)) {
            try{assert.deepEqual(local[name],browser.value[name]);}catch{failures.push(name);}
        }
        assert.deepEqual(Object.keys(browser.value).sort(),Object.keys(local).sort());
        const browserAdditional=await capture('tests/additional-cases.js','additional-review');
        assert.deepEqual(Object.keys(browserAdditional.value).sort(),Object.keys(additional).sort());
        const additionalFailures=[];
        for(const name of Object.keys(additional)) {
            try{assert.deepEqual(additional[name],browserAdditional.value[name]);}catch{additionalFailures.push(name);}
        }
        const browserThird=await capture('tests/third-round-cases.js','third-round');
        assert.deepEqual(Object.keys(browserThird.value).sort(),Object.keys(thirdRound).sort());
        const thirdRoundFailures=[];
        for(const name of Object.keys(thirdRound)){
            try{assert.deepEqual(thirdRound[name],browserThird.value[name]);}catch{thirdRoundFailures.push(name);}
        }
        const browserUnicode=await capture('tests/unicode-color-case.js','unicode-color');
        let unicodeColorMatches=false;
        try{assert.deepEqual(unicodeColor,browserUnicode.value);unicodeColorMatches=true;}catch{}
        const browserDemo=await capture('demo.js','demo');
        const mismatches=demo.filter((value,index)=>value!==browserDemo.value[index]).length;
        Object.assign(report,{browserMode:browser.browserMode,chromeVersion:browser.chromeVersion,caseRunId:browser.runId,additionalRunId:browserAdditional.runId,demoRunId:browserDemo.runId,caseFailures:failures,additionalFailures,demoMismatches:mismatches,browserVerified:failures.length===0&&additionalFailures.length===0&&mismatches===0&&browserDemo.value.length===demo.length});
        Object.assign(report,{thirdRoundRunId:browserThird.runId,unicodeColorRunId:browserUnicode.runId,thirdRoundFailures,unicodeColorMatches,browserVerified:report.browserVerified&&thirdRoundFailures.length===0&&unicodeColorMatches});
        fs.writeFileSync(path.join(__dirname,'out/cdp-verification-result.json'),JSON.stringify(report,null,2)+'\n');
        assert.deepEqual(failures,[],'Browser compatibility differences');
        assert.deepEqual(additionalFailures,[],'Additional browser compatibility differences');
        assert.deepEqual(thirdRoundFailures,[],'Third-round browser compatibility differences');
        assert.equal(unicodeColorMatches,true,'Unicode color handling differs');
        assert.equal(browserDemo.value.length,demo.length);assert.equal(mismatches,0,'Demo pixels differ from the existing Chrome over CDP');
    }
    console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
