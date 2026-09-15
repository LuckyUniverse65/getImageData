(function () {
    function runFourthRoundCases(Canvas) {
        const results={};
        const fresh=attributes=>new Canvas(24,24).getContext('2d',attributes);
        const pixel=(g,x=0,y=0)=>Array.from(g.getImageData(x,y,1,1).data);
        const attempt=fn=>{try{const value=fn();return {value:value===undefined?'<undefined>':value};}catch(e){return {error:e.name};}};
        const add=(name,fn)=>{results[name]=attempt(fn);};
        const source=()=>{const g=fresh();g.fillStyle='red';g.fillRect(0,0,4,4);return g.canvas;};
        const onePixel=g=>{const d=g.createImageData(1,1);d.data.set([255,0,0,255]);return d;};

        add('imageDataReadonlyWidth',()=>{const d=fresh().createImageData(1,1);const accepted=Reflect.set(d,'width',2);return {accepted,width:d.width};});
        add('imageDataReadonlyData',()=>{const d=fresh().createImageData(1,1),before=d.data;const accepted=Reflect.set(d,'data',new Uint8ClampedArray(4));return {accepted,same:d.data===before};});
        add('detachedImageData',()=>{const g=fresh(),d=onePixel(g);structuredClone(d.data.buffer,{transfer:[d.data.buffer]});return g.putImageData(d,0,0);});
        add('imageDataCloneDetached',()=>{const g=fresh(),d=onePixel(g);structuredClone(d.data.buffer,{transfer:[d.data.buffer]});const copy=g.createImageData(d);return {width:copy.width,height:copy.height,length:copy.data.length};});
        add('putImageDataCoordinateOverflow',()=>{const g=fresh();g.putImageData(onePixel(g),4294967296,0);return pixel(g);});
        add('getImageDataCoordinateOverflow',()=>{const g=fresh();g.fillStyle='red';g.fillRect(0,0,2,2);return pixel(g,4294967296,0);});
        add('createImageDataWrappedSize',()=>{const d=fresh().createImageData(4294967297,1);return [d.width,d.height,d.data.length];});
        add('createImageDataNaN',()=>{const d=fresh().createImageData(NaN,1);return [d.width,d.height];});
        add('putImageDataUndefinedCoordinate',()=>{const g=fresh();g.putImageData(onePixel(g),undefined,0);return pixel(g);});
        add('putImageDataConversionOrder',()=>{const g=fresh(),d=onePixel(g),log=[];const n=(name,value)=>({valueOf(){log.push(name);return value;}});g.putImageData(d,n('x',0),n('y',0),n('dirtyX',0),n('dirtyY',0),n('width',1),n('height',1));return {log,pixel:pixel(g)};});
        add('bitmapCloseIdempotent',()=>{const b=source().transferToImageBitmap();b.close();b.close();return [b.width,b.height];});
        add('transferCanvasWithoutContext',()=>{const b=new Canvas(2,2).transferToImageBitmap();return [b.width,b.height];});
        add('bitmapRemainsAfterResize',()=>{const c=source(),b=c.transferToImageBitmap();c.width=2;const g=fresh();g.drawImage(b,0,0);b.close();return pixel(g);});

        add('dashIteratorLookup',()=>{const g=fresh();let reads=0;const sequence={get [Symbol.iterator](){reads++;return function*(){yield 2;yield 3;};}};g.setLineDash(sequence);return {reads,dash:g.getLineDash()};});
        add('dashStringSequence',()=>{const g=fresh();g.setLineDash('12');return g.getLineDash();});
        add('dashIteratorClose',()=>{const g=fresh();let closed=false;const sequence={*[Symbol.iterator](){try{yield Symbol();}finally{closed=true;}}};const failure=attempt(()=>g.setLineDash(sequence));return {failure,closed};});
        add('roundRectIteratorConversionOrder',()=>{const g=fresh(),log=[];const sequence={*[Symbol.iterator](){for(let i=0;i<2;i++){log.push('next'+i);yield {get x(){log.push('x'+i);return 2;},get y(){log.push('y'+i);return 2;}};}log.push('done');}};g.roundRect(0,0,8,8,sequence);return log;});
        add('roundRectPointConversionOrder',()=>{const g=fresh(),log=[];g.roundRect(0,0,8,8,{get x(){log.push('getX');return {valueOf(){log.push('convertX');return 2;}};},get y(){log.push('getY');return 2;}});return log;});
        add('roundRectNonfiniteAndNegative',()=>{const g=fresh();g.roundRect(0,0,8,8,[NaN,-1]);return g.isPointInPath(4,4);});
        add('roundRectNegativeNonfiniteCoordinate',()=>fresh().roundRect(NaN,0,8,8,-1));
        add('gradientStopObjectString',()=>{const g=fresh(),gr=g.createLinearGradient(0,0,8,0);let calls=0;gr.addColorStop(0,{toString(){calls++;return 'red';}});gr.addColorStop(1,'red');g.fillStyle=gr;g.fillRect(0,0,2,2);return {calls,pixel:pixel(g)};});
        add('fillStyleObjectString',()=>{const g=fresh();let calls=0;g.fillStyle={toString(){calls++;return 'red';}};g.fillRect(0,0,2,2);return {calls,style:g.fillStyle,pixel:pixel(g)};});
        add('fontObjectString',()=>{const g=fresh();let calls=0;g.font={toString(){calls++;return '12px Arial';}};return {calls,font:g.font};});

        for(const [name,color] of [
            ['modernAlphaDecimal','rgb(255 0 0 / 0.5)'],['modernAlphaPercent25','rgb(255 0 0 / 25%)'],
            ['legacyAlphaSerialization','rgba(255,0,0,0.5)'],['legacyMixedPercent','rgb(100%,0,0)'],
            ['legacyNaN','rgb(NaN,0,0)'],['legacyInfinity','rgb(inf,0,0)'],
            ['hslNegativeHue','hsl(-240,100%,50%)'],['hslHueTurn','hsl(0.5turn 100% 50%)'],
            ['transparentHexSerialization','#ff000080'],['namedColorYellow','yellow']
        ])add(name,()=>{const g=fresh();g.fillStyle='blue';g.fillStyle=color;g.fillRect(0,0,2,2);return {style:g.fillStyle,pixel:pixel(g)};});
        for(const [name,font] of [
            ['fontSeparatedLineHeight','12px / 2 Arial'],['fontInvalidLineHeightUnit','12px/2garbage Arial'],
            ['fontRepeatedNormal','normal normal normal normal normal 12px Arial'],['fontFamilyTwoQuotedNames','12px "Arial" "Courier"'],
            ['fontDecimalWeight','450.5 12px Arial'],['fontUnitCase','12PX Arial']
        ])add(name,()=>{const g=fresh();g.font='14px Arial';g.font=font;return g.font;});
        add('fontFallbackList',()=>{const g=fresh();g.font='12px NoSuchFontForCanvas, Arial';const candidate=g.measureText('MMMM').width;g.font='12px Arial';return {candidate,reference:g.measureText('MMMM').width};});
        add('emptyTextTopBaseline',()=>{const g=fresh();g.font='12px Arial';g.textBaseline='top';const t=g.measureText('');return {ascent:t.actualBoundingBoxAscent,descent:t.actualBoundingBoxDescent};});
        add('textSpaceBounds',()=>{const g=fresh();g.font='12px Arial';const t=g.measureText(' ');return {width:t.width,left:t.actualBoundingBoxLeft,right:t.actualBoundingBoxRight,ascent:t.actualBoundingBoxAscent,descent:t.actualBoundingBoxDescent};});
        add('textTabsDrawing',()=>{const a=fresh(),b=fresh();a.font=b.font='12px Arial';a.fillText('A\tB',0,14);b.fillText('A B',0,14);const first=a.getImageData(0,0,24,24).data,second=b.getImageData(0,0,24,24).data;return Array.from(first).every((v,i)=>v===second[i]);});
        add('strokeInvalidArgument',()=>fresh().stroke(3));
        add('fillMissingReceiver',()=>{const g=fresh();return g.fillRect.call({},0,0,2,2);});
        add('isPointNonfinite',()=>{const g=fresh();g.rect(0,0,8,8);return [g.isPointInPath(NaN,1),g.isPointInStroke(Infinity,1)];});
        add('imageDataReadonlyHeight',()=>{const d=fresh().createImageData(1,2);return {accepted:Reflect.set(d,'height',5),height:d.height};});
        add('imageDataPixelsMutable',()=>{const g=fresh(),d=onePixel(g);d.data.set([0,0,255,255]);g.putImageData(d,0,0);return pixel(g);});
        add('imageDataDetachedDuringConversion',()=>{const g=fresh(),d=onePixel(g);return g.putImageData(d,{valueOf(){structuredClone(d.data.buffer,{transfer:[d.data.buffer]});return 0;}},0);});
        add('alphaPercentSweep',()=>[0,10,25,50,75,90,100].map(a=>{const g=fresh();g.fillStyle=`rgb(255 0 0 / ${a}%)`;g.fillRect(0,0,2,2);return {style:g.fillStyle,pixel:pixel(g)};}));
        add('alphaLegacySweep',()=>[0,0.1,0.25,0.5,0.75,0.9,1].map(a=>{const g=fresh();g.fillStyle=`rgba(255,0,0,${a})`;g.fillRect(0,0,2,2);return {style:g.fillStyle,pixel:pixel(g)};}));
        add('fontMultipleFallbacks',()=>{const g=fresh();g.font='12px "Missing, Font", NoSuchCanvasFont, "Arial"';const candidate=g.measureText('MMMM').width;g.font='12px Arial';return {candidate,reference:g.measureText('MMMM').width};});
        for(const [name,font] of [['Arial','12px Arial'],['FractionalArial','17.3px Arial'],['Times','20px "Times New Roman"'],['Courier','15px "Courier New"']]){
            add('textEmBaselines'+name,()=>{const g=fresh();g.font=font;return ['top','middle','bottom'].map(b=>{g.textBaseline=b;return ['', 'Mg'].map(text=>{const t=g.measureText(text);return [t.actualBoundingBoxAscent,t.actualBoundingBoxDescent];});});});
        }
        add('invalidReceiverBeforeConversion',()=>{const g=fresh();let calls=0;const failure=attempt(()=>g.fillRect.call({}, {valueOf(){calls++;return 0;}},0,2,2));return {failure,calls};});
        add('sequenceNextLookup',()=>{const g=fresh();let reads=0,i=0;g.setLineDash({[Symbol.iterator](){return {get next(){reads++;return ()=>i++<2?{value:2,done:false}:{done:true};}};}});return {reads,dash:g.getLineDash()};});
        return results;
    }
    // Keep further review cases in the existing capture entrypoint so an
    // already-authorized persistent service does not need to reconnect.
    function runFifthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(24,24).getContext('2d');
        const attempt=fn=>{try{const value=fn();return {value:value===undefined?'<undefined>':value};}catch(e){return {error:e.name};}};
        const add=(name,fn)=>results[name]=attempt(fn);
        const pixel=g=>Array.from(g.getImageData(0,0,1,1).data);
        const descriptor=(o,key)=>{for(;o;o=Object.getPrototypeOf(o)){const d=Object.getOwnPropertyDescriptor(o,key);if(d)return d;}};
        const source=()=>{const g=fresh();g.fillStyle='red';g.fillRect(0,0,4,4);return g.canvas;};
        for(const baseline of ['alphabetic','top','middle','bottom','hanging','ideographic'])add('fontMetrics_'+baseline,()=>{
            const g=fresh();g.font='12px Arial';g.textBaseline=baseline;const m=g.measureText('Mg');
            return Object.fromEntries(['actualBoundingBoxAscent','actualBoundingBoxDescent','fontBoundingBoxAscent','fontBoundingBoxDescent','emHeightAscent','emHeightDescent','hangingBaseline','alphabeticBaseline','ideographicBaseline'].map(k=>[k,m[k]===undefined?'<undefined>':m[k]]));
        });
        add('textMetricsZeroFont',()=>{const g=fresh();g.font='0px Arial';const m=g.measureText('Mg');return {font:g.font,width:m.width,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent};});
        add('textRTLStartBounds',()=>{const g=fresh();g.font='12px Arial';g.direction='rtl';g.textAlign='start';const m=g.measureText('MM');return {width:m.width,left:m.actualBoundingBoxLeft,right:m.actualBoundingBoxRight};});
        add('textRTLEndBounds',()=>{const g=fresh();g.font='12px Arial';g.direction='rtl';g.textAlign='end';const m=g.measureText('MM');return {width:m.width,left:m.actualBoundingBoxLeft,right:m.actualBoundingBoxRight};});
        add('textDirectionSaveRestore',()=>{const g=fresh();g.direction='rtl';g.save();g.direction='ltr';g.restore();return g.direction;});
        for(const [name,value] of [['default',null],['opaque','red'],['alpha','rgba(255,0,0,0.5)']])add('shadowColor_'+name,()=>{const g=fresh();if(value!==null)g.shadowColor=value;return g.shadowColor;});
        add('shadowColorInvalidPreserves',()=>{const g=fresh();g.shadowColor='red';g.shadowColor='invalid';return g.shadowColor;});
        add('fillStyleSymbol',()=>{const g=fresh();g.fillStyle=Symbol();});
        add('fillStyleReentrant',()=>{const g=fresh();let calls=0;g.fillStyle={toString(){calls++;g.fillStyle='blue';return 'red';}};return {calls,style:g.fillStyle};});
        add('fillStyleConversionThrows',()=>{const g=fresh();g.fillStyle='blue';const failure=attempt(()=>{g.fillStyle={toString(){throw new RangeError('sentinel');}};});return {failure,style:g.fillStyle};});
        add('setterInvalidReceiverOrder',()=>{const g=fresh();let calls=0;const failure=attempt(()=>descriptor(g,'fillStyle').set.call({}, {toString(){calls++;return 'red';}}));return {failure,calls};});
        add('getterInvalidReceiver',()=>descriptor(fresh(),'fillStyle').get.call({}));
        for(const name of ['lineWidth','shadowBlur','miterLimit','lineDashOffset'])add('numericProperty_'+name,()=>{const g=fresh();let calls=0;g[name]={valueOf(){calls++;return 2.5;}};return {calls,value:g[name]};});
        add('globalAlphaReentrant',()=>{const g=fresh();g.globalAlpha={valueOf(){g.globalAlpha=0.25;return 0.5;}};return g.globalAlpha;});
        for(const offset of [2,NaN])add('gradientConversionOrder_'+String(offset),()=>{const gr=fresh().createLinearGradient(0,0,4,0),log=[];const failure=attempt(()=>gr.addColorStop({valueOf(){log.push('offset');return offset;}},{toString(){log.push('color');return 'red';}}));return {failure,log};});
        add('gradientColorThrowBeforeRange',()=>{const gr=fresh().createLinearGradient(0,0,4,0);return gr.addColorStop(2,{toString(){throw new RangeError('sentinel');}});});
        add('gradientReentrant',()=>{const g=fresh(),gr=g.createLinearGradient(0,0,4,0);gr.addColorStop(0,{toString(){gr.addColorStop(1,'red');return 'red';}});g.fillStyle=gr;g.fillRect(0,0,2,2);return pixel(g);});
        add('strokeExplicitUndefined',()=>{const g=fresh();g.rect(0,0,8,8);return g.stroke(undefined);});
        add('strokeExplicitNull',()=>fresh().stroke(null));
        add('contextOptionsReadOrder',()=>{const log=[];new Canvas(2,2).getContext('2d',new Proxy({}, {get(o,k){log.push(k);return undefined;}}));return log;});
        add('contextRepeatedOptions',()=>{const c=new Canvas(2,2),g=c.getContext('2d');let calls=0;const same=c.getContext('2d',{get alpha(){calls++;return false;}})===g;return {same,calls,alpha:g.getContextAttributes().alpha};});
        add('contextRepeatedOptionsThrow',()=>{const c=new Canvas(2,2);c.getContext('2d');return !!c.getContext('2d',{get alpha(){throw new RangeError('sentinel');}});});
        for(const key of ['colorSpace','colorType'])add('contextInvalid_'+key,()=>!!new Canvas(2,2).getContext('2d',{[key]:'invalid'}));
        add('contextOptionErrorThenRetry',()=>{const c=new Canvas(2,2);const failure=attempt(()=>c.getContext('2d',{colorSpace:'invalid'}));return {failure:failure.error||'accepted',retry:!!c.getContext('2d')};});
        add('imageDataInvalidColorSpace',()=>fresh().getImageData(0,0,1,1,{colorSpace:'invalid'}));
        add('imageDataInvalidPixelFormat',()=>fresh().getImageData(0,0,1,1,{pixelFormat:'invalid'}));
        add('imageDataSettingsReadOrder',()=>{const log=[];fresh().getImageData(0,0,1,1,new Proxy({}, {get(o,k){log.push(k);return undefined;}}));return log;});
        add('createImageDataInvalidSettings',()=>fresh().createImageData(1,1,{colorSpace:'invalid'}));
        add('imageDataFractionalZero',()=>fresh().createImageData(0.9,1));
        add('patternCloseDuringConversion',()=>{const b=source().transferToImageBitmap();return fresh().createPattern(b,{toString(){b.close();return 'repeat';}});});
        add('drawImageCloseDuringConversion',()=>{const b=source().transferToImageBitmap();return fresh().drawImage(b,{valueOf(){b.close();return 0;}},0);});
        add('roundRectNullRadius',()=>{const g=fresh();g.roundRect(0,0,8,8,null);return g.isPointInPath(1,1);});
        add('roundRectBadIterator',()=>fresh().roundRect(0,0,8,8,{[Symbol.iterator]:2}));
        add('dashBadIteratorResult',()=>fresh().setLineDash({[Symbol.iterator](){return {next(){return 2;}};}}));
        add('getterWrongNativeReceiver',()=>{const g=fresh();return descriptor(g,'fillStyle').get.call(g.createLinearGradient(0,0,4,0));});
        add('setterWrongNativeReceiver',()=>{const g=fresh();let calls=0;const failure=attempt(()=>descriptor(g,'lineWidth').set.call(g.createLinearGradient(0,0,4,0),{valueOf(){calls++;return 2;}}));return {failure,calls};});
        add('numericPropertyReentrantResize',()=>{const g=fresh();let calls=0;g.lineWidth={valueOf(){calls++;g.canvas.width=20;return 2.5;}};return {calls,width:g.canvas.width,lineWidth:g.lineWidth};});
        add('metricsSmallFont',()=>{const g=fresh();g.font='2px Arial';return ['alphabetic','hanging','ideographic'].map(b=>{g.textBaseline=b;const m=g.measureText('M');return [m.fontBoundingBoxAscent,m.fontBoundingBoxDescent,m.hangingBaseline,m.alphabeticBaseline,m.ideographicBaseline];});});
        add('metricsFractionalFont',()=>{const g=fresh();g.font='17.3px Arial';return ['top','middle','bottom'].map(b=>{g.textBaseline=b;const m=g.measureText('M');return [m.fontBoundingBoxAscent,m.fontBoundingBoxDescent,m.hangingBaseline,m.alphabeticBaseline,m.ideographicBaseline];});});
        add('directionReset',()=>{const g=fresh();g.direction='rtl';g.reset();return g.direction;});
        add('directionResize',()=>{const g=fresh();g.direction='rtl';g.canvas.width=24;return g.direction;});
        add('rtlDrawingAlignment',()=>{const a=fresh(),b=fresh();a.font=b.font='12px Arial';a.direction='rtl';a.textAlign='start';b.textAlign='right';a.fillText('MM',22,16);b.fillText('MM',22,16);const first=a.getImageData(0,0,24,24).data,second=b.getImageData(0,0,24,24).data;return Array.from(first).every((v,i)=>v===second[i]);});
        add('shadowModernAlpha',()=>{const g=fresh();g.shadowColor='rgb(255 0 0 / 0.1234)';g.save();g.shadowColor='blue';g.restore();return g.shadowColor;});
        add('contextEnumConversionOrder',()=>{const log=[];new Canvas(2,2).getContext('2d',{get colorSpace(){log.push('getColor');return {toString(){log.push('convertColor');return 'srgb';}};},get colorType(){log.push('getType');return 'unorm8';}});return log;});
        add('imageSettingsBeforeZeroSize',()=>fresh().getImageData(0,0,0,1,{colorSpace:'invalid'}));
        add('imageSettingsAfterCoordinates',()=>{const g=fresh(),log=[];const failure=attempt(()=>g.getImageData({valueOf(){log.push('x');return Infinity;}},0,1,1,{get colorSpace(){log.push('settings');return 'srgb';}}));return {failure,log};});
        return results;
    }
    if(typeof module!=='undefined'&&module.exports){module.exports=runFourthRoundCases;module.exports.runFifthRoundCases=runFifthRoundCases;}
    else globalThis.__canvasResult={fourthRound:runFourthRoundCases(OffscreenCanvas),fifthRound:runFifthRoundCases(OffscreenCanvas)};
})();
