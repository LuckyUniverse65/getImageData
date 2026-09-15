'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const runCases = require('./tests/browser-cases');
const runAdditionalCases = require('./tests/additional-cases');
const runThirdRoundCases = require('./tests/third-round-cases');
const runFourthRoundCases = require('./tests/fourth-round-cases');
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
    // These suites use the same source and live browser evaluation.
    if(script==='tests/fourth-round-cases.js')for(const round of ['fifth','sixth','seventh','eighth'])fs.writeFileSync(path.join(__dirname,`out/cdp-${round}-round-browser.json`),JSON.stringify(result)+'\n');
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
    const fourthRound=runFourthRoundCases(OffscreenCanvas);
    const fifthRound=JSON.parse(run(process.execPath,[path.join(__dirname,'tests/compare-fifth-round.cjs'),'--local-child']));
    const sixthRound=JSON.parse(run(process.execPath,[path.join(__dirname,'tests/compare-sixth-round.cjs'),'--local-child']));
    const seventhRound=JSON.parse(run(process.execPath,[path.join(__dirname,'tests/compare-seventh-round.cjs'),'--local-child']));
    const eighthRound=JSON.parse(run(process.execPath,[path.join(__dirname,'tests/compare-eighth-round.cjs'),'--local-child']));
    const eighthErrors=new Set(['canvasGetterReceiver_width','canvasGetterReceiver_height','canvasTransferReceiver','canvasBitmapReceiver']);
    for(const [name,result] of Object.entries(eighthRound)){
        if(eighthErrors.has(name))assert.equal(result.error,'TypeError',name);
        else assert.ok(Object.hasOwn(result,'value'),name+': '+result.error);
    }
    assert.deepEqual(eighthRound.canvasProxyReceiver.value,{failure:{error:'TypeError'},reads:0});
    for(const name of ['width','height'])assert.deepEqual(eighthRound['canvasSetterReceiver_'+name].value,{failure:{error:'TypeError'},conversions:0,resizes:0});
    assert.deepEqual(eighthRound.canvasBlobReceiverTiming.value,{mode:'returned',result:{error:'TypeError'}});
    for(const [name,result] of Object.entries(seventhRound))assert.ok(Object.hasOwn(result,'value'),name+': '+result.error);
    assert.equal(seventhRound['syntheticMetrics_Courier New_16'].value[0][0],21);
    assert.equal(seventhRound.syntheticMetrics_Tahoma_16.value[0][0],19.73876953125);
    assert.equal(seventhRound.syntheticMetrics_Consolas_16.value[0][0],18.1435546875);
    assert.equal(seventhRound.syntheticTinySizes.value[2][0],2.30224609375);
    assert.equal(seventhRound.syntheticFallbackList.value,21);
    const sixthErrors={imageSettingsPrimitive:'TypeError',cloneImageDataExtraUndefined:'TypeError',blobTypeThrows:'RangeError',blobQualityThrows:'RangeError',blobQualitySymbol:'TypeError',blobTypeSymbol:'TypeError',blobPrimitiveOptions:'TypeError',blobOptionResizesCanvas:'IndexSizeError',blobMissingContextControl:'InvalidStateError',blobQualityBigInt:'TypeError',blobNoContextZero:'IndexSizeError'};
    for(const [name,result] of Object.entries(sixthRound)){
        if(sixthErrors[name])assert.equal(result.error,sixthErrors[name],name);
        else assert.ok(Object.hasOwn(result,'value'),name+': '+result.error);
    }
    assert.deepEqual(sixthRound.heightConversionChangesWidth.value,[8,6]);
    assert.deepEqual(sixthRound.contextPrototypeGetter.value,{calls:1,alpha:false});
    assert.deepEqual(sixthRound.contextAttributesOwnProperties.value,{calls:1,alpha:false,own:true,writable:true,enumerable:true,configurable:true});
    assert.equal(sixthRound.fontGrammar_trailingDot.value,'14px Arial');
    assert.equal(sixthRound.fontGrammar_bareHyphen.value,'14px Arial');
    assert.equal(sixthRound.fontWeight950.value.width,39.984375);
    assert.equal(sixthRound.fontSmallCaps.value.width,27.4765625);
    assert.equal(sixthRound.fillStyleAlphaPrecision.value,'rgba(255, 0, 0, 0.12)');
    assert.deepEqual(sixthRound.blobOptionsOrder.value.log,['quality','type']);
    assert.deepEqual(sixthRound.blobConversionReentry.value.log,['quality','number','type','string']);
    assert.deepEqual(sixthRound.blobZeroOptionsOrder.value,{failure:{error:'IndexSizeError'},log:['type']});
    const fifthErrors={fillStyleSymbol:'TypeError',getterInvalidReceiver:'TypeError',gradientColorThrowBeforeRange:'RangeError',strokeExplicitUndefined:'TypeError',strokeExplicitNull:'TypeError',contextRepeatedOptionsThrow:'RangeError',contextInvalid_colorSpace:'TypeError',contextInvalid_colorType:'TypeError',imageDataInvalidColorSpace:'TypeError',imageDataInvalidPixelFormat:'TypeError',createImageDataInvalidSettings:'TypeError',imageDataFractionalZero:'IndexSizeError',patternCloseDuringConversion:'InvalidStateError',drawImageCloseDuringConversion:'InvalidStateError',roundRectBadIterator:'TypeError',dashBadIteratorResult:'TypeError',getterWrongNativeReceiver:'TypeError',imageSettingsBeforeZeroSize:'TypeError'};
    for(const [name,result] of Object.entries(fifthRound)){
        if(fifthErrors[name])assert.equal(result.error,fifthErrors[name],name);
        else assert.ok(Object.hasOwn(result,'value'),name+': '+result.error);
    }
    assert.deepEqual(fifthRound.contextRepeatedOptions.value,{same:true,calls:1,alpha:true});
    assert.deepEqual(fifthRound.contextEnumConversionOrder.value,['getColor','convertColor','getType']);
    assert.deepEqual(fifthRound.imageDataSettingsReadOrder.value,['colorSpace','pixelFormat']);
    assert.deepEqual(fifthRound.imageSettingsAfterCoordinates.value,{failure:{error:'TypeError'},log:['x']});
    assert.deepEqual(fifthRound.gradientConversionOrder_2.value,{failure:{error:'IndexSizeError'},log:['offset','color']});
    assert.deepEqual(fifthRound.setterInvalidReceiverOrder.value,{failure:{error:'TypeError'},calls:0});
    assert.deepEqual(fifthRound.setterWrongNativeReceiver.value,{failure:{error:'TypeError'},calls:0});
    assert.deepEqual(fifthRound.numericPropertyReentrantResize.value,{calls:1,width:20,lineWidth:2.5});
    assert.equal(fifthRound.shadowColor_opaque.value,'#ff0000');
    assert.equal(fifthRound.shadowColor_alpha.value,'rgba(255, 0, 0, 0.5)');
    assert.equal(fifthRound.textDirectionSaveRestore.value,'rtl');
    assert.equal(fifthRound.directionReset.value,'ltr');
    assert.equal(fifthRound.directionResize.value,'ltr');
    assert.equal(fifthRound.rtlDrawingAlignment.value,true);
    assert.equal(fifthRound.textRTLStartBounds.value.left,fifthRound.textRTLStartBounds.value.width);
    assert.equal(fifthRound.fontMetrics_top.value.fontBoundingBoxAscent,1.6875);
    assert.equal(fifthRound.fontMetrics_top.value.alphabeticBaseline,-9.3125);
    assert.equal(fifthRound.metricsSmallFont.value[0][0],1.810546875);
    const fourthErrors={detachedImageData:'InvalidStateError',putImageDataCoordinateOverflow:'TypeError',getImageDataCoordinateOverflow:'TypeError',createImageDataWrappedSize:'TypeError',createImageDataNaN:'TypeError',putImageDataUndefinedCoordinate:'TypeError',transferCanvasWithoutContext:'InvalidStateError',dashStringSequence:'TypeError',strokeInvalidArgument:'TypeError',fillMissingReceiver:'TypeError',imageDataDetachedDuringConversion:'InvalidStateError'};
    for(const [name,result] of Object.entries(fourthRound)){
        if(fourthErrors[name])assert.equal(result.error,fourthErrors[name],name);
        else assert.ok(Object.hasOwn(result,'value'),name+': '+result.error);
    }
    assert.deepEqual(fourthRound.imageDataReadonlyWidth.value,{accepted:false,width:1});
    assert.deepEqual(fourthRound.imageDataReadonlyHeight.value,{accepted:false,height:2});
    assert.deepEqual(fourthRound.imageDataReadonlyData.value,{accepted:false,same:true});
    assert.deepEqual(fourthRound.imageDataPixelsMutable.value,[0,0,255,255]);
    assert.deepEqual(fourthRound.dashIteratorLookup.value,{reads:1,dash:[2,3]});
    assert.deepEqual(fourthRound.dashIteratorClose.value,{failure:{error:'TypeError'},closed:false});
    assert.deepEqual(fourthRound.roundRectPointConversionOrder.value,['getX','convertX','getY']);
    assert.deepEqual(fourthRound.roundRectIteratorConversionOrder.value,['next0','x0','y0','next1','x1','y1','done']);
    assert.deepEqual(fourthRound.fillStyleObjectString.value,{calls:1,style:'#ff0000',pixel:red});
    assert.equal(fourthRound.fontSeparatedLineHeight.value,'12px Arial');
    assert.equal(fourthRound.fontInvalidLineHeightUnit.value,'14px Arial');
    assert.equal(fourthRound.fontFallbackList.value.candidate,fourthRound.fontFallbackList.value.reference);
    assert.deepEqual(fourthRound.emptyTextTopBaseline.value,{ascent:-9.3125,descent:9.3125});
    assert.deepEqual(fourthRound.invalidReceiverBeforeConversion.value,{failure:{error:'TypeError'},calls:0});
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
    fs.writeFileSync(path.join(__dirname,'out/cdp-fourth-round-local.json'),JSON.stringify(fourthRound,null,2)+'\n');
    fs.writeFileSync(path.join(__dirname,'out/cdp-fifth-round-local.json'),JSON.stringify(fifthRound,null,2)+'\n');
    fs.writeFileSync(path.join(__dirname,'out/cdp-sixth-round-local.json'),JSON.stringify(sixthRound,null,2)+'\n');
    fs.writeFileSync(path.join(__dirname,'out/cdp-seventh-round-local.json'),JSON.stringify(seventhRound,null,2)+'\n');
    fs.writeFileSync(path.join(__dirname,'out/cdp-eighth-round-local.json'),JSON.stringify(eighthRound,null,2)+'\n');
    const report={localCases:Object.keys(local).length,additionalCases:Object.keys(additional).length,thirdRoundCases:Object.keys(thirdRound).length,unicodeColor:true,totalCases:Object.keys(local).length+Object.keys(additional).length+Object.keys(thirdRound).length+1,gradientGC:true,demoValues:demo.length,browserVerified:false};
    report.fourthRoundCases=Object.keys(fourthRound).length;
    report.totalCases+=report.fourthRoundCases;
    report.fifthRoundCases=Object.keys(fifthRound).length;
    report.totalCases+=report.fifthRoundCases;
    report.sixthRoundCases=Object.keys(sixthRound).length;
    report.totalCases+=report.sixthRoundCases;
    report.seventhRoundCases=Object.keys(seventhRound).length;
    report.totalCases+=report.seventhRoundCases;
    report.eighthRoundCases=Object.keys(eighthRound).length;
    report.totalCases+=report.eighthRoundCases;
    // A failed CDP connection must not leave an earlier successful report behind.
    fs.writeFileSync(path.join(__dirname,'out/cdp-verification-result.json'),JSON.stringify(report,null,2)+'\n');
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
        const browserBundle=await capture('tests/fourth-round-cases.js','fourth-round');
        const browserFourth={...browserBundle,value:browserBundle.value.fourthRound};
        const browserFifth={...browserBundle,value:browserBundle.value.fifthRound};
        const browserSixth={...browserBundle,value:browserBundle.value.sixthRound};
        const browserSeventh={...browserBundle,value:browserBundle.value.seventhRound};
        const browserEighth={...browserBundle,value:browserBundle.value.eighthRound};
        assert.deepEqual(Object.keys(browserFourth.value).sort(),Object.keys(fourthRound).sort());
        const fourthRoundFailures=[];
        for(const name of Object.keys(fourthRound)){
            try{assert.deepEqual(fourthRound[name],browserFourth.value[name]);}catch{fourthRoundFailures.push(name);}
        }
        assert.deepEqual(Object.keys(browserFifth.value).sort(),Object.keys(fifthRound).sort());
        const fifthRoundFailures=[];
        for(const name of Object.keys(fifthRound)){
            try{assert.deepEqual(fifthRound[name],browserFifth.value[name]);}catch{fifthRoundFailures.push(name);}
        }
        assert.deepEqual(Object.keys(browserSixth.value).sort(),Object.keys(sixthRound).sort());
        const sixthRoundFailures=[];
        for(const name of Object.keys(sixthRound)){
            try{assert.deepEqual(sixthRound[name],browserSixth.value[name]);}catch{sixthRoundFailures.push(name);}
        }
        assert.deepEqual(Object.keys(browserSeventh.value).sort(),Object.keys(seventhRound).sort());
        const seventhRoundFailures=[];
        for(const name of Object.keys(seventhRound)){
            try{assert.deepEqual(seventhRound[name],browserSeventh.value[name]);}catch{seventhRoundFailures.push(name);}
        }
        assert.deepEqual(Object.keys(browserEighth.value).sort(),Object.keys(eighthRound).sort());
        const eighthRoundFailures=[];
        for(const name of Object.keys(eighthRound)){
            try{assert.deepEqual(eighthRound[name],browserEighth.value[name]);}catch{eighthRoundFailures.push(name);}
        }
        let unicodeColorMatches=false;
        try{assert.deepEqual(unicodeColor,browserUnicode.value);unicodeColorMatches=true;}catch{}
        const browserDemo=await capture('demo.js','demo');
        const mismatches=demo.filter((value,index)=>value!==browserDemo.value[index]).length;
        Object.assign(report,{browserMode:browser.browserMode,chromeVersion:browser.chromeVersion,caseRunId:browser.runId,additionalRunId:browserAdditional.runId,demoRunId:browserDemo.runId,caseFailures:failures,additionalFailures,demoMismatches:mismatches,browserVerified:failures.length===0&&additionalFailures.length===0&&mismatches===0&&browserDemo.value.length===demo.length});
        Object.assign(report,{thirdRoundRunId:browserThird.runId,unicodeColorRunId:browserUnicode.runId,thirdRoundFailures,unicodeColorMatches,browserVerified:report.browserVerified&&thirdRoundFailures.length===0&&unicodeColorMatches});
        Object.assign(report,{fourthRoundRunId:browserFourth.runId,fourthRoundFailures,browserVerified:report.browserVerified&&fourthRoundFailures.length===0});
        Object.assign(report,{fifthRoundRunId:browserFifth.runId,fifthRoundFailures,browserVerified:report.browserVerified&&fifthRoundFailures.length===0});
        Object.assign(report,{sixthRoundRunId:browserSixth.runId,sixthRoundFailures,browserVerified:report.browserVerified&&sixthRoundFailures.length===0});
        Object.assign(report,{seventhRoundRunId:browserSeventh.runId,seventhRoundFailures,browserVerified:report.browserVerified&&seventhRoundFailures.length===0});
        Object.assign(report,{eighthRoundRunId:browserEighth.runId,eighthRoundFailures,browserVerified:report.browserVerified&&eighthRoundFailures.length===0});
        fs.writeFileSync(path.join(__dirname,'out/cdp-verification-result.json'),JSON.stringify(report,null,2)+'\n');
        assert.deepEqual(failures,[],'Browser compatibility differences');
        assert.deepEqual(additionalFailures,[],'Additional browser compatibility differences');
        assert.deepEqual(thirdRoundFailures,[],'Third-round browser compatibility differences');
        assert.deepEqual(fourthRoundFailures,[],'Fourth-round browser compatibility differences');
        assert.deepEqual(fifthRoundFailures,[],'Fifth-round browser compatibility differences');
        assert.deepEqual(sixthRoundFailures,[],'Sixth-round browser compatibility differences');
        assert.deepEqual(seventhRoundFailures,[],'Seventh-round browser compatibility differences');
        assert.deepEqual(eighthRoundFailures,[],'Eighth-round browser compatibility differences');
        assert.equal(unicodeColorMatches,true,'Unicode color handling differs');
        assert.equal(browserDemo.value.length,demo.length);assert.equal(mismatches,0,'Demo pixels differ from the existing Chrome over CDP');
    }
    console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
