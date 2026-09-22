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
    async function runSixthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(24,24).getContext('2d');
        const initializedCanvas=(width=2,height=2)=>{const c=new Canvas(width,height);c.getContext('2d');return c;};
        const attempt=async fn=>{try{const value=await fn();return {value:value===undefined?'<undefined>':value};}catch(e){return {error:e.name};}};
        const add=async(name,fn)=>{results[name]=await attempt(fn);};
        const pixel=g=>Array.from(g.getImageData(0,0,1,1).data);
        const blobInfo=async promise=>{const b=await promise;return {type:b.type,nonempty:b.size>0};};
        await add('heightConversionChangesWidth',()=>{const c=new Canvas(4,4);c.getContext('2d');c.height={valueOf(){c.width=8;return 6;}};return [c.width,c.height];});
        await add('widthConversionChangesHeight',()=>{const c=new Canvas(4,4);c.getContext('2d');c.width={valueOf(){c.height=8;return 6;}};return [c.width,c.height];});
        await add('sizeConversionThrowsAfterMutation',async()=>{const c=new Canvas(4,4);const failure=await attempt(()=>{c.width={valueOf(){c.height=8;throw new RangeError('sentinel');}};});return {failure,size:[c.width,c.height]};});
        await add('contextOptionsResize',()=>{const c=new Canvas(4,4);const g=c.getContext('2d',{get alpha(){c.width=8;return true;}});return [g.canvas.width,g.canvas.height];});
        await add('contextInheritedOptions',()=>{let calls=0;const g=new Canvas(2,2).getContext('2d',Object.create({get alpha(){calls++;return false;}}));return {calls,alpha:g.getContextAttributes().alpha};});
        await add('contextPrototypeGetter',()=>{
            const before=Object.getOwnPropertyDescriptor(Object.prototype,'alpha');let calls=0;
            Object.defineProperty(Object.prototype,'alpha',{configurable:true,get(){calls++;return false;}});
            try{const g=new Canvas(2,2).getContext('2d',{});return {calls,alpha:g.getContextAttributes().alpha};}
            finally{if(before)Object.defineProperty(Object.prototype,'alpha',before);else delete Object.prototype.alpha;}
        });
        await add('contextExplicitUndefinedOption',()=>{let calls=0;const c=new Canvas(2,2);const g=c.getContext('2d',{get alpha(){calls++;return undefined;}});return {calls,alpha:g.getContextAttributes().alpha};});
        await add('contextAttributesOwnProperties',()=>{const before=Object.getOwnPropertyDescriptor(Object.prototype,'alpha');let calls=0;Object.defineProperty(Object.prototype,'alpha',{configurable:true,get(){calls++;return false;},set(){throw new RangeError('sentinel');}});try{const g=new Canvas(2,2).getContext('2d',{}),attrs=g.getContextAttributes(),d=Object.getOwnPropertyDescriptor(attrs,'alpha');return {calls,alpha:attrs.alpha,own:!!d,writable:d?.writable,enumerable:d?.enumerable,configurable:d?.configurable};}finally{if(before)Object.defineProperty(Object.prototype,'alpha',before);else delete Object.prototype.alpha;}});
        await add('imageSettingsReentrantResize',()=>{const g=fresh();const d=g.getImageData(0,0,1,1,{get colorSpace(){g.canvas.width=8;return 'srgb';}});return {width:g.canvas.width,pixel:Array.from(d.data)};});
        await add('imageSettingsPrimitive',()=>{fresh().getImageData(0,0,1,1,3);return 'accepted';});
        await add('cloneImageDataExtraUndefined',()=>{const g=fresh();g.createImageData(g.createImageData(1,1),undefined);return 'accepted';});
        for(const [name,font] of [['trailingDot','12.px Arial'],['bareHyphen','12px -'],['nullFamily','12px "A\0B"'],['exponent','1.2e1px Arial']]){
            await add('fontGrammar_'+name,()=>{const g=fresh();g.font='14px Arial';g.font=font;return g.font;});
        }
        await add('fontWeight950',()=>{const g=fresh();g.font='950 12px Arial';return {font:g.font,width:g.measureText('iiiiWW').width};});
        await add('fontWeight900Control',()=>{const g=fresh();g.font='900 12px Arial';return {font:g.font,width:g.measureText('iiiiWW').width};});
        await add('fontSmallCaps',()=>{const g=fresh();g.font='small-caps 16px Arial';return {font:g.font,width:g.measureText('abc').width};});
        await add('smallCapsMetricsSweep',()=>{const g=fresh();return [10,12,16,20,24].map(size=>{g.font=`small-caps ${size}px Arial`;return ['abc','ABC','aBc','AVava','éß'].map(text=>{const m=g.measureText(text);return [m.width,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];});});});
        await add('smallCapsSizeControl',()=>{const g=fresh();return [11,11.2,12,13,13.6,14,16].map(size=>{g.font=`${size}px Arial`;return g.measureText('ABC').width;});});
        for(const method of ['fillText','strokeText'])await add('smallCapsDrawing_'+method,()=>{const g=new Canvas(100,32).getContext('2d');g.font='small-caps 16px Arial';g[method]('aBc AVé',2,22);const data=g.getImageData(0,0,100,32).data;return Array.from(data);});
        await add('smallCapsSaveRestore',()=>{const g=fresh();g.font='small-caps 16px Arial';g.save();g.font='12px Arial';g.restore();return {font:g.font,width:g.measureText('abc').width};});
        await add('smallCapsWordSpacing',()=>{const g=fresh();return ['16px Arial','small-caps 16px Arial'].map(font=>{g.font=font;return ['aBc','aBc ','aBc A','aBc AV','aBc AVé',' ','AVé','AV','é'].map(t=>g.measureText(t).width);});});
        await add('fontWeightRange',()=>{const g=fresh();return [1,99,100,950,1000].map(w=>{g.font=`${w} 12px Arial`;return {font:g.font,width:g.measureText('iiiiWW').width};});});
        await add('fontFamilySerialization',()=>{const g=fresh();return ['12px "Arial"','12px "Times New Roman"','12px "A-B"','12px "A\\0B"','12px --foo','12px -1foo'].map(font=>{g.font='14px Arial';g.font=font;return g.font;});});
        for(const [name,color] of [['trailingDot','rgb(255.,0,0)'],['comments','rgb(255/**/ 0 0)'],['modernMixed','rgb(100% 0 0)'],['alphaTrailingDot','rgba(255,0,0,1.)'],['hslNumber','hsl(0 100 50)'],['hugeHue','hsl(1e30deg 100% 50%)']]){
            await add('colorGrammar_'+name,()=>{const g=fresh();g.fillStyle='blue';g.fillStyle=color;g.fillRect(0,0,1,1);return {style:g.fillStyle,pixel:pixel(g)};});
        }
        await add('fillStyleAlphaPrecision',()=>{const g=fresh();g.fillStyle='rgb(255 0 0 / 0.123456789)';return g.fillStyle;});
        await add('modernAlphaPrecisionSweep',()=>{const g=fresh();return [0.001,0.004,0.005,0.009,0.123,0.125,0.9999].map(a=>{g.fillStyle=`rgb(255 0 0 / ${a})`;return g.fillStyle;});});
        await add('shadowAlphaPrecision',()=>{const g=fresh();g.shadowColor='rgb(255 0 0 / 0.123456789)';return g.shadowColor;});
        await add('blobOptionsOrder',async()=>{const log=[];const result=await blobInfo(initializedCanvas().convertToBlob({get quality(){log.push('quality');return 0.5;},get type(){log.push('type');return 'image/png';}}));return {log,result};});
        await add('blobTypeThrows',()=>blobInfo(initializedCanvas().convertToBlob({get type(){throw new RangeError('sentinel');}})));
        await add('blobQualityThrows',()=>blobInfo(initializedCanvas().convertToBlob({get quality(){throw new RangeError('sentinel');}})));
        await add('blobQualitySymbol',()=>blobInfo(initializedCanvas().convertToBlob({quality:Symbol()})));
        await add('blobTypeSymbol',()=>blobInfo(initializedCanvas().convertToBlob({type:Symbol()})));
        await add('blobPrimitiveOptions',()=>blobInfo(initializedCanvas().convertToBlob(3)));
        await add('blobNullOptions',()=>blobInfo(initializedCanvas().convertToBlob(null)));
        for(const [name,quality] of [['NaN',NaN],['Infinity',Infinity],['BigInt',1n],['Negative',-1]])await add('blobQuality'+name,()=>blobInfo(initializedCanvas().convertToBlob({quality})));
        await add('blobConversionReentry',async()=>{const log=[];const result=await blobInfo(initializedCanvas().convertToBlob({get quality(){log.push('quality');return {valueOf(){log.push('number');return 0.5;}};},get type(){log.push('type');return {toString(){log.push('string');return 'image/png';}};}}));return {log,result};});
        await add('blobZeroOptionsOrder',async()=>{const log=[];const failure=await attempt(()=>initializedCanvas(0,0).convertToBlob({get type(){log.push('type');return 'image/png';}}));return {failure,log};});
        await add('blobOptionResizesCanvas',()=>{const c=initializedCanvas();return blobInfo(c.convertToBlob({get type(){c.width=0;return 'image/png';}}));});
        await add('blobMissingContextControl',()=>blobInfo(new Canvas(2,2).convertToBlob()));
        await add('blobNoContextZero',()=>blobInfo(new Canvas(0,0).convertToBlob()));
        await add('blobSnapshotsPixels',async()=>{const g=fresh();g.fillStyle='red';g.fillRect(0,0,24,24);const first=g.canvas.convertToBlob();g.fillStyle='blue';g.fillRect(0,0,24,24);const second=g.canvas.convertToBlob();const a=new Uint8Array(await (await first).arrayBuffer()),b=new Uint8Array(await (await second).arrayBuffer());return {same:a.length===b.length&&a.every((v,i)=>v===b[i]),types:[(await first).type,(await second).type]};});
        return results;
    }
    function runSeventhRoundCases(Canvas) {
        const results={};
        const add=(name,fn)=>{try{results[name]={value:fn()};}catch(e){results[name]={error:e.name};}};
        for(const family of ['Courier New','Tahoma','Consolas']){
            for(const size of [12,16,23.5])add(`syntheticMetrics_${family}_${size}`,()=>{
                const g=new Canvas(160,48).getContext('2d');g.font=`small-caps ${size}px "${family}"`;
                return ['abc','ABC','aBc','AVava','éß','a\u0301','a b','123','','aÉ','Éa','A\u0301'].map(text=>{const m=g.measureText(text);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent,m.fontBoundingBoxAscent,m.fontBoundingBoxDescent];});
            });
            for(const method of ['fillText','strokeText'])add(`syntheticDrawing_${family}_${method}`,()=>{
                const g=new Canvas(160,48).getContext('2d');g.font=`small-caps 16px "${family}"`;g[method]('aBc AVé ß',2,28);return Array.from(g.getImageData(0,0,160,48).data);
            });
            add(`syntheticScale_${family}`,()=>{const g=new Canvas(20,20).getContext('2d');return [10,11,11.2,11.203125,12,14,16].map(size=>{g.font=`${size}px "${family}"`;return g.measureText('ABC').width;});});
            for(const variant of ['maxWidth','transform','shadow','copy'])add(`syntheticState_${family}_${variant}`,()=>{
                const g=new Canvas(160,64).getContext('2d');g.font=`small-caps 16px "${family}"`;
                if(variant==='transform'){g.translate(4,5);g.scale(1.25,1.1);g.textAlign='center';}
                if(variant==='shadow'){g.shadowColor='blue';g.shadowBlur=2;g.shadowOffsetX=3;g.shadowOffsetY=2;}
                if(variant==='copy'){g.fillStyle='red';g.fillRect(0,0,160,64);g.fillStyle='black';g.globalCompositeOperation='copy';}
                g.fillText('aBc AVé',variant==='transform'?40:3,30,...(variant==='maxWidth'?[24]:[]));return Array.from(g.getImageData(0,0,160,64).data);
            });
            add(`syntheticSaveRestore_${family}`,()=>{const g=new Canvas(40,40).getContext('2d');g.font=`small-caps 16px "${family}"`;g.save();g.font='12px Arial';g.restore();return {font:g.font,width:g.measureText('aBc').width};});
        }
        add('syntheticTinySizes',()=>{const g=new Canvas(24,24).getContext('2d');return [0,0.5,1,2,3,4,5,6,15,25].map(size=>{g.font=`small-caps ${size}px Tahoma`;const m=g.measureText('aAß');return [m.width,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];});});
        add('syntheticFallbackList',()=>{const g=new Canvas(24,24).getContext('2d');g.font='small-caps 16px NoSuchCanvasCapsFont, "Courier New"';return g.measureText('abc').width;});
        return results;
    }
    async function runEighthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(80,40).getContext('2d');
        const attempt=async fn=>{try{const value=await fn();return {value:value===undefined?'<undefined>':value};}catch(e){return {error:e.name};}};
        const add=async(name,fn)=>{results[name]=await attempt(fn);};
        for(const [name,font] of [
            ['escapedQuote','12px "A\\\"B"'],['escapedIdentifier','12px \\41 rial'],['quotedGeneric','12px "serif"'],
            ['quotedKeyword','12px "inherit"'],['reservedFamily','12px inherit'],['reservedInitial','12px initial'],
            ['multiwordFamily','12px Times New Roman'],['emptyFamily','12px ""'],['fontComment','12px/**/Arial'],
            ['escapedBackslash','12px "A\\\\B"'],['commentSuffix','12px Arial/**/'],['unicodeSpace','12px Arial\u00a0Bold']
        ])await add('fontToken_'+name,()=>{const g=fresh();g.font='14px Arial';g.font=font;return g.font;});
        for(const [name,color] of [
            ['commentPrefix','/**/rgb(255 0 0)'],['commentSuffix','rgb(255 0 0)/**/'],['commentBeforeClose','rgb(255 0 0/**/)'],
            ['namedComment','red/**/'],['escapedName','r\\65 d'],['noneChannel','rgb(none 0 0)'],
            ['legacyMixedHSL','hsl(0, 100, 50)'],['percentageAlpha','rgb(255 0 0 / 12.5%)']
        ])await add('colorToken_'+name,()=>{const g=fresh();g.fillStyle='blue';g.fillStyle=color;g.fillRect(0,0,1,1);return {style:g.fillStyle,pixel:Array.from(g.getImageData(0,0,1,1).data)};});
        for(const family of ['Tahoma','Courier New','Arial']){
            await add('capsBoundaries_'+family,()=>{const g=fresh();g.font=`small-caps 16px "${family}"`;return ['aV','Ta','a-v','a!b','a\u00a0b','\u0301a','a\u0345','µ','ǅ'].map(t=>{const m=g.measureText(t);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];});});
            for(const style of ['italic','bold','bold italic'])await add('capsStyle_'+family+'_'+style,()=>{const g=fresh();g.font=`${style} small-caps 17px "${family}"`;const m=g.measureText('aVéß');return {font:g.font,width:m.width,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent};});
        }
        await add('italicTahomaControl',()=>{const g=fresh();g.font='italic 17px Tahoma';const m=g.measureText('aVéß');return {width:m.width,ascent:m.actualBoundingBoxAscent,descent:m.actualBoundingBoxDescent};});
        await add('italicCapsDerivation',()=>{const g=fresh();return ['italic 12px Tahoma','italic small-caps 17px Tahoma','12px Tahoma'].map(font=>{g.font=font;return ['É','é','A','a','V','ß','SS'].map(t=>{const m=g.measureText(t);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];});});});
        await add('italicTahomaDrawing',()=>{const g=fresh();g.font='italic small-caps 17px Tahoma';g.fillText('aVéß',10,26);return Array.from(g.getImageData(0,0,80,40).data);});
        await add('italicTypefaceControl',()=>['Tahoma','Courier New'].map(family=>{const draw=style=>{const g=fresh();g.font=`${style} 17px "${family}"`;g.fillText('aVéß',10,26);return g.getImageData(0,0,80,40).data;};const equal=(a,b)=>a.every((v,i)=>v===b[i]);return {family,plainEqualsItalic:equal(draw('normal'),draw('italic')),capsEqualsItalic:equal(draw('small-caps'),draw('italic small-caps'))};}));
        for(const family of ['Tahoma','Courier New'])await add('leadingCombiningDrawing_'+family,()=>{const g=fresh();g.font=`small-caps 16px "${family}"`;g.fillText('\u0301a',12,25);return Array.from(g.getImageData(0,0,80,40).data);});
        for(const name of ['width','height']){
            const descriptor=Object.getOwnPropertyDescriptor(Canvas.prototype,name);
            await add('canvasGetterReceiver_'+name,()=>descriptor.get.call({}));
            await add('canvasSetterReceiver_'+name,async()=>{let conversions=0,resizes=0;const failure=await attempt(()=>descriptor.set.call({_width:2,_height:2,_resize(){resizes++;}},{valueOf(){conversions++;return 3;}}));return {failure,conversions,resizes};});
        }
        await add('canvasContextReceiverOrder',async()=>{const log=[];const failure=await attempt(()=>Canvas.prototype.getContext.call({},{toString(){log.push('type');return '2d';}},{get alpha(){log.push('alpha');return true;}}));return {failure,log};});
        await add('canvasTransferReceiver',()=>Canvas.prototype.transferToImageBitmap.call({_contexts:new Map()}));
        await add('canvasBlobReceiverOrder',async()=>{const log=[];const failure=await attempt(()=>Canvas.prototype.convertToBlob.call({},{get type(){log.push('type');return 'image/png';}}));return {failure,log};});
        await add('canvasSubclassControl',()=>{class Derived extends Canvas{}const c=new Derived(2,3);c.height=4;return [c.width,c.height,!!c.getContext('2d')];});
        await add('canvasBlobQualityRejectOrder',async()=>{const c=new Canvas(2,2);c.getContext('2d');const log=[];const failure=await attempt(()=>c.convertToBlob({get quality(){log.push('quality');return Symbol();},get type(){log.push('type');return 'image/png';}}));return {failure,log};});
        await add('fontEscapesSweep',()=>{const g=fresh();return ['12px A\\ B','12px "A\\\"B"','12px "A\\2c B"','12px \\41 rial','12px Arial, "Times New Roman"'].map(font=>{g.font='14px Arial';g.font=font;return g.font;});});
        await add('fontKeywordsSweep',()=>{const g=fresh();return ['inherit','initial','unset','revert','revert-layer','default','SERIF','Times inherit','"SERIF"','"INHERIT"','"Default"','"system-ui"','inherit Times'].map(family=>{g.font='14px Arial';g.font=`12px ${family}`;return g.font;});});
        await add('colorNoneSweep',()=>{const g=fresh();return ['rgb(none 0 0 / none)','hsl(none none none)','rgb(none% 0 0)','hsl(nonedeg 100% 50%)','rgba(none,0,0,1)'].map(color=>{g.fillStyle='blue';g.fillStyle=color;g.fillRect(0,0,1,1);return {style:g.fillStyle,pixel:Array.from(g.getImageData(0,0,1,1).data)};});});
        await add('colorCommentAlpha',()=>{const g=fresh();g.fillStyle='/**/rgb(255 0 0 / 12.5%)/**/';g.fillRect(0,0,1,1);return {style:g.fillStyle,pixel:Array.from(g.getImageData(0,0,1,1).data)};});
        for(const family of ['Tahoma','Courier New'])await add('leadingMarksSweep_'+family,()=>{const g=fresh();g.font=`small-caps 16px "${family}"`;return ['\u0301','\u0301\u0308a','\u0301A','\u0301  a','\u0301ß'].map(t=>{const m=g.measureText(t);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];});});
        for(const method of ['fillText','strokeText'])await add('syntheticItalicPaint_'+method,()=>{const g=fresh();g.font='italic small-caps 17px Tahoma';g.shadowColor='blue';g.shadowBlur=1;g.shadowOffsetX=2;g.translate(2,1);g.scale(1.2,1.1);g[method]('aVéß',4,24);return Array.from(g.getImageData(0,0,80,40).data);});
        for(const method of ['fillText','strokeText'])for(const mode of ['plain','transform','shadow'])await add('syntheticItalicControl_'+method+'_'+mode,()=>{const g=fresh();g.font='italic small-caps 17px Tahoma';if(mode==='shadow'){g.shadowColor='blue';g.shadowBlur=1;g.shadowOffsetX=2;}if(mode==='transform'){g.translate(2,1);g.scale(1.2,1.1);}g[method]('aV\u00e9\u00df',4,24);return Array.from(g.getImageData(0,0,80,40).data);});
        for(const font of ['small-caps 17px Tahoma','italic 17px Tahoma','italic small-caps 17px Arial','italic 12px Tahoma'])await add('scaledFontControl_'+font,()=>{const g=fresh();g.font=font;g.translate(2,1);g.scale(1.2,1.1);g.fillText('aV\u00e9\u00df',4,24);return Array.from(g.getImageData(0,0,80,40).data);});
        for(const mode of ['fractional','rotated','reflected','skewed'])await add('baselineSnap_'+mode,()=>{const g=fresh();g.font='italic 17px Tahoma';g.translate(3.2,0.4);if(mode==='rotated')g.rotate(0.12);if(mode==='reflected'){g.translate(0,39);g.scale(1,-1);}if(mode==='skewed')g.transform(1,0.15,0.1,1,0,0);g.fillText('Abc',4,24.3);return Array.from(g.getImageData(0,0,80,40).data);});
        await add('canvasProxyReceiver',async()=>{let reads=0;const p=new Proxy(new Canvas(2,2),{get(target,key){reads++;return target[key];}});const failure=await attempt(()=>Object.getOwnPropertyDescriptor(Canvas.prototype,'width').get.call(p));return {failure,reads};});
        await add('canvasBlobReceiverTiming',async()=>{let mode,result;try{result=Canvas.prototype.convertToBlob.call(null);mode='returned';}catch(e){mode='threw';result=e.name;}return {mode,result:mode==='returned'?await attempt(()=>result):result};});
        await add('canvasBitmapReceiver',()=>{const c=new Canvas(2,2);c.getContext('2d');const b=c.transferToImageBitmap();try{return Object.getOwnPropertyDescriptor(Canvas.prototype,'width').get.call(b);}finally{b.close();}});
        return results;
    }
    async function runNinthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(96,48).getContext('2d');
        const attempt=async fn=>{try{const value=await fn();return {value:value===undefined?'<undefined>':value};}catch(e){return {error:e.name};}};
        const add=async(name,fn)=>{results[name]=await attempt(fn);};
        for(const [name,font] of [
            ['hexCRLF','12px "\\41\r\nrial"'],['escapedCRLF','12px "A\\\r\nrial"'],
            ['escapedLF','12px "A\\\nrial"'],['escapedFF','12px "A\\\frial"'],['literalFF','12px "A\frial"'],
            ['verticalTabSeparator','12px\u000bArial'],['quotedVerticalTab','12px "A\u000brial"'],
            ['escapedSlash','12px A\\/B'],['escapedQuoteComment','12px A\\\"B/**/, Arial'],
            ['genericMultiword','12px serif Arial'],['genericAfterWord','12px Arial serif'],
            ['familyEscapedComma','12px A\\,B, Arial'],['hexFamilyComma','12px "\\41rial", Arial'],
            ['weightBolder','bolder 12px Arial'],['weightLighter','lighter 12px Arial'],['fractionalWeight','450.5 12px Arial'],
            ['threeNormals','normal normal normal 12px Arial'],['fourNormals','normal normal normal normal 12px Arial'],
            ['normalAfterBold','bold normal normal normal 12px Arial'],['obliqueAngle','oblique 10deg 12px Arial']
        ])await add('fontBoundary_'+name,()=>{const g=fresh();g.font='14px Arial';g.font=font;return {font:g.font,width:g.measureText('AVabc').width};});
        for(const [name,color] of [
            ['verticalTab','rgb(255\u000b0 0)'],['nbsp','rgb(255\u00a00 0)'],['commentSplitNumber','rgb(2/**/55 0 0)'],
            ['commentFunctionName','rgb/**/(255 0 0)'],['unterminatedComment','rgb(255 0 0)/*'],
            ['rgbMixedUnits','rgb(100% 0 0 / 50%)'],['legacyHslAlpha','hsla(0, 100%, 50%, 50%)'],
            ['noneUppercase','RGB(NONE 0 0 / NONE)'],['hslUnitlessModern','hsl(120 100 50)'],
            ['hslNonePercent','hsl(120 none 50%)'],['hslZeroPercent','hsl(120 0% 50%)'],
            ['hslZeroUnitless','hsl(120 0 50)'],['hexGrayControl','#808080']
        ])await add('colorBoundary_'+name,()=>{const g=fresh();g.fillStyle='blue';g.fillStyle=color;g.fillRect(0,0,1,1);return {style:g.fillStyle,pixel:Array.from(g.getImageData(0,0,1,1).data)};});
        const bitmap=()=>{const c=new Canvas(2,3);const g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,2,3);return c.transferToImageBitmap();};
        for(const name of ['width','height'])await add('bitmapGetterReceiver_'+name,()=>{const b=bitmap();try{return Object.getOwnPropertyDescriptor(Object.getPrototypeOf(b),name).get.call({});}finally{b.close();}});
        await add('bitmapCloseReceiver',()=>{const b=bitmap();try{return Object.getPrototypeOf(b).close.call({});}finally{b.close();}});
        await add('bitmapProxyGetter',()=>{const b=bitmap();try{return new Proxy(b,{}).width;}finally{b.close();}});
        await add('bitmapConstructor',()=>{const b=bitmap();try{const made=new b.constructor(1,1,new Uint8ClampedArray(4));try{return [made.width,made.height];}finally{made.close();}}finally{b.close();}});
        await add('bitmapCloseTwice',()=>{const b=bitmap();b.close();b.close();return [b.width,b.height];});
        await add('bitmapSnapshotLifetime',()=>{const c=new Canvas(2,2),g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,2,2);const b=c.transferToImageBitmap();g.fillStyle='blue';g.fillRect(0,0,2,2);const target=fresh();target.drawImage(b,0,0);b.close();return Array.from(target.getImageData(0,0,1,1).data);});
        await add('contextReentryAttributes',()=>{const c=new Canvas(2,2);let inner;const outer=c.getContext('2d',{get alpha(){inner=c.getContext('2d',{alpha:false});return true;}});return {same:inner===outer,alpha:outer.getContextAttributes().alpha};});
        await add('contextReentryResize',()=>{const c=new Canvas(2,2);const g=c.getContext('2d',{get alpha(){c.width=4;return false;}});return [c.width,c.height,g.getImageData(0,0,1,1).data[3]];});
        await add('contextBorrowedMethod',()=>{const a=fresh(),b=fresh();a.fillStyle='red';b.fillStyle='blue';a.fillRect.call(b,0,0,1,1);return [Array.from(a.getImageData(0,0,1,1).data),Array.from(b.getImageData(0,0,1,1).data)];});
        for(const [name,text] of [['greek','\u03b1\u03b2\u03c2'],['ligatures','\ufb01\ufb03'],['leadingSpacingMark','\u093ea'],['supplementaryMark','\u{1d185}a'],['leadingCGJ','\u034fa'],['wordJoiner','a\u2060b']])await add('capsUnicode_'+name,()=>{const g=fresh();g.font='small-caps 17px Tahoma';const m=g.measureText(text);g.fillText(text,4,30);return {metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,96,48).data)};});
        for(const [name,text] of [['spacingMark','\u093ea'],['supplementaryMark','\u{1d185}a'],['supplementaryMarkOnly','\u{1d185}']])await add('normalUnicode_'+name,()=>{const g=fresh();g.font='17px Tahoma';const m=g.measureText(text);g.fillText(text,4,30);return {metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,96,48).data)};});
        for(const family of ['Arial','Tahoma'])await add('obliqueAngles_'+family,()=>{const g=fresh();return [-91,-90,-10,0,1,10,14,20,90,91].map(angle=>{g.font='14px Arial';g.font=`oblique ${angle}deg 17px "${family}"`;const m=g.measureText('AVabc');return [g.font,m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent];});});
        for(const family of ['Arial','Tahoma'])for(const angle of [-10,10])await add('obliquePaint_'+family+'_'+angle,()=>{const g=fresh();g.font=`oblique ${angle}deg 17px "${family}"`;g.fillText('AVabc',4,30);return Array.from(g.getImageData(0,0,96,48).data);});
        await add('unicodeFontControls',()=>['Tahoma','Nirmala UI','Mangal','Segoe UI Symbol'].map(family=>{const g=fresh();g.font=`17px "${family}"`;return {family,widths:['\u093e','\u{1d185}','a'].map(text=>g.measureText(text).width)};}));
        await add('hslGraySweep',()=>{const g=fresh();return [0,10,25,33,49,50,51,75,90,100].map(l=>{g.fillStyle=`hsl(0 0% ${l}%)`;g.fillRect(0,0,1,1);return [g.fillStyle,...g.getImageData(0,0,1,1).data];});});
        await add('hslStateRestore',()=>{const g=fresh();g.fillStyle='hsl(0 0% 50%)';g.strokeStyle='hsl(120 100% 50% / 50%)';g.globalAlpha=0.7;g.save();g.fillStyle='red';g.strokeStyle='blue';g.globalAlpha=1;g.restore();g.fillRect(0,0,5,5);g.strokeRect(8,2,4,4);return {styles:[g.fillStyle,g.strokeStyle],pixels:Array.from(g.getImageData(0,0,16,8).data)};});
        await add('hslColorSweep',()=>['hsl(30 60% 45%)','hsl(-70 25% 75% / 30%)','hsla(0, 100%, 50%, .5)','hsl(1rad 50% 50%)','hsl(120 10% 90%)'].map(color=>{const g=fresh();g.fillStyle=color;g.fillRect(0,0,1,1);return [g.fillStyle,...g.getImageData(0,0,1,1).data];}));
        await add('obliqueStateRestore',()=>{const g=fresh();g.font='oblique 10deg bold small-caps 17px Arial';g.save();g.font='12px Tahoma';g.restore();g.fillText('aB',2,30);return {font:g.font,width:g.measureText('aB').width,pixels:Array.from(g.getImageData(0,0,96,48).data)};});
        await add('obliqueAngleUnits',()=>{const g=fresh();return ['oblique 0.025turn 17px Arial','oblique 10grad 17px Arial','oblique 0rad 17px Arial','oblique 17px Arial'].map(font=>{g.font=font;return [g.font,g.measureText('AVabc').width];});});
        for(const method of ['fillText','strokeText'])await add('fallbackPaint_'+method,()=>{const g=fresh();g.font='small-caps 17px Tahoma';g.shadowColor='blue';g.shadowBlur=1;g.shadowOffsetX=2;g.translate(0.2,0.3);g[method]('\u093ea\u{1d185}',4,30);return Array.from(g.getImageData(0,0,96,48).data);});
        await add('nativeCapsWithFallback',()=>{const g=fresh();g.font='small-caps 17px Arial';const text='a\u{1d185}b';g.fillText(text,4,30);return {width:g.measureText(text).width,pixels:Array.from(g.getImageData(0,0,96,48).data)};});
        for(const font of ['17px Tahoma','italic 17px Tahoma','small-caps 17px Tahoma'])await add('fractionalBaselineStroke_'+font,()=>{const g=fresh();g.font=font;g.lineWidth=1.5;g.translate(2.25,1.3);g.scale(1.125,0.875);g.strokeText('Abc',3.3,30.7);return Array.from(g.getImageData(0,0,96,48).data);});
        return results;
    }
    async function runTenthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(96,48).getContext('2d');
        const attempt=async fn=>{try{const value=await fn();return {value:value===undefined?'<undefined>':value};}catch(e){return {error:e.name};}};
        const add=async(name,fn)=>{results[name]=await attempt(fn);};
        const bitmap=()=>{const c=new Canvas(2,2),g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,2,2);return c.transferToImageBitmap();};
        for(const operation of ['freeze','seal','preventExtensions'])await add('bitmapIntegrity_'+operation,async()=>{const b=bitmap();Object[operation](b);const result=await attempt(()=>b.close());return {result,size:[b.width,b.height]};});
        for(const operation of ['freeze','seal','preventExtensions'])await add('canvasIntegrity_'+operation,async()=>{const c=new Canvas(2,2),g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,2,2);Object[operation](c);const result=await attempt(()=>{c.width=3;});return {result,size:[c.width,c.height],style:g.fillStyle,pixels:Array.from(g.getImageData(0,0,3,1).data)};});
        await add('frozenCanvasCreateContext',()=>{const c=new Canvas(2,2);Object.freeze(c);const g=c.getContext('2d');g.fillRect(0,0,1,1);return [g.canvas===c,...g.getImageData(0,0,1,1).data];});
        await add('frozenContextState',()=>{const g=fresh();Object.freeze(g);g.fillStyle='red';g.fillRect(0,0,1,1);return [g.fillStyle,...g.getImageData(0,0,1,1).data];});
        await add('frozenBitmapDraw',()=>{const b=bitmap();Object.freeze(b);const g=fresh();g.drawImage(b,0,0);return Array.from(g.getImageData(0,0,1,1).data);});
        await add('bitmapOwnWidthShadow',async()=>{const b=bitmap();Object.defineProperty(b,'width',{value:0});const g=fresh();const result=await attempt(()=>g.drawImage(b,0,0));b.close();return {result,pixels:Array.from(g.getImageData(0,0,1,1).data)};});
        await add('canvasOwnWidthShadow',async()=>{const c=new Canvas(2,2),g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,2,2);Object.defineProperty(c,'width',{value:0});const target=fresh();const result=await attempt(()=>target.drawImage(c,0,0));return {result,pixels:Array.from(target.getImageData(0,0,1,1).data)};});
        for(const [name,color] of [['hslGray','hsl(0 0% 50%)'],['hexGray','#808080'],['hslAlpha','hsl(0 100% 50% / 50%)'],['rgbaAlpha','rgba(255,0,0,.5)']]){
            await add('shadowColorPath_'+name,()=>{const g=fresh();g.shadowColor=color;g.shadowOffsetX=4;g.fillRect(0,0,2,2);return {style:g.shadowColor,pixels:Array.from(g.getImageData(4,0,2,2).data)};});
            for(const kind of ['linear','radial','conic'])await add('gradientColorPath_'+kind+'_'+name,()=>{const g=fresh();const gradient=kind==='linear'?g.createLinearGradient(0,0,8,0):kind==='radial'?g.createRadialGradient(4,4,0,4,4,8):g.createConicGradient(0,4,4);gradient.addColorStop(0,color);gradient.addColorStop(1,color);g.fillStyle=gradient;g.fillRect(0,0,8,8);return Array.from(g.getImageData(0,0,8,8).data);});
        }
        for(const [name,color] of [['numeric','hsl(0 100% 50% / .5)'],['numericComment','hsl(0 100% 50% / .5)/**/'],['numericExponent','hsl(0 100% 50% / 5e-1)'],['numericNoneHue','hsl(none 100% 50% / .5)'],['numericUnitless','hsl(0 100 50 / .5)'],['precision','hsl(33.3 66.6% 44.4% / 33.3%)']])await add('hslParserRoute_'+name,()=>{const g=fresh();g.fillStyle=color;g.fillRect(0,0,1,1);return [g.fillStyle,...g.getImageData(0,0,1,1).data];});
        for(const [name,text] of [['leadingTwoMarks','\u{1d185}\u0301a'],['mixedScripts','a\u093eB'],['musicalBase','\u{1d11e}\u{1d185}a'],['cjk','A\u4e2da']])for(const style of ['normal','small-caps'])await add('fallbackClusters_'+name+'_'+style,()=>{const g=fresh();g.font=`${style} 17px Tahoma`;const m=g.measureText(text);g.fillText(text,4,30);return {metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,96,48).data)};});
        for(const family of ['Microsoft YaHei','Microsoft YaHei UI','SimSun','Noto Sans SC'])await add('cjkTypefaceControl_'+family,()=>{const g=fresh();g.font=`17px "${family}"`;const text='A\u4e2da',m=g.measureText(text);g.fillText(text,4,30);return {metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,96,48).data)};});
        await add('gradientFrozenObject',()=>{const g=fresh(),gradient=g.createLinearGradient(0,0,8,0);Object.freeze(gradient);gradient.addColorStop(0,'red');gradient.addColorStop(1,'red');g.fillStyle=gradient;g.fillRect(0,0,1,1);return Array.from(g.getImageData(0,0,1,1).data);});
        for(const sourceKind of ['canvas','bitmap'])for(const method of ['drawImage','createPattern'])await add('internalSource_'+sourceKind+'_'+method,()=>{
            const c=new Canvas(2,2),g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,2,2);
            const source=sourceKind==='canvas'?c:c.transferToImageBitmap();let reads=0;
            for(const key of ['width','height','data'])Object.defineProperty(source,key,{get(){reads++;throw new Error('Public source getter');}});
            Object.freeze(source);const target=fresh();
            if(method==='drawImage')target.drawImage(source,0,0,2,2,0,0,4,4);
            else {target.fillStyle=target.createPattern(source,'repeat');target.fillRect(0,0,4,4);}
            return {reads,pixels:Array.from(target.getImageData(0,0,4,4).data)};
        });
        await add('frozenCanvasHeightAndTransfer',()=>{const c=new Canvas(2,2);Object.freeze(c);const g=c.getContext('2d');c.height=3;g.fillStyle='red';g.fillRect(0,2,2,1);const b=c.transferToImageBitmap(),target=fresh();target.drawImage(b,0,0);return {size:[c.width,c.height,b.width,b.height],pixels:Array.from(target.getImageData(0,2,2,1).data),cleared:Array.from(g.getImageData(0,2,2,1).data)};});
        await add('frozenBitmapRepeatedClose',async()=>{const b=bitmap();Object.freeze(b);b.close();b.close();const g=fresh();return {size:[b.width,b.height],draw:await attempt(()=>g.drawImage(b,0,0)),pattern:await attempt(()=>g.createPattern(b,'repeat'))};});
        await add('shadowFloatSaveRestore',()=>{const g=fresh();g.shadowColor='hsl(0 0% 50% / 50%)';g.shadowOffsetX=4;g.save();g.shadowColor='red';g.restore();g.fillRect(0,0,2,2);return {style:g.shadowColor,pixels:Array.from(g.getImageData(4,0,2,2).data)};});
        for(const repetition of ['repeat','repeat-x','repeat-y','no-repeat'])await add('patternTexture_'+repetition,()=>{const c=new Canvas(2,2),source=c.getContext('2d');source.fillStyle='red';source.fillRect(0,0,1,2);source.fillStyle='blue';source.fillRect(1,0,1,2);const g=fresh();g.fillStyle=g.createPattern(c,repetition);g.fillRect(0,0,6,6);return Array.from(g.getImageData(0,0,6,6).data);});
        for(const [name,color] of [['degrees','hsl(0deg 100% 50% / .5)'],['turns','hsl(.5turn 100% 50% / .5)'],['plusHue','hsl(+0 100% 50% / .5)'],['plusAlpha','hsl(0 100% 50% / +.5)'],['fractionSaturation','hsl(0 .5% 50% / .5)'],['exponentHue','hsl(0e0 100% 50% / .5)'],['exponentSaturation','hsl(0 1e2% 50% / .5)'],['alphaTrailingSpace','hsl(0 100% 50% / .5 )'],['outerSpace',' hsl(0 100% 50% / .5) '],['internalComment','hsl(0/**/ 100% 50% / .5)']])await add('hslFastBoundary_'+name,()=>{const g=fresh();g.fillStyle=color;g.fillRect(0,0,1,1);g.shadowColor=color;g.shadowOffsetX=4;g.fillRect(0,2,1,1);return {style:g.fillStyle,shadow:g.shadowColor,pixels:Array.from(g.getImageData(0,0,1,1).data),shadowPixels:Array.from(g.getImageData(4,2,1,1).data)};});
        for(const size of [12,16,20,24])for(const style of ['normal','small-caps'])await add('bitmapFontSize_'+size+'_'+style,()=>{const g=fresh();g.font=`${style} ${size}px SimSun`;const text='A\u4e2da',m=g.measureText(text);g.fillText(text,4,30);return {metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,96,48).data)};});
        return results;
    }
    async function runEleventhRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(64,40).getContext('2d');
        const attempt=async fn=>{try{const value=await fn();return {value:value===undefined?'<undefined>':value};}catch(e){return {error:e.name};}};
        const add=async(name,fn)=>{results[name]=await attempt(fn);};
        const pixels=g=>Array.from(g.getImageData(0,0,16,12).data);
        const source=()=>{const c=new Canvas(2,2),g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,1,2);g.fillStyle='blue';g.fillRect(1,0,1,2);return c;};
        for(const prop of ['fillStyle','strokeStyle'])await add('patternIdentity_'+prop,()=>{const g=fresh(),p=g.createPattern(source(),'repeat');g[prop]=p;const before=g[prop]===p;g.save();g[prop]='green';g.restore();return {before,restored:g[prop]===p,type:typeof g[prop]};});
        await add('patternCrossContextIdentity',()=>{const g=fresh(),h=fresh(),p=g.createPattern(source(),'repeat');g.fillStyle=p;h.fillStyle=p;h.fillRect(0,0,8,8);return {identity:h.fillStyle===p,pixels:pixels(h)};});
        await add('patternSetTransformAPI',()=>{const p=fresh().createPattern(source(),'repeat');return {type:typeof p.setTransform,tag:Object.prototype.toString.call(p)};});
        for(const [name,matrix] of [['identity',{}],['translation',{e:3,f:2}],['scale',{a:2,d:3}],['singular',{a:0,d:0}],['nonfinite',{a:Infinity}],['aliasConflict',{a:1,m11:2}]])await add('patternTransform_'+name,async()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');g.fillStyle=p;const result=await attempt(()=>p.setTransform(matrix));g.fillRect(0,0,16,12);return {available:typeof p.setTransform==='function',result,pixels:pixels(g)};});
        await add('patternTransformAfterSave',async()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');g.fillStyle=p;g.save();const result=await attempt(()=>p.setTransform({e:4}));g.restore();g.fillRect(0,0,16,12);return {available:typeof p.setTransform==='function',result,pixels:pixels(g)};});
        await add('patternFrozenTransform',async()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');Object.freeze(p);const result=await attempt(()=>p.setTransform({e:4}));g.fillStyle=p;g.fillRect(0,0,16,12);return {available:typeof p.setTransform==='function',result,pixels:pixels(g)};});
        for(const smoothing of [true,false])await add('patternSmoothing_'+smoothing,()=>{const g=fresh();g.imageSmoothingEnabled=smoothing;g.fillStyle=g.createPattern(source(),'repeat');g.scale(2.5,2.5);g.fillRect(0,0,8,8);return pixels(g);});
        for(const kind of ['canvas','bitmap'])await add('patternSnapshot_'+kind,()=>{const c=source(),b=kind==='bitmap'?c.transferToImageBitmap():c,g=fresh(),p=g.createPattern(b,'repeat');if(kind==='bitmap')b.close();else {const h=c.getContext('2d');h.fillStyle='green';h.fillRect(0,0,2,2);}g.fillStyle=p;g.fillRect(0,0,8,8);return pixels(g);});
        await add('patternAlphaShadow',()=>{const g=fresh();g.globalAlpha=.5;g.shadowColor='red';g.shadowOffsetX=4;g.fillStyle=g.createPattern(source(),'no-repeat');g.fillRect(0,0,2,2);return pixels(g);});
        for(const prop of ['fillStyle','strokeStyle'])await add('patternInvalidAssignment_'+prop,()=>{const g=fresh(),p=g.createPattern(source(),'repeat');g[prop]=p;g[prop]='not-a-color';return g[prop]===p;});
        for(const operation of ['drawImage','createPattern','transfer','blob'])await add('sourceReadbackOverride_'+operation,async()=>{const c=source(),h=c.getContext('2d'),g=fresh();let calls=0;h.getImageData=()=>{calls++;throw new RangeError('Public context method');};const result=await attempt(async()=>{if(operation==='drawImage')g.drawImage(c,0,0);else if(operation==='createPattern'){g.fillStyle=g.createPattern(c,'repeat');g.fillRect(0,0,4,4);}else if(operation==='transfer')g.drawImage(c.transferToImageBitmap(),0,0);else {const b=await c.convertToBlob();return {type:b.type,nonempty:b.size>0};}return pixels(g);});return {calls,result};});
        await add('sourceResizeOverride',async()=>{const c=source(),g=c.getContext('2d');let calls=0;g._resize=()=>{calls++;throw new RangeError('Public resize hook');};const result=await attempt(()=>{c.width=3;});return {calls,result,size:[c.width,c.height],pixels:Array.from(g.getImageData(0,0,3,1).data)};});
        await add('sourceTransferClearOverride',async()=>{const c=source(),g=c.getContext('2d'),target=fresh();let calls=0;g._clearBitmap=()=>{calls++;throw new RangeError('Public clear hook');};const result=await attempt(()=>target.drawImage(c.transferToImageBitmap(),0,0));return {calls,result,pixels:pixels(target),source:Array.from(g.getImageData(0,0,2,2).data)};});
        for(const family of ['Microsoft YaHei','SimSun','Noto Sans SC'])for(const style of ['normal','small-caps'])await add('fallbackFamilyList_'+family+'_'+style,()=>{const g=fresh();g.font=style+' 17px Tahoma, "'+family+'"';const text='A\u4e2da',m=g.measureText(text);g.fillText(text,4,30);return {font:g.font,metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,64,40).data)};});
        for(const style of ['italic','small-caps','normal'])await add('fallbackMixedStyle_'+style,()=>{const g=fresh();g.font=style+' 17px Tahoma';const text='a\u093eB\u4e2d',m=g.measureText(text);g.fillText(text,4,30);return {metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,64,40).data)};});
        for(const [name,matrix] of [['null',null],['undefined',undefined],['primitive',3],['symbol',Symbol('matrix')],['nan',{a:NaN}],['negativeInfinity',{e:-Infinity}],['largeFinite',{a:1e100}]])await add('patternMatrixBoundary_'+name,async()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');p.setTransform({e:3});const result=await attempt(()=>p.setTransform(matrix));g.fillStyle=p;g.fillRect(0,0,16,12);return {result,pixels:pixels(g)};});
        await add('patternMatrixReadOrder',async()=>{const p=fresh().createPattern(source(),'repeat'),reads=[],matrix={};for(const key of ['a','b','c','d','e','f','m11','m12','m21','m22','m41','m42'])Object.defineProperty(matrix,key,{get(){reads.push(key);return {valueOf(){reads.push('convert:'+key);return key==='a'||key==='d'||key==='m11'||key==='m22'?1:0;}};}});return {result:await attempt(()=>p.setTransform(matrix)),reads};});
        await add('patternMatrixBadReceiver',async()=>{const p=fresh().createPattern(source(),'repeat');let reads=0;const result=await attempt(()=>p.setTransform.call({}, {get a(){reads++;return 1;}}));return {result,reads};});
        await add('patternMatrixThrowAtomic',async()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');p.setTransform({e:3});const result=await attempt(()=>p.setTransform({e:7,get f(){throw new RangeError('matrix');}}));g.fillStyle=p;g.fillRect(0,0,16,12);return {result,pixels:pixels(g)};});
        await add('patternMatrixReentrant',()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');p.setTransform({get a(){p.setTransform({e:9});return 1;},e:3});g.fillStyle=p;g.fillRect(0,0,16,12);return pixels(g);});
        await add('patternMatrixReset',()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');p.setTransform({e:5});p.setTransform();g.fillStyle=p;g.fillRect(0,0,16,12);return pixels(g);});
        await add('patternSharedMutation',()=>{const g=fresh(),h=fresh(),p=g.createPattern(source(),'no-repeat');g.fillStyle=p;h.fillStyle=p;g.save();p.setTransform({e:4});g.restore();g.fillRect(0,0,16,12);h.fillRect(0,0,16,12);return {identity:g.fillStyle===h.fillStyle,g:pixels(g),h:pixels(h)};});
        for(const smoothing of [true,false])await add('patternTransparentSampling_'+smoothing,()=>{const c=new Canvas(2,2),h=c.getContext('2d');h.fillStyle='rgba(255,0,0,.5)';h.fillRect(0,0,1,2);h.fillStyle='rgba(0,0,255,.25)';h.fillRect(1,0,1,2);const g=fresh(),p=g.createPattern(c,'no-repeat');p.setTransform({a:2,d:3});g.imageSmoothingEnabled=smoothing;g.fillStyle=p;g.fillRect(0,0,16,12);return pixels(g);});
        await add('patternSmoothingChange',()=>{const g=fresh(),p=g.createPattern(source(),'repeat');g.fillStyle=p;g.scale(2.5,2.5);g.imageSmoothingEnabled=false;g.fillRect(0,0,6,2);g.imageSmoothingEnabled=true;g.fillRect(0,2,6,2);return pixels(g);});
        await add('patternStrokeTransform',()=>{const g=fresh(),p=g.createPattern(source(),'repeat');p.setTransform({e:.5,a:2,d:2});g.strokeStyle=p;g.lineWidth=3;g.strokeRect(3,3,8,6);return pixels(g);});
        for(const family of ['Microsoft YaHei','SimSun'])await add('fallbackLaterCandidate_'+family,()=>{const g=fresh();g.font='17px Tahoma, MissingCanvasFont, "'+family+'"';const m=g.measureText('A\u4e2da');g.fillText('A\u4e2da',4,30);return {metrics:[m.width,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:Array.from(g.getImageData(0,0,64,40).data)};});
        await add('internalMethodGetterIsolation',()=>{const c=source(),g=c.getContext('2d'),h=fresh();let reads=0;for(const name of ['getImageData','_resize','_clearBitmap'])Object.defineProperty(g,name,{get(){reads++;throw new RangeError('public method');}});h.drawImage(c,0,0);const b=c.transferToImageBitmap();c.width=3;return {reads,size:[c.width,c.height,b.width,b.height],pixels:pixels(h)};});
        return results;
    }
    async function runTwelfthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(96,48).getContext('2d');
        const add=async(name,fn)=>{try{const value=await fn();results[name]={value:value===undefined?'<undefined>':value};}catch(e){results[name]={error:e.name};}};
        const norm=v=>v===undefined?'<undefined>':v;
        const pixels=g=>Array.from(g.getImageData(0,0,96,48).data);
        const textResult=(g,text)=>{const m=g.measureText(text);g.fillText(text,4,32);return {metrics:[m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent],pixels:pixels(g)};};
        const source=()=>{const c=new Canvas(8,8),g=c.getContext('2d');for(let y=0;y<8;y++)for(let x=0;x<8;x++){g.fillStyle=(x+y)%2?'red':'blue';g.fillRect(x,y,1,1);}return c;};
        for(const kind of ['drawImage','pattern'])for(const quality of ['low','medium','high'])await add('samplingQuality_'+kind+'_'+quality,()=>{const g=fresh();g.imageSmoothingQuality=quality;if(kind==='drawImage')g.drawImage(source(),0,0,3,3);else {const p=g.createPattern(source(),'no-repeat');p.setTransform({a:3/8,d:3/8});g.fillStyle=p;g.fillRect(0,0,8,8);}return {quality:g.imageSmoothingQuality,pixels:Array.from(g.getImageData(0,0,8,8).data)};});
        await add('samplingQualityState',()=>{const c=new Canvas(8,8),g=c.getContext('2d'),initial=norm(g.imageSmoothingQuality);g.imageSmoothingQuality='high';g.save();g.imageSmoothingQuality='low';g.restore();const restored=norm(g.imageSmoothingQuality);g.imageSmoothingQuality='invalid';const invalid=norm(g.imageSmoothingQuality);c.width=8;return {initial,restored,invalid,reset:norm(g.imageSmoothingQuality)};});
        for(const [name,matrix] of [['rotate',{a:0,b:1,c:-1,d:0,e:10,f:1}],['shear',{a:1,b:.25,c:.5,d:1,e:2,f:1}],['reflect',{a:-1,d:1,e:10}],['singular',{a:0,d:0}]])await add('patternComposite_'+name,()=>{const g=fresh(),p=g.createPattern(source(),'no-repeat');p.setTransform(matrix);g.fillStyle='green';g.fillRect(0,0,16,16);g.globalCompositeOperation='copy';g.fillStyle=p;g.fillRect(0,0,16,16);return Array.from(g.getImageData(0,0,16,16).data);});
        await add('patternSurvivesSourceResize',()=>{const c=source(),g=fresh(),p=g.createPattern(c,'repeat');c.width=0;g.fillStyle=p;g.fillRect(0,0,8,8);return Array.from(g.getImageData(0,0,8,8).data);});
        await add('patternPrototypeContract',()=>{const p=fresh().createPattern(source(),'repeat'),proto=Object.getPrototypeOf(p),method=Object.getOwnPropertyDescriptor(proto,'setTransform'),tag=Object.getOwnPropertyDescriptor(proto,Symbol.toStringTag);return {method:{length:p.setTransform.length,enumerable:method.enumerable,writable:method.writable,configurable:method.configurable},tag:{value:norm(tag.value),get:typeof tag.get,writable:norm(tag.writable),enumerable:tag.enumerable,configurable:tag.configurable}};});
        for(const [property,value,alternate] of [['letterSpacing','2px','4px'],['wordSpacing','3px','6px'],['fontKerning','none','normal']])await add('textPropertyState_'+property,()=>{const c=new Canvas(16,16),g=c.getContext('2d'),initial=norm(g[property]);g[property]=value;g.save();g[property]=alternate;g.restore();const restored=norm(g[property]);g[property]='invalid';const invalid=norm(g[property]);c.width=16;return {initial,restored,invalid,reset:norm(g[property])};});
        for(const [property,values,text] of [['letterSpacing',['0px','2px','-1px'],'ABC'],['wordSpacing',['0px','3px','-1px'],'A B C'],['fontKerning',['auto','normal','none'],'AVATAR']])for(const value of values)await add('textPropertyDraw_'+property+'_'+value,()=>{const g=fresh();g.font='20px Arial';g[property]=value;return {property:g[property],...textResult(g,text)};});
        for(const base of ['Arial','Tahoma'])for(const fallback of ['Microsoft YaHei','SimSun','Noto Sans SC'])await add('italicFallback_'+base+'_'+fallback,()=>{const g=fresh();g.font='italic 17px '+base+', "'+fallback+'"';return textResult(g,'A\u4e2da');});
        for(const direction of ['ltr','rtl'])for(const text of ['\u05d0\u05d1\u05d2','ab \u05d0\u05d1 12'])await add('bidi_'+direction+'_'+text,()=>{const g=fresh();g.font='17px Arial';g.direction=direction;g.textAlign='left';return textResult(g,text);});
        for(const property of ['letterSpacing','wordSpacing'])await add('spacingGrammar_'+property,()=>{const g=fresh();g.font='20px Arial';return ['2PX','  +2.50px  ','1pt','1em','1rem','0','2','normal','10%','2 px','1e2px','-0px','calc(1px + 2px)','1cm'].map(value=>{g[property]='3px';g[property]=value;return [value,g[property],g.measureText('A B').width];});});
        for(const property of ['letterSpacing','wordSpacing','fontKerning','imageSmoothingQuality']) {
            await add('propertyCoercion_'+property,()=>{const g=fresh();let calls=0;g[property]={toString(){calls++;return property==='fontKerning'?'none':property==='imageSmoothingQuality'?'high':'2px';}};let error;try{g[property]=Symbol('value');}catch(e){error=e.name;}return {calls,value:g[property],error};});
            await add('propertyReentry_'+property,()=>{const c=new Canvas(96,48),g=c.getContext('2d');g.save();let calls=0;g[property]={toString(){calls++;c.width=96;return property==='fontKerning'?'none':property==='imageSmoothingQuality'?'high':'2px';}};g.restore();return {calls,value:g[property]};});
        }
        await add('spacingWhitespaceSweep',()=>{const g=fresh();g.font='17px Arial';return ['A B',' A B','A  B','A B ',' A  B ','A\u00a0B','A\tB'].map(text=>{g.wordSpacing='0px';const base=g.measureText(text).width;g.wordSpacing='2px';return [text,base,g.measureText(text).width];});});
        await add('spacingLexicalSweep',()=>{const g=fresh();return ['2px ',' 2px','+2px','2.5px','+2.50px','2PX','2ex','2ch','2vw','2vh','2rem','2em'].map(value=>{g.letterSpacing='3px';g.letterSpacing=value;return [value,g.letterSpacing,g.measureText('AB').width];});});
        await add('spacingCombinedOrder',()=>{return [false,true].map(reverse=>{const g=fresh();g.font='17px Arial';if(reverse){g.wordSpacing='2px';g.letterSpacing='1.5px';}else{g.letterSpacing='1.5px';g.wordSpacing='2px';}return {reverse,letter:g.letterSpacing,word:g.wordSpacing,widths:['A B',' A  B ','A\u00a0B'].map(t=>g.measureText(t).width)};});});
        await add('spacingMetricsBeforeAfterDraw',()=>{const g=fresh();g.font='17px Arial';g.letterSpacing='1.5px';g.wordSpacing='2px';const text=' A  B ',m=g.measureText(text),before=m.width;g.fillText(text,4,32);return {before,after:m.width,newWidth:g.measureText(text).width,word:g.wordSpacing};});
        await add('spacingCacheOrder',()=>[' A','A ','A B'].map(first=>{const g=fresh();g.font='17px Arial';g.letterSpacing='1.5px';g.wordSpacing='2px';const initial=g.measureText(first).width;const target=g.measureText(' A  B ').width;g.wordSpacing='3px';const changed=g.measureText(' A  B ').width;g.wordSpacing='2px';const restored=g.measureText(' A  B ').width;return {first,initial,target,changed,restored};}));
        const spaced=g=>{g.font='17px Arial';g.letterSpacing='1.5px';g.wordSpacing='2px';return g;};
        await add('spacingCacheContextIsolation',()=>{const a=spaced(fresh()),b=spaced(fresh());a.measureText('A ');b.measureText(' A');return [a.measureText(' A B ').width,b.measureText(' A B ').width];});
        await add('spacingCacheSaveRestore',()=>{const g=spaced(fresh());g.measureText('A ');g.save();g.wordSpacing='3px';const changed=g.measureText(' A B ').width;g.restore();return [changed,g.measureText(' A B ').width];});
        for(const action of ['reset','resize','zeroResize'])await add('spacingCacheLifecycle_'+action,()=>{const c=new Canvas(96,48),g=spaced(c.getContext('2d'));g.measureText('A ');if(action==='reset')g.reset();else {if(action==='zeroResize')c.width=0;c.width=96;}spaced(g);return textResult(g,' A B ');});
        for(const method of ['fillText','strokeText'])await add('spacingCacheFirstDraw_'+method,()=>{const g=spaced(fresh());g[method](' A',4,25);return textResult(g,'A B');});
        for(const direction of ['ltr','rtl'])await add('spacingCacheDirection_'+direction,()=>{const g=spaced(fresh());g.direction=direction;g.textAlign='left';const before=g.measureText(' \u05d0\u05d1 ').width;return {before,...textResult(g,' \u05d0\u05d1 A ')};});
        await add('spacingFontChange',()=>{const g=fresh();g.font='20px Arial';g.letterSpacing='1em';const before=g.measureText('AB').width;g.font='10px Arial';return {before,spacing:g.letterSpacing,...textResult(g,'AB')};});
        for(const [name,text] of [['combining','a\u0301b'],['ligature','office'],['fallback','A\u4e2da'],['spaces',' A  B ']])await add('spacingClusters_'+name,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing='1.5px';g.wordSpacing='2px';return textResult(g,text);});
        await add('textOptionsSavedDrawing',()=>{const g=fresh();g.font='20px Arial';g.letterSpacing='2px';g.wordSpacing='1px';g.fontKerning='none';g.save();g.letterSpacing='0px';g.wordSpacing='0px';g.fontKerning='auto';g.restore();return textResult(g,'AV A');});
        for(const direction of ['ltr','rtl'])await add('bidiStrokeMaxWidth_'+direction,()=>{const g=fresh();g.font='17px Arial';g.direction=direction;g.textAlign='start';g.strokeText('ab \u05d0\u05d1 12',70,30,40);return pixels(g);});
        for(const family of ['Microsoft YaHei','SimSun','Noto Sans SC'])await add('italicFallbackStroke_'+family,()=>{const g=fresh();g.font='italic 17px Tahoma, "'+family+'"';g.shadowColor='blue';g.shadowOffsetX=2;g.shadowBlur=1;g.strokeText('A\u4e2da',4,30);return pixels(g);});
        return results;
    }
    async function runThirteenthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(112,48).getContext('2d');
        const add=async(name,fn)=>{try{const value=await fn();results[name]={value:value===undefined?'<undefined>':value};}catch(e){results[name]={error:e.name};}};
        const norm=v=>v===undefined?'<undefined>':v;
        const metrics=(g,text)=>{const m=g.measureText(text);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent,m.fontBoundingBoxAscent,m.fontBoundingBoxDescent];};
        const textResult=(g,text)=>{const m=metrics(g,text);g.fillText(text,5,32);return {metrics:m,pixels:Array.from(g.getImageData(0,0,112,48).data)};};
        for(const dimensions of [[0,0],[0,48],[112,0]])for(const font of ['17px Arial','small-caps 17px Tahoma'])await add('zeroSizeText_'+dimensions.join('x')+'_'+font,()=>{const c=new Canvas(...dimensions),g=c.getContext('2d');g.font=font;g.letterSpacing='1px';return {font:g.font,metrics:metrics(g,'Ab c')};});
        await add('zeroResizeTextMeasurement',()=>{const c=new Canvas(112,48),g=c.getContext('2d');g.font='17px Arial';const before=metrics(g,'AV');c.width=0;g.font='17px Arial';const zero=metrics(g,'AV');c.width=112;g.font='17px Arial';return {before,zero,after:metrics(g,'AV')};});
        for(const direction of ['ltr','rtl'])for(const [name,text] of [['hebrewHan','ab א中ב 12'],['arabicLatin','A سلام B'],['hebrewOnly','אבג']])await add('bidiFallback_'+direction+'_'+name,()=>{const g=fresh();g.font='17px Arial, "Microsoft YaHei"';g.direction=direction;g.textAlign='left';return textResult(g,text);});
        for(const [name,text] of [['zeroWidthSpace','a​b'],['wordJoiner','a⁠b'],['zeroWidthJoiner','a‍b'],['bidiControl','a‏b'],['combining','áb'],['arabic','سلام'],['emoji','A😀B'],['softHyphen','a­b']])for(const spacing of ['0px','2px'])await add('unicodeSpacing_'+name+'_'+spacing,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing=spacing;g.textAlign='left';return textResult(g,text);});
        for(const family of ['Tahoma','Courier New','Consolas'])for(const mode of ['auto','none'])await add('kerningHinting_'+family+'_'+mode,()=>{const g=fresh();g.font='17px "'+family+'"';g.fontKerning=mode;return textResult(g,'AVATAR fi');});
        for(const [property,value,alternate] of [['fontStretch','condensed','expanded'],['fontVariantCaps','small-caps','all-small-caps'],['textRendering','optimizeSpeed','geometricPrecision']]) {
            await add('textAdditionalState_'+property,()=>{const c=new Canvas(20,20),g=c.getContext('2d'),initial=norm(g[property]);g[property]=value;g.save();g[property]=alternate;g.restore();const restored=norm(g[property]);g[property]='invalid';const invalid=norm(g[property]);g.reset();return {initial,restored,invalid,reset:norm(g[property])};});
            await add('textAdditionalDraw_'+property,()=>{const g=fresh();g.font='20px Arial';g[property]=value;return {property:g[property],...textResult(g,'AVabc')};});
        }
        for(const property of ['letterSpacing','wordSpacing'])await add('spacingPrecision_'+property,()=>{const g=fresh();g.font='17px Arial';return ['0.00001px','0.00002px','-0.00002px','0.123456789px','-40px','1.23456789em','2lh','2rlh'].map(value=>{g[property]='3px';g[property]=value;return [value,g[property],metrics(g,'A B')];});});
        const source=()=>{const c=new Canvas(13,11),g=c.getContext('2d'),im=g.createImageData(13,11);for(let y=0;y<11;y++)for(let x=0;x<13;x++){const i=(y*13+x)*4;im.data[i]=(x*59+y*37)%256;im.data[i+1]=(x*17+y*97)%256;im.data[i+2]=(x*137+y*11)%256;im.data[i+3]=(x+y)%3?255:87;}g.putImageData(im,0,0);return c;};
        for(const kind of ['downscale','upscale','pattern'])for(const quality of ['low','medium','high'])await add('samplingDetail_'+kind+'_'+quality,()=>{const c=new Canvas(32,24),g=c.getContext('2d');g.imageSmoothingQuality=quality;const image=source();if(kind==='pattern'){const p=g.createPattern(image,'repeat');p.setTransform({a:.43,b:.13,c:-.07,d:.57,e:.3,f:.7});g.fillStyle=p;g.fillRect(0,0,32,24);}else if(kind==='downscale')g.drawImage(image,0,0,13,11,.3,.7,5.4,4.2);else g.drawImage(image,.3,.7,28.3,22.1);return Array.from(g.getImageData(0,0,32,24).data);});
        await add('samplingSourcePixels',()=>Array.from(source().getContext('2d').getImageData(0,0,13,11).data));
        for(const kind of ['downscale','upscale'])await add('samplingOpaque_'+kind,()=>{const image=source(),h=image.getContext('2d'),im=h.getImageData(0,0,13,11);for(let i=3;i<im.data.length;i+=4)im.data[i]=255;h.putImageData(im,0,0);const c=new Canvas(32,24),g=c.getContext('2d');if(kind==='downscale')g.drawImage(image,0,0,13,11,.3,.7,5.4,4.2);else g.drawImage(image,.3,.7,28.3,22.1);return Array.from(g.getImageData(0,0,32,24).data);});
        await add('samplingNearest',()=>{const c=new Canvas(32,24),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(source(),.3,.7,28.3,22.1);return Array.from(g.getImageData(0,0,32,24).data);});
        await add('samplingIntegerCopy',()=>{const c=new Canvas(32,24),g=c.getContext('2d');g.drawImage(source(),0,0);return Array.from(g.getImageData(0,0,32,24).data);});
        for(const family of ['Arial','Tahoma'])for(const variant of ['normal','small-caps','all-small-caps','petite-caps','all-petite-caps','unicase','titling-caps'])await add('variantCapsModes_'+family+'_'+variant,()=>{const g=fresh();g.font='17px "'+family+'"';g.fontVariantCaps=variant;return {variant:g.fontVariantCaps,...textResult(g,'Abc')};});
        for(const rendering of ['auto','optimizeSpeed','optimizeLegibility','geometricPrecision'])await add('renderingModes_'+rendering,()=>{const g=fresh();g.font='17px Calibri';g.textRendering=rendering;return {rendering:g.textRendering,...textResult(g,'office AV')};});
        for(const stretch of ['ultra-condensed','normal','ultra-expanded'])await add('fontStretchModes_'+stretch,()=>{const g=fresh();g.font='17px Arial';g.fontStretch=stretch;return {stretch:g.fontStretch,...textResult(g,'Abc')};});
        await add('fontOptionsAssignment',()=>{const g=fresh(),state=()=>[g.font,g.fontStretch,g.fontVariantCaps,g.textRendering];g.font='17px Arial';g.fontStretch='condensed';g.fontVariantCaps='small-caps';g.textRendering='geometricPrecision';const before=state();g.font='17px Tahoma';const normal=state();g.font='small-caps 17px Arial';return {before,normal,caps:state()};});
        for(const [property,value] of [['fontStretch','condensed'],['fontVariantCaps','small-caps'],['textRendering','optimizeSpeed']])await add('fontOptionsReentry_'+property,()=>{const c=new Canvas(112,48),g=c.getContext('2d');let calls=0;g[property]={toString(){calls++;c.width=0;return value;}};let error;try{g[property]=Symbol();}catch(e){error=e.name;}return {value:g[property],calls,error};});
        for(const dimensions of [[0,0],[0,48]])await add('zeroTextOptions_'+dimensions.join('x'),()=>{const c=new Canvas(...dimensions),g=c.getContext('2d');g.font='17px Arial';g.fontStretch='condensed';g.fontVariantCaps='small-caps';g.letterSpacing='1px';g.wordSpacing='2px';g.direction='rtl';g.textBaseline='top';return metrics(g,'Ab c');});
        for(const transform of ['scaleDown','scaleUp','rotate','anisotropic','rotateUp','quarterTurn','skewUp','reflectUp'])await add('samplingHighTransform_'+transform,()=>{const c=new Canvas(32,24),g=c.getContext('2d');g.imageSmoothingQuality='high';if(transform==='scaleDown')g.scale(.43,.57);if(transform==='scaleUp')g.scale(1.7,1.6);if(transform==='rotate'){g.translate(7,2);g.rotate(.2);}if(transform==='anisotropic')g.scale(.7,1.6);if(transform==='rotateUp'){g.translate(7,2);g.rotate(.2);g.scale(1.7,1.6);}if(transform==='quarterTurn'){g.translate(22,0);g.rotate(Math.PI/2);g.scale(1.7,1.6);}if(transform==='skewUp')g.transform(1.7,.2,.3,1.6,0,0);if(transform==='reflectUp'){g.translate(26,0);g.scale(-1.7,1.6);}g.drawImage(source(),.3,.7);return Array.from(g.getImageData(0,0,32,24).data);});
        return results;
    }
    function runFourteenthRoundCases(Canvas) {
        const results = {};
        const fresh = () => new Canvas(96,48).getContext('2d');
        const add = (name, fn) => {try {results[name]={value:fn()};} catch(e) {results[name]={error:e.name};}};
        const metrics = (g,t) => {const m=g.measureText(t);return ['width','actualBoundingBoxLeft','actualBoundingBoxRight','actualBoundingBoxAscent','actualBoundingBoxDescent','fontBoundingBoxAscent','fontBoundingBoxDescent'].map(k=>m[k]);};
        const pixels = g => Array.from(g.getImageData(0,0,g.canvas.width,g.canvas.height).data);
        const text = (g,t) => {const m=metrics(g,t);g.fillText(t,6,31);return {metrics:m,pixels:pixels(g)};};
        const caps=['normal','small-caps','all-small-caps','petite-caps','all-petite-caps','unicase','titling-caps'];
        for(const variant of caps)for(const font of ['italic bold 17px Arial','small-caps 17px Tahoma'])add('capsSerialization_'+font+'_'+variant,()=>{const g=fresh();g.font=font;g.fontVariantCaps=variant;return [g.font,g.fontVariantCaps];});
        for(const family of ['Arial','Tahoma','Calibri'])for(const variant of ['all-small-caps','unicase','titling-caps'])for(const t of ['A1 b!?','A\u0301b\u00df'])add('capsClusters_'+family+'_'+variant+'_'+t,()=>{const g=fresh();g.font='17px '+family;g.fontVariantCaps=variant;return text(g,t);});
        for(const family of ['Arial','Tahoma'])for(const variant of ['small-caps','all-small-caps','unicase'])add('capsFallback_'+family+'_'+variant,()=>{const g=fresh();g.font='17px '+family+', "Microsoft YaHei"';g.fontVariantCaps=variant;return text(g,'A\u4e2da');});
        for(const spacing of ['-20px','-40px'])for(const family of ['Arial','Tahoma'])for(const variant of ['normal','small-caps'])add('negativeSpacing_'+family+'_'+variant+'_'+spacing,()=>{const g=fresh();g.font='17px '+family;g.fontVariantCaps=variant;g.letterSpacing=spacing;return text(g,'Abc');});
        for(const v of ['1e-7px','1e-20px','1e7px','12345678px','-12345678px','0.99999999px','1e39px','1e-46px','2cap','2ic','2lh','2rlh'])add('spacingBoundary_'+v,()=>{const g=fresh();g.letterSpacing='3px';g.letterSpacing=v;return g.letterSpacing;});
        for(const value of ['normal','none','auto'])for(const rendering of ['auto','optimizeSpeed'])add('renderingKerning_'+value+'_'+rendering,()=>{const g=fresh();g.font='17px Calibri';g.fontKerning=value;g.textRendering=rendering;return text(g,'office AV');});
        for(const name of ['leading','interior','variantChange','renderingChange'])add('fontCache_'+name,()=>{const g=fresh();g.font='17px Tahoma';g.wordSpacing='2px';g.fontVariantCaps='small-caps';if(name==='leading')g.measureText(' A');else g.measureText('A B');if(name==='variantChange')g.fontVariantCaps='all-small-caps';if(name==='renderingChange')g.textRendering='optimizeSpeed';return text(g,' A B ');});
        const source=()=>{const c=new Canvas(7,5),g=c.getContext('2d'),im=g.createImageData(7,5);for(let i=0;i<im.data.length;i+=4){im.data[i]=(i*31)%256;im.data[i+1]=(i*67)%256;im.data[i+2]=(i*43)%256;im.data[i+3]=[0,1,7,87,128,254,255][(i/4)%7];}g.putImageData(im,0,0);return c;};
        for(const quality of ['low','medium','high'])for(const mode of ['identity','oneAxis','clipSource','negative','rotate','copy','shadow','opaque'])add('imageBoundary_'+quality+'_'+mode,()=>{const c=new Canvas(24,20),g=c.getContext('2d',{alpha:mode!=='opaque'});g.imageSmoothingQuality=quality;const im=source();if(mode==='rotate'){g.translate(5,1);g.rotate(.3);}if(mode==='copy'){g.fillStyle='red';g.fillRect(0,0,24,20);g.globalCompositeOperation='copy';}if(mode==='shadow'){g.shadowColor='rgba(30,70,250,.7)';g.shadowOffsetX=2;g.shadowBlur=2;}if(mode==='identity')g.drawImage(im,.3,.7);else if(mode==='oneAxis')g.drawImage(im,.3,.7,14,5);else if(mode==='clipSource')g.drawImage(im,-2,-1,8,6,.3,.7,18,14);else if(mode==='negative')g.drawImage(im,0,0,7,5,19,16,-18,-14);else g.drawImage(im,.3,.7,18,14);return pixels(g);});
        for(const t of ['A\u200bB','A\u200dB','\u05d0A\u4e2d\u05d1','\u0633\u0644\u0627\u0645'])for(const direction of ['ltr','rtl'])add('unicodeStroke_'+direction+'_'+t,()=>{const g=fresh();g.font='17px Arial';g.direction=direction;g.textAlign='left';g.letterSpacing='2px';g.strokeText(t,6,31,40);return {metrics:metrics(g,t),pixels:pixels(g)};});
        for(const v of ['1e-6px','1e-5px','1e6px','999999.9px','-1e-7px','2cap','2ic'])add('spacingUnitsMeasure_'+v,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing=v;return {spacing:g.letterSpacing,metrics:metrics(g,'AB')};});
        for(const family of ['Arial','Tahoma','Calibri'])for(const variant of ['small-caps','all-small-caps','unicase'])for(const t of ['\u05d0\u05d1','\u0633\u0644\u0627\u0645'])add('capsScript_'+family+'_'+variant+'_'+t,()=>{const g=fresh();g.font='17px '+family;g.fontVariantCaps=variant;g.textAlign='left';return text(g,t);});
        for(const mode of ['alpha','clip','scale','rotate','noBlur','opaqueSource','emptySource','copy'])for(const quality of ['low','high'])add('shadowBoundary_'+mode+'_'+quality,()=>{const c=new Canvas(32,24),g=c.getContext('2d');g.imageSmoothingQuality=quality;g.shadowColor='rgba(30,70,250,.7)';g.shadowOffsetX=2;g.shadowOffsetY=1;g.shadowBlur=2;let im=source();if(mode==='alpha')g.globalAlpha=.37;if(mode==='clip'){g.beginPath();g.rect(4,3,15,12);g.clip();}if(mode==='scale')g.scale(1.2,.7);if(mode==='rotate'){g.translate(6,0);g.rotate(.2);}if(mode==='noBlur')g.shadowBlur=0;if(mode==='opaqueSource'){const h=im.getContext('2d');h.fillStyle='red';h.fillRect(0,0,7,5);}if(mode==='emptySource')im=new Canvas(7,5);if(mode==='copy')g.globalCompositeOperation='copy';g.drawImage(im,.3,.7,18,14);return pixels(g);});
        for(const family of ['Arial','Tahoma','Calibri'])for(const unit of ['cap','ic','ex','ch'])add('relativeFontUnit_'+family+'_'+unit,()=>{const g=fresh();g.font='17px '+family;g.letterSpacing='1'+unit;g.wordSpacing='.5'+unit;return text(g,'A B');});
        for(const v of ['-1e6px','32768px','-32768px','32760px','1e39px','-1e39px','1e-46px'])add('spacingSaturation_'+v,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing=v;g.wordSpacing=v;return {spacing:g.letterSpacing,metrics:metrics(g,'A B')};});
        for(const family of ['Arial','Calibri'])for(const variant of ['small-caps','all-small-caps','unicase'])add('capsMixedScript_'+family+'_'+variant,()=>{const g=fresh();g.font='17px '+family;g.fontVariantCaps=variant;g.textAlign='left';return text(g,'A\u05d0a\u4e2d');});
        for(const alpha of [true,false])for(const bitmap of [true,false])for(const quality of ['low','high'])add('imageSourceAlpha_'+alpha+'_'+bitmap+'_'+quality,()=>{let c=new Canvas(7,5),h=c.getContext('2d',{alpha});h.fillStyle='red';h.fillRect(0,0,7,5);if(bitmap)c=c.transferToImageBitmap();const g=fresh();g.shadowColor='rgba(30,70,250,.7)';g.shadowBlur=2;g.shadowOffsetX=2;g.shadowOffsetY=1;g.imageSmoothingQuality=quality;g.drawImage(c,.3,.7,18,14);const p=pixels(g);if(bitmap)c.close();return p;});
        for(const crop of [[1,1,3,2],[-2,-1,8,6],[5,3,7,5]])for(const smoothing of [true,false])add('imageClipping_'+crop.join('_')+'_'+smoothing,()=>{const g=fresh();g.imageSmoothingEnabled=smoothing;g.translate(3,1);g.rotate(.1);g.drawImage(source(),...crop,.3,.7,18,14);return pixels(g);});
        return results;
    }
    function runFifteenthRoundCases(Canvas) {
        const results={},fresh=()=>new Canvas(80,40).getContext('2d');
        const add=(name,fn)=>{try{results[name]={value:fn()};}catch(e){results[name]={error:e.name};}};
        const pixels=g=>Array.from(g.getImageData(0,0,g.canvas.width,g.canvas.height).data);
        const metrics=(g,t)=>{const m=g.measureText(t);return ['width','actualBoundingBoxLeft','actualBoundingBoxRight','actualBoundingBoxAscent','actualBoundingBoxDescent','fontBoundingBoxAscent','fontBoundingBoxDescent','hangingBaseline','alphabeticBaseline','ideographicBaseline'].map(k=>m[k]);};
        for(const baseline of ['alphabetic','top','middle','bottom','hanging','ideographic'])for(const t of ['',' ','\u200b'])add('emptyMetrics_'+baseline+'_'+JSON.stringify(t),()=>{const g=fresh();g.font='17px Arial';g.textAlign='center';g.textBaseline=baseline;return metrics(g,t);});
        for(const v of ['2PX','+2px','2 px','2px ',' 2px','2/*x*/px','calc(1px + 2px)','1e309px','-1e309px','2rex','2rch','2rcap','2ric'])add('spacingParsing_'+v,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing='3px';g.letterSpacing=v;return [g.letterSpacing,metrics(g,'Ab')];});
        for(const t of ['a\u200cb','a\u2060b','a\u00a0b','a\u202fb','a\u000bb','a\u000cb'])for(const spacing of ['0px','2px'])add('unicodeBoundary_'+JSON.stringify(t)+'_'+spacing,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing=spacing;g.wordSpacing='1px';g.fillText(t,4,27);return {metrics:metrics(g,t),pixels:pixels(g)};});
        const source=()=>{const c=new Canvas(4,4),g=c.getContext('2d');g.fillStyle='rgba(255,0,0,.5)';g.fillRect(0,0,2,4);g.fillStyle='rgba(0,255,0,.2)';g.fillRect(2,1,2,2);return c;};
        for(const kind of ['pattern','gradient'])for(const method of ['fillRect','fill','stroke'])for(const blur of [0,2])add('styleShadow_'+kind+'_'+method+'_'+blur,()=>{const g=fresh();let style;if(kind==='pattern'){style=g.createPattern(source(),'repeat');style.setTransform({a:2,d:2});}else{style=g.createLinearGradient(0,0,25,0);style.addColorStop(0,'rgba(255,0,0,.2)');style.addColorStop(1,'rgba(0,255,0,.8)');}g.fillStyle=style;g.strokeStyle=style;g.shadowColor='rgba(0,0,255,.7)';g.shadowBlur=blur;g.shadowOffsetX=3;g.shadowOffsetY=2;if(method==='fillRect')g.fillRect(4,4,22,17);else{g.beginPath();g.rect(4,4,22,17);g[method]();}return pixels(g);});
        for(const size of [12.5,17.25])for(const caps of ['all-small-caps','unicase'])add('fractionalCaps_'+size+'_'+caps,()=>{const g=fresh();g.font=size+'px Tahoma';g.fontVariantCaps=caps;g.fillText('Ab\u0301 1',4,27);return {metrics:metrics(g,'Ab\u0301 1'),pixels:pixels(g)};});
        for(const mode of ['scale','rotate','alpha','clip','text','strokeText','opaqueSource'])add('patternShadowBoundary_'+mode,()=>{const g=fresh();let c=source();if(mode==='opaqueSource'){c=new Canvas(4,4);const h=c.getContext('2d',{alpha:false});h.fillStyle='red';h.fillRect(0,0,4,4);}const p=g.createPattern(c,'repeat');p.setTransform({a:2,d:2});g.fillStyle=p;g.strokeStyle=p;g.shadowColor='rgba(0,0,255,.7)';g.shadowOffsetX=3;g.shadowOffsetY=2;g.shadowBlur=2;if(mode==='scale')g.scale(1.3,.8);if(mode==='rotate'){g.translate(8,0);g.rotate(.2);}if(mode==='alpha')g.globalAlpha=.37;if(mode==='clip'){g.beginPath();g.rect(8,8,18,15);g.clip();}if(mode==='text'||mode==='strokeText'){g.font='17px Arial';g[mode==='text'?'fillText':'strokeText']('Abc',4,27);}else g.fillRect(4,4,22,17);return pixels(g);});
        for(const t of ['AB','Abc','AB CD',' AB ','A\u00a0B'])for(const v of ['1e309px','-1e309px'])add('saturatedWords_'+JSON.stringify(t)+'_'+v,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing=v;g.wordSpacing=v;return metrics(g,t);});
        for(const unit of ['rex','rch','rcap','ric'])add('rootUnitFontChange_'+unit,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing='1'+unit;const before=metrics(g,'AB');g.save();g.font='24px Tahoma';const changed=metrics(g,'AB');g.restore();return {before,changed,restored:metrics(g,'AB')};});
        add('overflowOtherProperties',()=>{const g=fresh();g.fillStyle='red';g.fillStyle='rgb(1e309,0,0)';g.font='17px Arial';g.font='1e309px Tahoma';g.lineWidth=Infinity;return [g.fillStyle,g.font,g.lineWidth];});
        for(const method of ['fillText','strokeText'])for(const mode of ['none','offset','gradient'])add('textPaintIsolation_'+method+'_'+mode,()=>{const g=fresh();let style;if(mode==='gradient'){style=g.createLinearGradient(0,0,25,0);style.addColorStop(0,'rgba(255,0,0,.2)');style.addColorStop(1,'rgba(0,255,0,.8)');}else{style=g.createPattern(source(),'repeat');style.setTransform({a:2,d:2});}g.fillStyle=style;g.strokeStyle=style;if(mode!=='none'){g.shadowColor='rgba(0,0,255,.7)';g.shadowOffsetX=3;g.shadowOffsetY=2;}g.font='17px Arial';g[method]('Abc',4,27);return pixels(g);});
        for(const method of ['fillText','strokeText'])for(const mode of ['opaque','white','alpha','rotate','scale','clip','noRepeat','bitmap','copy','fallback','caps','dash'])add('patternTextBoundary_'+method+'_'+mode,()=>{
            const g=fresh();let image=source();
            if(mode==='opaque'||mode==='white'){image=new Canvas(4,4);const h=image.getContext('2d',{alpha:false});h.fillStyle=mode==='white'?'white':'red';h.fillRect(0,0,4,4);}
            if(mode==='bitmap')image=image.transferToImageBitmap();
            const p=g.createPattern(image,mode==='noRepeat'?'no-repeat':'repeat');p.setTransform({a:2,d:2,e:.3,f:.7});g.fillStyle=p;g.strokeStyle=p;
            g.shadowColor='rgba(30,70,250,.7)';g.shadowOffsetX=3;g.shadowOffsetY=2;g.shadowBlur=2;g.font='17px Arial';
            if(mode==='alpha')g.globalAlpha=.37;if(mode==='rotate'){g.translate(8,0);g.rotate(.2);}if(mode==='scale')g.scale(1.3,.8);
            if(mode==='clip'){g.beginPath();g.rect(8,8,18,15);g.clip();}if(mode==='copy')g.globalCompositeOperation='copy';
            if(mode==='caps')g.fontVariantCaps='all-small-caps';if(mode==='dash')g.setLineDash([2,1]);
            g[method](mode==='fallback'?'A\u4e2da':'Abc',4,27);const data=pixels(g);if(mode==='bitmap')image.close();return data;
        });
        for(const style of ['solid','gradient','pattern'])for(const opaque of [false,true])for(const clip of [false,true])add('copyTextOverlap_'+style+'_'+opaque+'_'+clip,()=>{
            const g=new Canvas(80,40).getContext('2d',{alpha:!opaque});g.fillStyle='orange';g.fillRect(0,0,80,40);
            if(clip){g.beginPath();g.rect(8,8,22,20);g.clip();}
            let p='rgba(255,0,0,.4)';if(style==='pattern')p=g.createPattern(source(),'repeat');if(style==='gradient'){p=g.createLinearGradient(0,0,40,0);p.addColorStop(0,'rgba(255,0,0,.4)');p.addColorStop(1,'rgba(0,255,0,.6)');}
            g.strokeStyle=p;g.lineWidth=3;g.font='17px Arial';g.letterSpacing='-3px';g.globalCompositeOperation='copy';g.strokeText('Abc',4,27);return pixels(g);
        });
        for(const name of ['aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'])add('namedColor_'+name,()=>{const g=fresh();g.fillStyle=name;g.fillRect(0,0,1,1);return [g.fillStyle,...g.getImageData(0,0,1,1).data];});
        return results;
    }
    if(typeof module!=='undefined'&&module.exports){module.exports=runFourthRoundCases;module.exports.runFifthRoundCases=runFifthRoundCases;module.exports.runSixthRoundCases=runSixthRoundCases;module.exports.runSeventhRoundCases=runSeventhRoundCases;module.exports.runEighthRoundCases=runEighthRoundCases;module.exports.runNinthRoundCases=runNinthRoundCases;module.exports.runTenthRoundCases=runTenthRoundCases;module.exports.runEleventhRoundCases=runEleventhRoundCases;module.exports.runTwelfthRoundCases=runTwelfthRoundCases;module.exports.runThirteenthRoundCases=runThirteenthRoundCases;module.exports.runFourteenthRoundCases=runFourteenthRoundCases;module.exports.runFifteenthRoundCases=runFifteenthRoundCases;}
    else globalThis.__canvasResult=(async()=>({fourthRound:runFourthRoundCases(OffscreenCanvas),fifthRound:runFifthRoundCases(OffscreenCanvas),sixthRound:await runSixthRoundCases(OffscreenCanvas),seventhRound:runSeventhRoundCases(OffscreenCanvas),eighthRound:await runEighthRoundCases(OffscreenCanvas),ninthRound:await runNinthRoundCases(OffscreenCanvas),tenthRound:await runTenthRoundCases(OffscreenCanvas),eleventhRound:await runEleventhRoundCases(OffscreenCanvas),twelfthRound:await runTwelfthRoundCases(OffscreenCanvas),thirteenthRound:await runThirteenthRoundCases(OffscreenCanvas),fourteenthRound:runFourteenthRoundCases(OffscreenCanvas),fifteenthRound:runFifteenthRoundCases(OffscreenCanvas)}))();
})();

// Additional review cases: degeneracy and precision in the demo's drawing APIs.
(function () {
    function runSixteenthRoundCases(Canvas) {
        const results = {};
        const fresh = () => new Canvas(32, 32).getContext('2d');
        const pixels = g => Array.from(g.getImageData(0, 0, 32, 32).data);
        const add = (name, fn) => { try { const value = fn(); results[name] = {value: value === undefined ? '<undefined>' : value}; } catch (e) { results[name] = {error: e.name}; } };
        for (const kind of ['linearSame', 'radialSame', 'radialZero', 'radialCone', 'linearNormal', 'conic']) {
            for (const stops of [0, 1, 2]) add('degenerateGradient_' + kind + '_' + stops, () => {
                const g = fresh();
                const gradient = kind === 'linearSame' ? g.createLinearGradient(8, 8, 8, 8)
                    : kind === 'radialSame' ? g.createRadialGradient(8, 8, 5, 8, 8, 5)
                    : kind === 'radialZero' ? g.createRadialGradient(5, 8, 0, 20, 8, 0)
                    : kind === 'radialCone' ? g.createRadialGradient(5, 8, 2, 20, 8, 5)
                    : kind === 'conic' ? g.createConicGradient(0.7, 12, 12)
                    : g.createLinearGradient(0, 0, 24, 0);
                if (stops > 0) gradient.addColorStop(0, 'red');
                if (stops > 1) gradient.addColorStop(1, 'blue');
                g.fillStyle = gradient; g.shadowColor = 'lime'; g.shadowBlur = 3;
                g.shadowOffsetX = 3; g.fillRect(4, 4, 20, 20);
                return pixels(g);
            });
        }
        for (const kind of ['arc', 'ellipseX', 'ellipseY', 'ellipseBoth']) {
            for (const connected of [false, true]) add('zeroRadius_' + kind + '_' + connected, () => {
                const g = fresh(); g.lineWidth = 2; g.beginPath();
                if (connected) g.moveTo(2, 2);
                if (kind === 'arc') g.arc(16, 16, 0, 0, Math.PI);
                else g.ellipse(16, 16, kind === 'ellipseY' ? 8 : 0, kind === 'ellipseX' ? 8 : 0, 0.4, 0, Math.PI * 1.5);
                g.lineTo(25, 25); g.stroke(); return pixels(g);
            });
        }
        for (const method of ['arc', 'ellipse']) for (const angle of [0, 1e8, 1e20]) add('anglePrecision_' + method + '_' + angle, () => {
            const g = fresh(); g.lineWidth = 2;
            if (method === 'arc') g.arc(16, 16, 8, angle, angle + Math.PI);
            else g.ellipse(16, 16, 9, 5, 0.4, angle, angle + Math.PI);
            g.stroke(); return pixels(g);
        });
        for (const method of ['arc', 'ellipse']) add('zeroSweepCurrentPoint_' + method, () => {
            const g = fresh();
            if (method === 'arc') g.arc(16, 16, 8, 0, 0);
            else g.ellipse(16, 16, 8, 5, 0, 0, 0);
            g.lineTo(3, 3); g.stroke(); return pixels(g);
        });
        for (const method of ['fillText', 'strokeText']) for (const maxWidth of [0, -1, Infinity, NaN, 4]) add('textMaxWidth_' + method + '_' + maxWidth, () => {
            const g = fresh(); g.font = '17px Arial'; g[method]('AB', 2, 23, maxWidth); return pixels(g);
        });
        for (const method of ['fillRect', 'strokeRect']) for (const size of [[0, 10], [10, 0], [0, 0]]) add('zeroRectCopy_' + method + '_' + size, () => {
            const g = fresh(); g.fillStyle = 'red'; g.fillRect(0, 0, 32, 32);
            g.globalCompositeOperation = 'copy'; g[method](5, 5, ...size); return pixels(g);
        });
        for (const radius of [0.25, 0.75, 1]) for (const close of [false, true]) for (const method of ['fill','stroke']) add('smallArc_'+radius+'_'+close+'_'+method, () => {
            const g=fresh();g.lineWidth=2;g.arc(15.3,16.7,radius,.4,5.2);if(close)g.closePath();g[method]();return pixels(g);
        });
        for (const kind of ['x','y','both','sweep']) for (const ccw of [false,true]) for (const transform of [false,true]) add('degenerateEllipseBoundary_'+kind+'_'+ccw+'_'+transform, () => {
            const g=fresh();if(transform){g.translate(3,2);g.scale(.8,1.2);}g.lineWidth=2;g.moveTo(2,3);
            g.ellipse(16,12,kind==='x'||kind==='both'?0:8,kind==='y'||kind==='both'?0:5,.73,.3,kind==='sweep'?.3:5.7,ccw);
            g.lineTo(25,25);g.stroke();return pixels(g);
        });
        for (const method of ['fillRect','strokeRect','clearRect']) for (const size of [[-10,10],[10,-10],[-10,-10],[0,-10],[-10,0]]) add('negativeRect_'+method+'_'+size, () => {
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.fillStyle='red';g.strokeStyle='blue';g.lineWidth=3;g[method](18,18,...size);return pixels(g);
        });
        for (const cap of ['butt','round','square']) for (const dash of [false,true]) for (const vertical of [false,true]) add('flatStrokeRect_'+cap+'_'+dash+'_'+vertical, () => {
            const g=fresh();g.lineWidth=3;g.lineCap=cap;g.lineJoin='bevel';if(dash)g.setLineDash([3,2]);g.strokeRect(7,8,vertical?0:17,vertical?17:0);return pixels(g);
        });
        for (const kind of ['linear','radial','conic']) for (const stops of [[[.3,'red']],[[1,'red']],[[.3,'red'],[.7,'blue']],[[.5,'red'],[.5,'blue']]]) add('gradientStopEdges_'+kind+'_'+JSON.stringify(stops), () => {
            const g=fresh();const gr=kind==='linear'?g.createLinearGradient(2,2,25,20):kind==='radial'?g.createRadialGradient(8,8,1,16,14,14):g.createConicGradient(.7,16,16);
            for(const stop of stops)gr.addColorStop(...stop);g.fillStyle=gr;g.shadowColor='lime';g.shadowBlur=3;g.shadowOffsetX=2;g.fillRect(3,3,24,24);return pixels(g);
        });
        for (const shape of ['move','sameLine','line','implicitLine','quad','cubic','ellipse','arc']) for (const method of ['fill','stroke']) add('degeneratePathCopy_'+shape+'_'+method, () => {
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.fillStyle='red';g.lineWidth=3;g.lineCap='round';g.globalCompositeOperation='copy';
            if(shape==='implicitLine'){g.lineTo(5,5);g.lineTo(23,20);}
            else {g.moveTo(5,5);if(shape==='sameLine')g.lineTo(5,5);if(shape==='line')g.lineTo(23,20);if(shape==='quad')g.quadraticCurveTo(5,5,5,5);if(shape==='cubic')g.bezierCurveTo(5,5,5,5,5,5);if(shape==='ellipse')g.ellipse(5,5,0,0,0,0,1);if(shape==='arc')g.arc(5,5,0,0,1);}
            g[method]();return pixels(g);
        });
        for (const radius of [.75,8]) for (const ccw of [false,true]) for (const end of [Math.PI*2,4.7]) for (const method of ['fill','stroke']) add('closedArcBoundary_'+radius+'_'+ccw+'_'+end+'_'+method, () => {
            const g=fresh();g.translate(.3,.7);g.lineWidth=2;g.arc(16,16,radius,.2,end,ccw);g.closePath();g[method]();return pixels(g);
        });
        for (const action of ['saveRestore','transform','clip','hit','move','close','curve']) for (const method of ['fill','stroke']) add('lineStateBoundary_'+action+'_'+method, () => {
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.fillStyle='red';g.lineWidth=2;g.moveTo(4,5);g.lineTo(23,20);
            if(action==='saveRestore'){g.save();g.translate(2,2);g.restore();}if(action==='transform')g.scale(.7,1.3);if(action==='clip')g.clip();
            if(action==='hit'){g.isPointInPath(9,9);g.isPointInStroke(9,9);}if(action==='move')g.moveTo(4,5);if(action==='close')g.closePath();if(action==='curve')g.quadraticCurveTo(23,20,23,20);
            g.globalCompositeOperation='copy';g[method]();return pixels(g);
        });
        for (const method of ['fillRect','strokeRect']) for (const size of [[0,0],[0,10],[-10,0]]) for (const opaque of [false,true]) add('rectClipShadow_'+method+'_'+size+'_'+opaque, () => {
            const g=new Canvas(32,32).getContext('2d',{alpha:!opaque});g.fillStyle='orange';g.fillRect(0,0,32,32);g.beginPath();g.rect(8,8,16,16);g.clip();
            g.globalCompositeOperation='copy';g.fillStyle='rgba(255,0,0,.3)';g.strokeStyle=g.fillStyle;g.shadowColor='blue';g.shadowBlur=3;g.shadowOffsetX=2;g[method](16,12,...size);return pixels(g);
        });
        for (const method of ['fillRect','strokeRect']) for (const size of [1e-46,-1e-46,1e-30]) add('tinyRectCopy_'+method+'_'+size, () => {
            const g=fresh();g.fillStyle='red';g.fillRect(0,0,32,32);g.globalCompositeOperation='copy';g[method](16,16,size,size);return pixels(g);
        });
        for (const kind of ['linear','radial']) for (const method of ['fill','stroke','fillText']) for (const copy of [false,true]) add('degenerateGradientDraw_'+kind+'_'+method+'_'+copy, () => {
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);const gr=kind==='linear'?g.createLinearGradient(8,8,8,8):g.createRadialGradient(8,8,5,8,8,5);gr.addColorStop(.4,'rgba(255,0,0,.5)');
            g.fillStyle=gr;g.strokeStyle=gr;g.shadowColor='blue';g.shadowBlur=3;g.shadowOffsetX=2;if(copy)g.globalCompositeOperation='copy';
            if(method==='fillText'){g.font='17px Arial';g.fillText('AB',2,24);}else{g.rect(4,4,20,20);g[method]();}return pixels(g);
        });
        for (const action of ['translateIdentity','rotateIdentity','scaleIdentity','transformIdentity','setIdentity','resetIdentity','saveRestoreOnly','translateUndo','scaleUndo','transformUndo','rotate','setMatrix']) for (const method of ['fill','stroke']) add('lineTransformLifecycle_'+action+'_'+method, () => {
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.fillStyle='red';g.moveTo(4,5);g.lineTo(23,20);
            if(action==='translateIdentity')g.translate(0,0);if(action==='rotateIdentity')g.rotate(0);if(action==='scaleIdentity')g.scale(1,1);if(action==='transformIdentity')g.transform(1,0,0,1,0,0);
            if(action==='setIdentity')g.setTransform(1,0,0,1,0,0);if(action==='resetIdentity')g.resetTransform();if(action==='saveRestoreOnly'){g.save();g.restore();}
            if(action==='translateUndo'){g.translate(2,2);g.translate(-2,-2);}if(action==='scaleUndo'){g.scale(2,2);g.scale(.5,.5);}if(action==='transformUndo'){g.transform(1,0,0,1,2,2);g.resetTransform();}
            if(action==='rotate')g.rotate(.3);if(action==='setMatrix')g.setTransform(1,0,0,1,2,2);
            g.globalCompositeOperation='copy';g[method]();return pixels(g);
        });
        for (const method of ['fillRect','strokeRect']) for (const size of [[1e-46,10],[10,1e-46],[-1e-46,-10],[-10,-1e-46]]) add('tinyFlatRectCopy_'+method+'_'+size, () => {
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.lineWidth=2;g.globalCompositeOperation='copy';g[method](16,16,...size);return pixels(g);
        });
        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports.runSixteenthRoundCases = runSixteenthRoundCases;
    else globalThis.__canvasResult = Promise.resolve(globalThis.__canvasResult).then(value => ({...value, sixteenthRound: runSixteenthRoundCases(OffscreenCanvas)}));
})();

(function () {
    function runSeventeenthRoundCases(Canvas) {
        const results={};
        const fresh=()=>new Canvas(32,32).getContext('2d');
        const pixels=g=>Array.from(g.getImageData(0,0,32,32).data);
        const add=(name,fn)=>{try{results[name]={value:fn()};}catch(e){results[name]={error:e.name};}};
        for(const kind of ['quad','cubic','arcTo'])for(const close of [false,true])for(const method of ['fill','stroke'])add('implicitCurveStart_'+kind+'_'+close+'_'+method,()=>{
            const g=fresh();g.lineWidth=2;if(close)g.closePath();
            if(kind==='quad')g.quadraticCurveTo(8,5,25,24);if(kind==='cubic')g.bezierCurveTo(8,5,24,5,25,24);if(kind==='arcTo')g.arcTo(8,5,25,24,6);
            g.lineTo(4,26);g[method]();return pixels(g);
        });
        for(const shape of ['move','sameLine','implicitLine','quad','arc','ellipse'])for(const append of [false,true])for(const method of ['fill','stroke'])add('closePoint_'+shape+'_'+append+'_'+method,()=>{
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.fillStyle='red';g.lineWidth=3;g.lineCap='round';
            if(shape==='implicitLine')g.lineTo(12,12);else{g.moveTo(12,12);if(shape==='sameLine')g.lineTo(12,12);if(shape==='quad')g.quadraticCurveTo(12,12,12,12);if(shape==='arc')g.arc(12,12,0,0,1);if(shape==='ellipse')g.ellipse(12,12,0,0,0,0,1);}
            g.closePath();if(append)g.lineTo(25,25);g.globalCompositeOperation='copy';g[method]();return pixels(g);
        });
        for(const kind of ['rect','roundRect'])for(const size of [[-12,12],[12,-12],[-12,-12],[12,12]])for(const rule of ['nonzero','evenodd'])add('rectWinding_'+kind+'_'+size+'_'+rule,()=>{
            const g=fresh();g.rect(2,2,28,28);const x=size[0]<0?22:10,y=size[1]<0?22:10;
            if(kind==='rect')g.rect(x,y,...size);else g.roundRect(x,y,...size,3);
            g.fill(rule);return pixels(g);
        });
        for(const kind of ['rect','roundRect'])for(const size of [[-12,12],[12,-12],[-12,-12],[12,12]])add('rectCurrentPoint_'+kind+'_'+size,()=>{
            const g=fresh();g.lineWidth=2;const x=size[0]<0?22:10,y=size[1]<0?22:10;
            if(kind==='rect')g.rect(x,y,...size);else g.roundRect(x,y,...size,[1,2,3,4]);
            g.lineTo(3,3);g.stroke();return pixels(g);
        });
        for(const kind of ['quad','cubic','arcTo'])for(const scale of [false,true])add('implicitCurveTransform_'+kind+'_'+scale,()=>{
            const g=fresh();if(scale){g.translate(3,2);g.scale(.75,1.2);}
            if(kind==='quad')g.quadraticCurveTo(8,5,25,24);if(kind==='cubic')g.bezierCurveTo(8,5,24,5,25,24);if(kind==='arcTo')g.arcTo(8,5,25,24,0);
            g.stroke();return pixels(g);
        });
        for(const method of ['rect','roundRect'])for(const size of [[0,0],[0,12],[12,0],[0,-12],[-12,0]])for(const draw of ['fill','stroke'])add('flatPathRect_'+method+'_'+size+'_'+draw,()=>{
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.fillStyle='red';g.lineWidth=2;
            if(method==='rect')g.rect(18,18,...size);else g.roundRect(18,18,...size,3);
            g.lineTo(3,3);g.globalCompositeOperation='copy';g[draw]();return pixels(g);
        });
        for(const action of ['hitPath','hitStroke','clip','fill','stroke','read','saveRestore'])for(const draw of ['fill','stroke'])add('closePointAfterRead_'+action+'_'+draw,()=>{
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.moveTo(12,12);g.lineTo(12,12);
            if(action==='hitPath')g.isPointInPath(12,12);if(action==='hitStroke')g.isPointInStroke(12,12);if(action==='clip')g.clip();if(action==='fill')g.fill();if(action==='stroke')g.stroke();if(action==='read')g.getImageData(0,0,1,1);if(action==='saveRestore'){g.save();g.restore();}
            g.closePath();g.lineTo(25,25);g.globalCompositeOperation='copy';g[draw]();return pixels(g);
        });
        for(const shape of ['line','arc'])for(const method of ['fillText','strokeText'])for(const maxWidth of [4,100])add('textKeepsPath_'+shape+'_'+method+'_'+maxWidth,()=>{
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);if(shape==='line'){g.moveTo(4,5);g.lineTo(23,20);}else g.arc(16,16,8,.2,4.7);
            g.font='17px Arial';g.fillStyle='red';g[method]('AB',2,25,maxWidth);g.globalCompositeOperation='copy';g.fill();return pixels(g);
        });
        for(const method of ['quad','cubic','arcTo'])for(const transform of [false,true])add('curveAfterRoundRect_'+method+'_'+transform,()=>{
            const g=fresh();g.roundRect(8,8,12,12,[1,2,3,4]);if(transform){g.translate(2,1);g.scale(.8,1.1);}
            if(method==='quad')g.quadraticCurveTo(3,2,25,25);if(method==='cubic')g.bezierCurveTo(3,2,25,3,25,25);if(method==='arcTo')g.arcTo(3,2,25,25,4);g.stroke();return pixels(g);
        });
        for(const size of [[12,12],[-12,12],[12,-12],[-12,-12]])for(const radius of [0,3,30])add('roundRectDash_'+size+'_'+radius,()=>{
            const g=fresh();g.lineWidth=2;g.setLineDash([3,2]);g.roundRect(size[0]<0?22:10,size[1]<0?22:10,...size,radius);g.stroke();return pixels(g);
        });
        for(const method of ['isPointInPath','isPointInStroke'])for(const coordinate of [NaN,Infinity,12])add('closePointHitBoundary_'+method+'_'+coordinate,()=>{
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.moveTo(12,12);g.lineTo(12,12);g[method](coordinate,12);g.closePath();g.lineTo(25,25);g.globalCompositeOperation='copy';g.stroke();return pixels(g);
        });
        for(const method of ['fillText','strokeText'])for(const opaque of [false,true])for(const style of ['solid','gradient','pattern'])add('compressedTextPaint_'+method+'_'+opaque+'_'+style,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha:!opaque});g.arc(16,16,8,.2,4.7);g.font='17px Arial';
            let paint='rgba(255,0,0,.5)';if(style==='gradient'){paint=g.createLinearGradient(2,2,22,22);paint.addColorStop(0,'red');paint.addColorStop(1,'blue');}
            if(style==='pattern'){const s=new Canvas(4,4),h=s.getContext('2d');h.fillStyle='red';h.fillRect(0,0,2,4);paint=g.createPattern(s,'repeat');}
            g.fillStyle=paint;g.strokeStyle=paint;g.shadowColor='lime';g.shadowBlur=2;g.shadowOffsetX=3;g[method]('AB',2,25,7);g.shadowBlur=0;g.shadowColor='transparent';g.stroke();return pixels(g);
        });
        for(const method of ['fillText','strokeText'])for(const tight of [false,true])add('textMaxWidthRounding_'+method+'_'+tight,()=>{
            const g=fresh();g.font='17px Arial';g.scale(.7,.8);const width=g.measureText('AB').width;g[method]('AB',2.3,25.7,tight?width-1e-8:width);return pixels(g);
        });
        for(const method of ['fillText','strokeText'])for(const align of ['left','right','center','end'])add('compressedTextAlign_'+method+'_'+align,()=>{
            const g=fresh();g.font='17px Arial';g.textAlign=align;g.scale(1.2,.8);const gr=g.createLinearGradient(0,0,30,0);gr.addColorStop(0,'red');gr.addColorStop(1,'blue');g.fillStyle=gr;g.strokeStyle=gr;g[method]('AB',20,25,7);return pixels(g);
        });
        for(const size of [[12,12],[-12,12],[12,-12],[-12,-12]])for(const radii of [[1,2,3,4],[{x:2,y:4},{x:3,y:1}]])add('asymmetricRoundRectDash_'+size+'_'+JSON.stringify(radii),()=>{
            const g=fresh();g.translate(.3,.7);g.lineWidth=2;g.setLineDash([3,2]);g.lineDashOffset=1.5;g.roundRect(size[0]<0?22:10,size[1]<0?22:10,...size,radii);g.stroke();return pixels(g);
        });
        for(const kind of ['quad','cubic'])for(const action of ['reset','resize','beginPath','transfer'])add('implicitCurveLifecycle_'+kind+'_'+action,()=>{
            const g=fresh();g.moveTo(30,30);if(action==='reset')g.reset();if(action==='resize')g.canvas.width=32;if(action==='beginPath')g.beginPath();if(action==='transfer'){g.canvas.transferToImageBitmap().close();g.beginPath();}
            if(kind==='quad')g.quadraticCurveTo(8,5,25,24);else g.bezierCurveTo(8,5,24,5,25,24);g.stroke();return pixels(g);
        });
        return results;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runSeventeenthRoundCases=runSeventeenthRoundCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,seventeenthRound:runSeventeenthRoundCases(OffscreenCanvas)}));
})();


(function () {
    function runEighteenthRoundCases(Canvas) {
        const results = {};
        const fresh = (alpha=true) => new Canvas(32,32).getContext('2d',{alpha});
        const pixels = g => Array.from(g.getImageData(0,0,32,32).data);
        const add = (name, fn) => { try { results[name]={value:fn()}; } catch(e) {results[name]={error:e.name};} };
        const attempt = fn => {try {fn();return 'ok';}catch(e){return e.name;}};
        const source = () => {const g=new Canvas(8,8).getContext('2d');g.fillStyle='rgba(240,60,20,.5)';g.fillRect(0,0,8,8);g.fillStyle='blue';g.fillRect(0,0,4,4);return g.canvas;};
        const shape = (g,kind) => {
            if(kind==='line'){g.moveTo(3,4);g.lineTo(24,22);}
            if(kind==='rect')g.rect(4,5,19,17);
            if(kind==='roundRect')g.roundRect(4,5,19,17,[2,5,1,3]);
            if(kind==='arc')g.arc(16,16,10,.3,5);
            if(kind==='ellipse')g.ellipse(16,16,11,6,.2,.3,5);
            if(kind==='quad')g.quadraticCurveTo(2,3,25,24);
            if(kind==='cubic')g.bezierCurveTo(2,3,27,3,25,24);
            if(kind==='arcTo'){g.moveTo(2,3);g.arcTo(25,3,25,24,6);}
        };
        for(const matrix of [[0,0,0,0,3,4],[1,1,1,1,0,0],[1,0,0,0,0,0],[.5,.25,-.25,1,2,3],[-1,0,0,1,32,0]])for(const kind of ['line','rect','roundRect','arc','ellipse','quad','cubic','arcTo'])for(const lifecycle of ['append','begin','draw','clip'])add('matrixPath_'+matrix+'_'+kind+'_'+lifecycle,()=>{
            const g=fresh();shape(g,'rect');g.setTransform(...matrix);
            if(lifecycle==='begin')g.beginPath();
            shape(g,kind);
            if(lifecycle==='draw')g.stroke();if(lifecycle==='clip')g.clip();
            g.resetTransform();g.lineTo(28,28);g.stroke();return pixels(g);
        });
        for(const kind of ['line','rect','roundRect','arc','ellipse','quad','cubic','arcTo'])for(const change of ['translate','scale','rotate','transform','setTransform'])add('pathRebase_'+kind+'_'+change,()=>{
            const g=fresh();shape(g,kind);g.save();if(change==='translate')g.translate(2.3,1.7);if(change==='scale')g.scale(.73,1.23);if(change==='rotate')g.rotate(.27);if(change==='transform')g.transform(1,.17,.31,.8,2.7,1.2);if(change==='setTransform')g.setTransform(.7,.13,.21,1.1,2,1);
            g.lineTo(14,24);g.restore();g.lineTo(29,4);g.stroke();return pixels(g);
        });
        for(const alpha of [true,false])for(const mode of ['copy','source-over'])for(const draw of ['fillRect','strokeRect','fill','stroke','fillText','strokeText','drawImage'])for(const style of ['solid','gradient','pattern'])add('clipPaint_'+alpha+'_'+mode+'_'+draw+'_'+style,()=>{
            const g=fresh(alpha);g.fillStyle='orange';g.fillRect(0,0,32,32);g.beginPath();g.arc(16,16,12,0,7);g.clip();g.beginPath();shape(g,'roundRect');
            let p='rgba(70,120,230,.4)';if(style==='gradient'){p=g.createRadialGradient(6,6,1,18,18,20);p.addColorStop(0,'rgba(255,0,0,.6)');p.addColorStop(1,'transparent');}
            if(style==='pattern')p=g.createPattern(source(),'no-repeat');
            g.fillStyle=p;g.strokeStyle=p;g.globalCompositeOperation=mode;g.globalAlpha=.6;g.shadowColor='rgba(20,200,60,.8)';g.shadowBlur=3;g.shadowOffsetX=3;g.lineWidth=3;g.setLineDash([2,3]);g.font='16px Arial';
            if(draw==='fillRect'||draw==='strokeRect')g[draw](3,4,22,18);else if(draw==='fillText'||draw==='strokeText')g[draw]('Ab',3,23,16);else if(draw==='drawImage')g.drawImage(source(),3,4,22,18);else g[draw]();
            return pixels(g);
        });
        for(const method of ['moveTo','lineTo','quadraticCurveTo','bezierCurveTo','rect','roundRect','arc','ellipse','arcTo','fillRect','strokeRect','clearRect','translate','scale','rotate','transform'])add('conversionOrder_'+method,()=>{
            const g=fresh(),log=[];const counts={moveTo:2,lineTo:2,quadraticCurveTo:4,bezierCurveTo:6,rect:4,roundRect:4,arc:5,ellipse:7,arcTo:5,fillRect:4,strokeRect:4,clearRect:4,translate:2,scale:2,rotate:1,transform:6};
            const args=Array.from({length:counts[method]},(_,i)=>({valueOf(){log.push(i);return i===0?Infinity:2;}}));return [attempt(()=>g[method](...args)),log];
        });
        for(const action of ['drawSelf','bitmap','patternSnapshot','patternResize','transferState','dirtyRect','putIgnoresState'])for(const alpha of [true,false])add('imageLifecycle_'+action+'_'+alpha,()=>{
            const g=fresh(alpha);g.drawImage(source(),0,0,16,16);
            if(action==='drawSelf')g.drawImage(g.canvas,0,0,16,16,8,8,20,20);
            if(action==='bitmap'){const b=g.canvas.transferToImageBitmap();g.drawImage(b,4,4,24,24);b.close();}
            if(action==='patternSnapshot'||action==='patternResize'){const s=source(),p=g.createPattern(s,'repeat');if(action==='patternResize')s.width=4;else{s.getContext('2d').fillStyle='lime';s.getContext('2d').fillRect(0,0,8,8);}g.fillStyle=p;g.fillRect(0,0,32,32);}
            if(action==='transferState'){g.translate(3,4);g.beginPath();g.rect(0,0,10,10);g.clip();g.fillStyle='red';g.canvas.transferToImageBitmap().close();g.fillRect(0,0,24,24);}
            if(action==='dirtyRect'||action==='putIgnoresState'){const d=g.getImageData(0,0,8,8);g.translate(20,20);g.globalAlpha=0;g.globalCompositeOperation='copy';g.beginPath();g.clip();if(action==='dirtyRect')g.putImageData(d,5,6,6,7,-4,-5);else g.putImageData(d,17,17);}
            return pixels(g);
        });
        for(let seed=1;seed<=64;seed++)add('sequenceA_'+seed,()=>{
            const g=fresh(seed%3!==0);let state=seed;const random=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
            for(let i=0;i<24;i++){
                const op=random(15),x=random(24),y=random(24);
                if(op===0)g.save();if(op===1)g.restore();if(op===2)g.translate((x%5)-2,(y%5)-2);if(op===3)g.scale((x%3+1)/2,(y%3+1)/2);if(op===4)g.resetTransform();if(op===5)g.beginPath();
                if(op===6)g.rect(x,y,random(18)-5,random(18)-5);if(op===7)g.moveTo(x,y);if(op===8)g.lineTo(x,y);
                if(op===9){g.fillStyle=['red','rgba(20,170,240,.5)','transparent'][random(3)];g.fill();}
                if(op===10){g.lineWidth=random(4)+1;g.lineCap=['butt','round','square'][random(3)];g.stroke();}
                if(op===11)g.clip();if(op===12)g.globalCompositeOperation=random(2)?'copy':'source-over';
                if(op===13)g.clearRect(x,y,8,8);if(op===14)g.fillRect(x,y,8,8);
            }
            return pixels(g);
        });

        for(const method of ['scale','translate','rotate','transform','setTransform'])for(const v of [.1,.123456789,-.7,1e-46,1e40])add('matrixPrecision_'+method+'_'+v,()=>{
            const g=fresh();if(method==='scale')g.scale(v,1);if(method==='translate')g.translate(v,2);if(method==='rotate')g.rotate(v);if(method==='transform'||method==='setTransform')g[method](v,.2,.3,.4,2,3);
            const m=g.getTransform();return [m.a,m.b,m.c,m.d,m.e,m.f].map(v=>Object.is(v,-0)?"-0":v);
        });
        for(const entry of ['scale','transform','setTransform'])for(const exit of ['reset','restore','setTransform'])for(const kind of ['line','quad','cubic','arcTo'])add('singularLifecycle_'+entry+'_'+exit+'_'+kind,()=>{
            const g=fresh();g.translate(3,4);g.scale(2,1);shape(g,'arc');g.save();
            if(entry==='scale')g.scale(0,1);else g[entry](0,0,0,1,2,3);
            g.translate(4,5);shape(g,kind);if(exit==='reset')g.resetTransform();if(exit==='restore')g.restore();if(exit==='setTransform')g.setTransform(.5,0,0,1,1,1);
            g.lineTo(28,26);g.stroke();return pixels(g);
        });
        for(const kind of ['arc','ellipse','roundRect','quad','cubic','line'])for(const draw of ['fill','stroke','clip','hit','append'])for(const close of [false,true])add('materializedPath_'+kind+'_'+draw+'_'+close,()=>{
            const g=fresh();shape(g,kind);if(close)g.closePath();if(draw==='append')g.lineTo(3,28);if(draw==='hit')return [g.isPointInPath(16,16),g.isPointInStroke(25,16)];
            if(draw==='clip'){g.clip();g.fillRect(0,0,32,32);}else g[draw==='append'?'stroke':draw]();return pixels(g);
        });
        for(const method of ['arc','arcTo','ellipse','roundRect'])for(const radius of [-1e-46,1e-46,-.1,0,.1])add('radiusBoundary_'+method+'_'+radius,()=>{
            const g=fresh();const error=attempt(()=>{if(method==='arc')g.arc(12,12,radius,0,2);if(method==='arcTo')g.arcTo(12,12,25,25,radius);if(method==='ellipse')g.ellipse(12,12,radius,4,0,0,2);if(method==='roundRect')g.roundRect(4,4,20,20,radius);});g.lineTo(25,25);g.stroke();return {error,pixels:pixels(g)};
        });
        for(const draw of ['fillRect','strokeRect','fillText','strokeText'])for(const alpha of [.001,.1,.3,.5,.99])for(const paint of ['rgba(70,120,230,.4)','#4678e680'])add('alphaProduct_'+draw+'_'+alpha+'_'+paint,()=>{
            const g=fresh();g.fillStyle=paint;g.strokeStyle=paint;g.globalAlpha=alpha;g.shadowColor='rgba(20,100,230,.5)';g.shadowOffsetX=2;g.shadowBlur=1;
            if(draw.endsWith('Text'))g[draw]('Ab',3,20);else g[draw](3.2,4.7,20,18);return pixels(g);
        });
        for(const name of ['lineWidth','shadowBlur','shadowOffsetX','shadowOffsetY','miterLimit','lineDashOffset','globalAlpha'])add('propertyBoundary_'+name,()=>{
            const g=fresh();return [NaN,Infinity,-Infinity,-1,-0,0,.1,1e-46,1e40].map(v=>{g[name]=1;g[name]=v;return Object.is(g[name],-0)?"-0":g[name];});
        });
        for(let seed=1001;seed<=1128;seed++)add('sequenceB_'+seed,()=>{
            const g=fresh(seed%3!==0);let state=seed;const random=n=>{state=(Math.imul(state,1103515245)+12345)>>>0;return (state>>>8)%n;};
            for(let i=0;i<20;i++){
                const op=random(17),x=random(24),y=random(24);
                if(op===0)g.save();if(op===1)g.restore();if(op===2)g.translate((x%5)-2,(y%5)-2);if(op===3)g.scale((x%3+1)/2,(y%3+1)/2);if(op===4)g.resetTransform();if(op===5)g.beginPath();
                if(op===6)g.arc(x,y,random(8)+1,0,random(7));if(op===7)g.quadraticCurveTo(x,y,random(32),random(32));if(op===8)g.lineTo(x,y);
                if(op===9){g.fillStyle=['red','rgba(20,170,240,.5)','transparent'][random(3)];g.fill();}
                if(op===10){g.lineWidth=random(4)+1;g.setLineDash(random(2)?[3,2]:[]);g.stroke();}
                if(op===11)g.clip();if(op===12)g.globalCompositeOperation=random(2)?'copy':'source-over';
                if(op===13)g.clearRect(x,y,8,8);if(op===14)g.fillRect(x,y,8,8);if(op===15)g.closePath();if(op===16)g.globalAlpha=random(10)/10;
            }
            return pixels(g);
        });

        for(const method of ['moveTo','lineTo','quadraticCurveTo','bezierCurveTo','rect','arcTo'])for(const v of [1e40,-1e40,1e-46])add('coordinateSaturation_'+method+'_'+v,()=>{
            const g=fresh();g.moveTo(5,6);if(method==='moveTo'||method==='lineTo')g[method](v,8);if(method==='quadraticCurveTo')g[method](v,8,22,24);if(method==='bezierCurveTo')g[method](v,8,12,12,22,24);if(method==='rect')g.rect(v,8,10,10);if(method==='arcTo')g.arcTo(v,8,22,24,2);g.lineTo(22,24);g.stroke();return pixels(g);
        });
        for(const op of ['scale','transform','setTransform','rotate'])for(const phase of ['reset','restore','begin','close'])add('matrixState_'+op+'_'+phase,()=>{
            const g=fresh();g.save();g.translate(3.1,2.7);shape(g,'rect');if(op==='scale')g.scale(.17,.39);if(op==='transform'||op==='setTransform')g[op](.7,.3,-.2,1.1,2.3,1.7);if(op==='rotate')g.rotate(.123456789);
            if(phase==='reset')g.resetTransform();if(phase==='restore')g.restore();if(phase==='begin')g.beginPath();if(phase==='close')g.closePath();g.lineTo(23,26);g.stroke();const m=g.getTransform();return {matrix:[m.a,m.b,m.c,m.d,m.e,m.f].map(v=>Object.is(v,-0)?'-0':v),pixels:pixels(g)};
        });
        for(const dash of [[0,0],[0,3],[3,0],[.1,.2],[1e-46,3],[3,1e-46],[3,2,1]])for(const offset of [-2,.1,1e40])add('dashBoundary_'+dash+'_'+offset,()=>{
            const g=fresh();g.setLineDash(dash);g.lineDashOffset=offset;g.lineWidth=2;shape(g,'roundRect');g.stroke();return pixels(g);
        });
        for(const method of ['fillRect','strokeRect','clearRect','drawImage','fillText','strokeText'])for(const singular of [false,true])add('reentrantDrawing_'+method+'_'+singular,()=>{
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);const value={valueOf(){g.canvas.width=32;g.fillStyle='blue';if(singular)g.scale(0,1);return 3;}};
            if(method==='drawImage')g.drawImage(source(),value,4,20,20);else if(method.endsWith('Text'))g[method]({toString(){g.font='16px Arial';return 'Ab';}},value,23);else g[method](value,4,20,20);return pixels(g);
        });
        for(const quality of ['low','medium','high'])for(const smooth of [false,true])for(const paint of ['image','pattern'])for(const transform of ['reflect','rotate','shear','scale'])add('imageMatrix_'+quality+'_'+smooth+'_'+paint+'_'+transform,()=>{
            const g=fresh();g.imageSmoothingQuality=quality;g.imageSmoothingEnabled=smooth;
            if(transform==='reflect')g.setTransform(-1,0,0,1,28,0);if(transform==='rotate'){g.translate(9,1);g.rotate(.2);}if(transform==='shear')g.transform(1,.25,.5,1,0,0);if(transform==='scale')g.scale(1.2,.7);
            if(paint==='image')g.drawImage(source(),1.3,2.7,18,20);else{const p=g.createPattern(source(),'repeat');p.setTransform({a:1.2,b:.2,c:-.1,d:.8,e:1,f:2});g.fillStyle=p;g.fillRect(1.3,2.7,18,20);}return pixels(g);
        });
        for(const property of ['fillStyle','strokeStyle','lineWidth','globalAlpha','shadowBlur','font','textAlign','letterSpacing','imageSmoothingEnabled'])add('stateStack_'+property,()=>{
            const g=fresh(),values={fillStyle:['red','blue'],strokeStyle:['lime','orange'],lineWidth:[.3,4],globalAlpha:[.3,.7],shadowBlur:[.3,4],font:['17px Arial','12px Tahoma'],textAlign:['center','right'],letterSpacing:['.3px','2px'],imageSmoothingEnabled:[false,true]};
            g[property]=values[property][0];g.save();g[property]=values[property][1];g.save();g.reset();g.restore();const reset=g[property];g[property]=values[property][0];g.save();g[property]=values[property][1];g.restore();return [reset,g[property]];
        });
        for(let seed=2001;seed<=2128;seed++)add('sequenceC_'+seed,()=>{
            const g=fresh(seed%3!==0);let state=seed;const random=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state>>>9)%n;};
            for(let i=0;i<16;i++){
                const op=random(16),x=random(24),y=random(24);
                if(op===0)g.save();if(op===1)g.restore();if(op===2)g.translate((x%5)-2,(y%5)-2);if(op===3)g.scale((x%3+1)/2,(y%3+1)/2);if(op===4)g.resetTransform();if(op===5)g.beginPath();
                if(op===6)g.roundRect(x,y,8,9,[1,2,3,4]);if(op===7)g.ellipse(x,y,6,3,.2,0,5);if(op===8)g.bezierCurveTo(x,y,random(32),random(32),random(32),random(32));
                if(op===9){g.fillStyle=['red','rgba(20,170,240,.5)','transparent'][random(3)];g.fill();}
                if(op===10){g.lineWidth=random(4)+1;g.setLineDash(random(2)?[3,2]:[]);g.stroke();}
                if(op===11)g.clip();if(op===12)g.globalCompositeOperation=random(2)?'copy':'source-over';
                if(op===13)g.drawImage(source(),x,y,12,12);if(op===14)g.fillRect(x,y,8,8);if(op===15)g.globalAlpha=random(10)/10;
            }
            return pixels(g);
        });

        for(const singular of [false,true])for(const radii of [-1,-1e-46,1e40,[-1,Infinity],[Infinity,-1],{x:-1,y:Infinity},[],[1,2,3,4,5]])add('roundRectValidation_'+singular+'_'+JSON.stringify(radii),()=>{
            const g=fresh();shape(g,'line');if(singular)g.scale(0,1);const error=attempt(()=>g.roundRect(4,4,20,20,radii));g.resetTransform();g.lineTo(25,25);g.stroke();return {error,pixels:pixels(g)};
        });
        for(const method of ['getImageData','putImageData'])for(const point of [[2147483647,0],[-2147483648,0],[0,2147483647],[0,-2147483648],[2147483646,2147483646]])add('pixelIntegerEdge_'+method+'_'+point,()=>{
            const g=fresh();g.fillStyle='red';g.fillRect(0,0,32,32);if(method==='getImageData')return Array.from(g.getImageData(...point,2,2).data);
            g.putImageData(g.createImageData(2,2),...point);return pixels(g);
        });
        for(const method of ['fillRect','strokeRect','clearRect'])for(const args of [[0,0,1e40,1e40],[-1e40,0,1e40,32],[1e40,0,-1e40,32],[0,0,-1e40,32]])add('largeRect_'+method+'_'+args,()=>{
            const g=fresh();g.fillStyle='orange';g.fillRect(0,0,32,32);g.fillStyle='red';g.globalCompositeOperation='copy';g[method](...args);return pixels(g);
        });
        for(const v of [1e-12,1e-30,1e-40])for(const method of ['line','rect','quad','arc'])add('nearSingular_'+v+'_'+method,()=>{
            const g=fresh();g.scale(v,v);shape(g,method);g.resetTransform();g.lineTo(25,25);g.stroke();return pixels(g);
        });

        for(const baseline of ['top','hanging','middle','alphabetic','ideographic','bottom'])for(const font of ['16px Arial','bold 16px Tahoma','italic 16px Courier New'])for(const method of ['fillText','strokeText'])for(const rtl of [false,true])add('textCombination_'+baseline+'_'+font+'_'+method+'_'+rtl,()=>{
            const g=fresh();g.font=font;g.textBaseline=baseline;g.textAlign=rtl?'end':'center';g.direction=rtl?'rtl':'ltr';g.letterSpacing='.2px';g.wordSpacing='.3px';g.shadowColor='rgba(10,70,200,.6)';g.shadowBlur=2;g.shadowOffsetY=2;g.globalAlpha=.7;
            const p=g.createLinearGradient(2,0,25,20);p.addColorStop(0,'red');p.addColorStop(1,'blue');g.fillStyle=p;g.strokeStyle=p;g[method]('Ab c',16,16,20);return pixels(g);
        });
        for(const field of ['fillStyle','strokeStyle','shadowColor'])for(const color of ['#1234','#12345678','rgba(12,70,210,.23)','rgb(10% 20% 30% / 40%)','hsl(123deg 40% 60% / .2)','transparent','rebeccapurple'])add('styleLifecycle_'+field+'_'+color,()=>{
            const g=fresh();g[field]=color;const initial=g[field];g.save();g[field]='red';g.restore();const restored=g[field];g.canvas.height=32;return [initial,restored,g[field]];
        });
        function sequenceD(seed, limit=22) {
            const g=fresh(seed%3!==0);let state=seed;const random=n=>{state=(Math.imul(state,22695477)+1)>>>0;return (state>>>8)%n;};
            const gradient=g.createLinearGradient(0,0,32,24);gradient.addColorStop(0,'rgba(240,20,70,.6)');gradient.addColorStop(1,'blue');
            for(let i=0;i<limit;i++){
                const op=random(20),x=random(24),y=random(24);
                if(op===0)g.save();if(op===1)g.restore();if(op===2)g.translate((x%5)-2,(y%5)-2);if(op===3)g.scale((x%3+1)/2,(y%3+1)/2);if(op===4)g.resetTransform();if(op===5)g.beginPath();
                if(op===6)g.roundRect(x,y,8,9,[1,2,3,4]);if(op===7)g.arc(x,y,6,.2,5);if(op===8)g.bezierCurveTo(x,y,random(32),random(32),random(32),random(32));
                if(op===9){g.fillStyle=random(2)?gradient:'rgba(20,170,240,.5)';g.fill();}
                if(op===10){g.lineWidth=random(4)+1;g.setLineDash(random(2)?[3,2]:[]);g.stroke();}
                if(op===11)g.clip();if(op===12)g.globalCompositeOperation=random(2)?'copy':'source-over';
                if(op===13)g.drawImage(source(),x,y,12,12);if(op===14)g.fillRect(x,y,8,8);if(op===15)g.globalAlpha=random(10)/10;
                if(op===16){g.shadowColor='rgba(10,50,220,.7)';g.shadowOffsetX=2;g.shadowBlur=2;}if(op===17)g.closePath();if(op===18)g.clearRect(x,y,7,9);if(op===19)g.rotate(.1);
            }
            return pixels(g);
        }

        for(let seed=3001;seed<=3256;seed++)add('sequenceD_'+seed,()=>sequenceD(seed));
        for(const seed of [3006,3018,3052,3205])for(let limit=1;limit<=22;limit++)add('prefixD_'+seed+'_'+limit,()=>sequenceD(seed,limit));

        for(const kind of ['rect','roundRect','quad'])for(const shadow of [false,true])for(const globalAlpha of [1,.6])for(const stopAlpha of [.6,1])add('gradientShadowProbe_'+kind+'_'+shadow+'_'+globalAlpha+'_'+stopAlpha,()=>{
            const g=fresh();g.globalAlpha=globalAlpha;
            const p=g.createLinearGradient(0,0,32,24);p.addColorStop(0,'rgba(240,20,70,'+stopAlpha+')');p.addColorStop(1,'blue');g.fillStyle=p;
            if(shadow){g.shadowColor='rgba(10,50,220,.7)';g.shadowOffsetX=2;g.shadowBlur=2;}
            if(kind==='rect')g.fillRect(16,14,8,9);else if(kind==='roundRect'){g.roundRect(16,14,8,9,[1,2,3,4]);g.fill();}else{g.quadraticCurveTo(0,18,30,10);g.fill();}return pixels(g);
        });
        for(let seed=4001;seed<=4128;seed++)add('sweepF_sequence_'+seed,()=>sequenceD(seed,30));
        for(let seed=5001;seed<=5064;seed++)add('sweepG_sequence_'+seed,()=>sequenceD(seed,40));
        for(let seed=6001;seed<=6064;seed++)add('sweepH_sequence_'+seed,()=>sequenceD(seed,45));
        for(let limit=1;limit<=45;limit++)add('prefixH_6024_'+limit,()=>sequenceD(6024,limit));
        for(let seed=7001;seed<=7064;seed++)add('sweepI_sequence_'+seed,()=>sequenceD(seed,45));
        for(let seed=8001;seed<=8064;seed++)add('sweepJ_sequence_'+seed,()=>sequenceD(seed,50));
        for(let limit=1;limit<=50;limit++)add('prefixJ_8061_'+limit,()=>sequenceD(8061,limit));
        for(let seed=9001;seed<=9064;seed++)add('sweepK_sequence_'+seed,()=>sequenceD(seed,50));
        for(let seed=10001;seed<=10128;seed++)add('sweepL_sequence_'+seed,()=>sequenceD(seed,50));
        for(let seed=11001;seed<=11064;seed++)add('sweepM_sequence_'+seed,()=>sequenceD(seed,50));
        for(let seed=12001;seed<=12128;seed++)add('sweepN_sequence_'+seed,()=>sequenceD(seed,50));
        return results;
    }
    const initialEighteenthRoundCases = runEighteenthRoundCases;
    runEighteenthRoundCases = function(Canvas) {
        const results=initialEighteenthRoundCases(Canvas);
        const add=(name,fn)=>{try{results[name]={value:fn()};}catch(e){results[name]={error:e.name};}};
        const pixels=g=>Array.from(g.getImageData(0,0,32,32).data);
        for(const alpha of [false,true])for(const a of [0,1,127,128,254,255])for(const action of ['read','draw','resize','snapshot'])add('sweepE_pixel_'+alpha+'_'+a+'_'+action,()=>{
            const c=new Canvas(32,32),g=c.getContext('2d',{alpha});const d=g.createImageData(4,4);
            for(let i=0;i<d.data.length;i+=4)d.data.set([219,107,37,a],i);
            g.putImageData(d,8,8);
            if(action==='draw'){g.fillStyle='rgba(20,80,230,.3)';g.fillRect(8,8,4,4);}
            if(action==='resize')c.width=32;
            if(action==='snapshot'){const h=new Canvas(32,32).getContext('2d');h.drawImage(c,0,0);return pixels(h);}
            return pixels(g);
        });
        for(const alpha of [false,true])for(const shape of ['fillText','strokeText','arc','roundRect'])for(const angle of [.1,.3])for(const clipped of [false,true])add('sweepE_copy_'+alpha+'_'+shape+'_'+angle+'_'+clipped,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha});g.rotate(angle);
            if(clipped){g.arc(16,16,11,0,6);g.clip();g.beginPath();}
            g.globalCompositeOperation='copy';g.globalAlpha=.35;g.fillStyle='orange';g.strokeStyle='orange';g.font='13px Arial';
            if(shape.endsWith('Text'))g[shape]('Ab',6,19);else{if(shape==='arc')g.arc(16,16,9,.2,1.8);else g.roundRect(6,7,20,17,[1,3,5,2]);g.closePath();g.fill();}
            return pixels(g);
        });
        for(const method of ['scale','transform','setTransform','restore'])for(const n of [1,3,8,19])for(const shape of ['arc','roundRect','cubic'])add('sweepE_rebase_'+method+'_'+n+'_'+shape,()=>{
            const g=new Canvas(32,32).getContext('2d');g.translate(2,3);g.save();
            if(shape==='arc')g.arc(15,14,9,.2,5);else if(shape==='roundRect')g.roundRect(5,6,20,17,3);else{g.moveTo(3,4);g.bezierCurveTo(30,2,2,30,27,26);}
            for(let i=0;i<n;i++){g.rotate(.1);if(method==='scale')g.scale(.9,1.1);if(method==='transform')g.transform(.97,.02,-.01,1.03,.2,-.1);if(method==='setTransform')g.setTransform(.9,.1,-.1,1.1,2,3);if(method==='restore'){g.restore();g.save();}}
            g.resetTransform();g.fillStyle='rgba(240,50,20,.6)';g.fill();g.stroke();return pixels(g);
        });
        for(const alpha of [false,true])for(const position of [[3,4],[14,9],[20,18]])for(const shadow of [false,true])for(const angle of [0,.2])add('sweepE_layer_'+alpha+'_'+position+'_'+shadow+'_'+angle,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha}),s=new Canvas(8,8).getContext('2d');s.fillStyle='rgba(200,30,90,.5)';s.fillRect(0,0,8,8);
            g.rotate(angle);if(shadow){g.shadowColor='blue';g.shadowBlur=3;g.shadowOffsetY=2;}g.drawImage(s.canvas,...position,9,11);
            const grad=g.createLinearGradient(2,3,29,25);grad.addColorStop(0,'red');grad.addColorStop(1,'rgba(0,0,255,.6)');g.fillStyle=grad;g.roundRect(7,8,18,17,[2,3,1,4]);g.fill();return pixels(g);
        });
        for(const a of [0,1,128,255])for(const kind of ['pattern','bitmap','self','bitmapPattern'])add('sweepF_source_'+a+'_'+kind,()=>{
            const s=new Canvas(8,8),g=s.getContext('2d',{alpha:false}),d=g.createImageData(8,8);
            for(let i=0;i<d.data.length;i+=4)d.data.set([219,107,37,a],i);g.putImageData(d,0,0);
            const h=new Canvas(32,32).getContext('2d');
            if(kind==='pattern'){h.fillStyle=h.createPattern(s,'repeat');h.fillRect(0,0,32,32);}
            if(kind==='bitmap')h.drawImage(s.transferToImageBitmap(),0,0);
            if(kind==='self'){g.drawImage(s,1,1);h.drawImage(s,0,0);}
            if(kind==='bitmapPattern'){const b=s.transferToImageBitmap();h.fillStyle=h.createPattern(b,'repeat');h.fillRect(0,0,32,32);b.close();}
            return pixels(h);
        });
        for(const shape of ['fillText','strokeText'])for(const max of [4,12,40])for(const text of ['Ab','A B',' '])for(const alpha of [false,true])add('sweepF_text_'+shape+'_'+max+'_'+text+'_'+alpha,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha});g.font='13px Arial';g.rotate(.2);g.globalCompositeOperation='copy';g.globalAlpha=.4;g[shape](text,6,18,max);return pixels(g);
        });
        for(const kind of ['image','pattern','bitmap'])for(const alpha of [0,.4,1])for(const shadow of [false,true])for(const copy of [false,true])add('sweepG_opaque_'+kind+'_'+alpha+'_'+shadow+'_'+copy,()=>{
            const s=new Canvas(8,8),g=s.getContext('2d',{alpha:false}),d=g.createImageData(8,8);for(let i=0;i<d.data.length;i+=4)d.data.set([90,60,30,128],i);g.putImageData(d,0,0);
            const h=new Canvas(32,32).getContext('2d');h.fillStyle='lime';h.fillRect(0,0,32,32);h.globalAlpha=alpha;h.rotate(.1);
            if(copy)h.globalCompositeOperation='copy';if(shadow){h.shadowColor='blue';h.shadowBlur=3;h.shadowOffsetX=2;}
            if(kind==='pattern'){const p=h.createPattern(s,'repeat');p.setTransform({a:1.2,d:.8,e:2,f:1});h.fillStyle=p;h.roundRect(4,5,20,19,3);h.fill();}
            else h.drawImage(kind==='image'?s:s.transferToImageBitmap(),7,8,14,12);return pixels(h);
        });
        for(const alpha of [false,true])for(const action of ['reset','resize','transfer','saveRestore'])for(const method of ['fill','stroke'])for(const clipped of [false,true])add('sweepH_lifetime_'+alpha+'_'+action+'_'+method+'_'+clipped,()=>{
            const c=new Canvas(32,32),g=c.getContext('2d',{alpha});g.rotate(.2);g.save();g.roundRect(4,5,22,21,3);g.clip();g.fill();
            if(action==='reset')g.reset();if(action==='resize')c.width=32;if(action==='transfer'){const b=c.transferToImageBitmap();b.close();}if(action==='saveRestore')g.restore();
            g.beginPath();g.roundRect(6,7,19,18,[1,3,2,4]);if(clipped)g.clip();const p=g.createRadialGradient(10,10,1,18,17,15);p.addColorStop(0,'rgba(255,0,0,.4)');p.addColorStop(1,'blue');g.fillStyle=p;g.strokeStyle=p;g.lineWidth=3;g[method]();return pixels(g);
        });
        for(const alpha of [false,true])for(const style of ['solid','transparent','gradient','pattern'])for(const method of ['fillRect','fill','stroke','fillText'])add('sweepI_zeroShadow_'+alpha+'_'+style+'_'+method,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha});g.fillStyle='orange';g.fillRect(0,0,32,32);g.arc(16,16,11,.2,5);g.clip();g.translate(2,1);g.clip();g.globalAlpha=0;g.shadowColor='blue';g.shadowBlur=3;g.shadowOffsetX=2;
            if(style==='transparent')g.fillStyle='transparent';if(style==='gradient'){const p=g.createLinearGradient(0,0,32,32);p.addColorStop(0,'red');p.addColorStop(1,'blue');g.fillStyle=p;}if(style==='pattern'){const s=new Canvas(4,4);s.getContext('2d').fillRect(0,0,4,4);g.fillStyle=g.createPattern(s,'repeat');}
            g.strokeStyle=g.fillStyle;g.beginPath();g.roundRect(8,8,10,12,3);if(method==='fillRect')g.fillRect(8,8,10,12);else if(method==='fillText')g.fillText('Ab',8,18);else g[method]();return pixels(g);
        });
        for(const alpha of [false,true])for(const baseline of ['top','middle','alphabetic','bottom'])for(const method of ['fillText','strokeText'])for(const clipped of [false,true])add('sweepJ_text_'+alpha+'_'+baseline+'_'+method+'_'+clipped,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha});g.font='14px Arial';g.rotate(.15);g.textBaseline=baseline;g.textAlign='center';g.globalAlpha=.6;
            if(clipped){g.roundRect(4,4,23,24,4);g.clip();}g.shadowColor='rgba(0,0,255,.5)';g.shadowBlur=2;g.shadowOffsetX=1;
            const p=g.createLinearGradient(0,0,30,20);p.addColorStop(0,'orange');p.addColorStop(1,'blue');g.fillStyle=p;g.strokeStyle=p;g[method]('Ab c',16,16,19);return pixels(g);
        });
        for(const alpha of [false,true])for(const stroke of [false,true])for(const flush of [false,true])add('imageClipProbe_'+alpha+'_'+stroke+'_'+flush,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha});g.roundRect(0,9,8,9,[1,2,3,4]);if(stroke){g.lineWidth=2;g.setLineDash([3,2]);g.stroke();}g.clip();if(stroke){g.lineWidth=3;g.stroke();}g.shadowColor='rgba(10,50,220,.7)';g.shadowOffsetX=2;g.shadowBlur=2;
            if(stroke){g.arc(3,8,6,.2,5);g.lineWidth=1;g.setLineDash([]);g.stroke();g.closePath();}if(flush)g.getImageData(0,0,1,1);
            const s=new Canvas(8,8).getContext('2d');s.fillStyle='rgba(240,60,20,.5)';s.fillRect(0,0,8,8);s.fillStyle='blue';s.fillRect(0,0,4,4);g.drawImage(s.canvas,1,20,12,12);return pixels(g);
        });
        for(const alpha of [false,true])for(const kind of ['rect','image'])for(const y of [17.5,18,19,20])for(const blur of [0,1,2,3])add('sweepK_dirty_'+alpha+'_'+kind+'_'+y+'_'+blur,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha});g.fillStyle='rgba(30,90,180,.4)';g.fillRect(0,0,32,32);g.roundRect(0,9,8,9,[1,2,3,4]);g.clip();g.shadowColor='rgba(10,50,220,.7)';g.shadowBlur=blur;g.shadowOffsetX=2;g.fillStyle='red';
            if(kind==='rect')g.fillRect(1,y,12,12);else{const s=new Canvas(8,8).getContext('2d');s.fillStyle='rgba(255,0,0,.5)';s.fillRect(0,0,8,8);g.drawImage(s.canvas,1,y,12,12);}return pixels(g);
        });
        for(const alpha of [false,true])for(const shape of ['line','arc','closedArc','roundRect'])for(const transform of ['identity','translate','rotate','scale'])for(const method of ['fill','stroke'])add('sweepM_restore_'+alpha+'_'+shape+'_'+transform+'_'+method,()=>{
            const g=new Canvas(32,32).getContext('2d',{alpha});if(transform==='translate')g.translate(2,3);if(transform==='rotate')g.rotate(.2);if(transform==='scale')g.scale(.8,1.2);
            if(shape==='line'){g.moveTo(4,5);g.lineTo(24,25);}else if(shape==='roundRect')g.roundRect(4,5,20,19,[1,3,2,4]);else{g.arc(14,14,9,.2,5);if(shape==='closedArc')g.closePath();}
            g.save();g.globalAlpha=.1;g.restore();g.save();g.restore();const p=g.createLinearGradient(1,2,30,28);p.addColorStop(0,'orange');p.addColorStop(1,'blue');g.fillStyle=p;g.strokeStyle=p;g[method]();return pixels(g);
        });
        return results;
    };
    if(typeof module!=='undefined'&&module.exports)module.exports.runEighteenthRoundCases=runEighteenthRoundCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,eighteenthRound:runEighteenthRoundCases(OffscreenCanvas)}));
})();

// Coverage for the gaps found while reviewing demo.js.
(function () {
    function runNineteenthRoundCases(Canvas) {
        const results = {};
        const test = (name, fn) => { try { results[name] = {value: fn()}; } catch (e) { results[name] = {error: e.name}; } };
        const modes = ['source-over','source-in','source-out','source-atop','destination-over','destination-in','destination-out','destination-atop','lighter','copy','xor','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'];
        for (const mode of modes) for (const alpha of [true, false]) for (const shadow of [false, true]) {
            test(`composite_${mode}_${alpha}_${shadow}`, () => {
                const g = new Canvas(6,4).getContext('2d', {alpha});
                g.fillStyle = 'rgba(180,80,20,0.75)'; g.fillRect(0,0,4,4);
                g.globalCompositeOperation = mode;
                if (shadow) { g.shadowColor='rgba(0,80,240,0.5)';g.shadowOffsetX=1; }
                g.fillStyle='rgba(20,120,200,0.5)'; g.fillRect(2,1,2,2);
                return {mode:g.globalCompositeOperation,data:Array.from(g.getImageData(0,0,6,4).data)};
            });
            test(`composite_state_${mode}`, () => {
                const c=new Canvas(2,2),g=c.getContext('2d');g.globalCompositeOperation=mode;g.save();g.globalCompositeOperation='copy';g.restore();
                const saved=g.globalCompositeOperation;g.globalCompositeOperation='invalid';const invalid=g.globalCompositeOperation;c.width=2;
                return [saved,invalid,g.globalCompositeOperation];
            });
        }
        for(const mode of modes)for(const kind of ['path','image','pattern'])for(const outside of [false,true])test(`composite_clip_${mode}_${kind}_${outside}`,()=>{
            const c=new Canvas(12,8),g=c.getContext('2d');g.fillStyle='#c85321';g.fillRect(0,0,12,8);
            g.beginPath();g.rect(2,1,8,6);g.clip();g.translate(outside?30:1,1);
            g.globalCompositeOperation=mode;g.shadowColor='rgba(0,0,255,0.6)';g.shadowBlur=2;g.shadowOffsetX=1;
            const source=new Canvas(3,3),sg=source.getContext('2d');sg.fillStyle='rgba(10,200,90,0.5)';sg.fillRect(0,0,2,3);
            if(kind==='image')g.drawImage(source,2,1);
            else {g.fillStyle=kind==='pattern'?g.createPattern(source,'repeat'):'rgba(10,200,90,0.5)';g.beginPath();g.rect(2,1,3,3);g.fill();}
            return Array.from(g.getImageData(0,0,12,8).data);
        });
        const describe = d => ({width:d.width,height:d.height,colorSpace:d.colorSpace,pixelFormat:d.pixelFormat,type:d.data.constructor.name,data:Array.from(d.data)});
        for (const colorSpace of ['srgb','display-p3']) for (const colorType of ['unorm8','float16']) {
            const key=`color_${colorSpace}_${colorType}`;
            test(key, () => {
                const c=new Canvas(2,1),g=c.getContext('2d',{colorSpace,colorType});
                g.fillStyle='rgba(255,0,0,0.5)';g.fillRect(0,0,1,1);g.fillStyle='#00ff00';g.fillRect(1,0,1,1);
                const reads=[];
                for(const space of ['srgb','display-p3'])for(const pixelFormat of ['rgba-unorm8','rgba-float16'])reads.push(describe(g.getImageData(0,0,2,1,{colorSpace:space,pixelFormat})));
                const defaults=describe(g.getImageData(0,0,2,1));c.width=2;
                return {attributes:g.getContextAttributes(),reads,defaults,reset:describe(g.getImageData(0,0,2,1))};
            });
            for(const pixelFormat of ['rgba-unorm8','rgba-float16']) test(`${key}_write_${pixelFormat}`,()=>{
                const c=new Canvas(3,1),g=c.getContext('2d',{colorSpace,colorType});
                const d=g.createImageData(2,1,{colorSpace:'display-p3',pixelFormat});
                d.data.set(pixelFormat==='rgba-float16'?[1.25,0.125,0,1,0,0.5,1,0.5]:[255,32,0,255,0,128,255,128]);
                g.putImageData(d,1,0,0,0,1,1);
                return {input:describe(d),clone:describe(g.createImageData(d)),output:describe(g.getImageData(0,0,3,1,{colorSpace:'display-p3',pixelFormat}))};
            });
        }
        for(const sourceSpace of ['srgb','display-p3'])for(const targetSpace of ['srgb','display-p3'])for(const kind of ['image','bitmap','pattern'])test(`color_source_${sourceSpace}_${targetSpace}_${kind}`,()=>{
            const source=new Canvas(2,1),sg=source.getContext('2d',{colorSpace:sourceSpace,colorType:'float16'});
            const d=sg.createImageData(2,1,{colorSpace:sourceSpace,pixelFormat:'rgba-float16'});d.data.set([1.125,0.25,0.125,1,0,0.5,1,0.5]);sg.putImageData(d,0,0);
            const g=new Canvas(2,1).getContext('2d',{colorSpace:targetSpace,colorType:'float16'});
            if(kind==='pattern'){g.fillStyle=g.createPattern(source,'repeat');g.fillRect(0,0,2,1);}else g.drawImage(kind==='bitmap'?source.transferToImageBitmap():source,0,0);
            return describe(g.getImageData(0,0,2,1,{pixelFormat:'rgba-float16'}));
        });
        for(const alpha of [false,true])test(`float16_transfer_clear_${alpha}`,()=>{
            const c=new Canvas(2,1),g=c.getContext('2d',{colorSpace:'display-p3',colorType:'float16',alpha});g.fillStyle='red';g.fillRect(0,0,2,1);c.transferToImageBitmap();
            // Chrome 153 can return uninitialized F16 bytes outside the bitmap.
            // Compare the defined pixels here; Node's zero padding is asserted
            // independently in test.js instead of adopting that browser defect.
            return describe(g.getImageData(0,0,2,1,{pixelFormat:'rgba-float16'}));
        });
        for(const kind of ['linear','radial','conic'])test(`colored_gradient_${kind}`,()=>{
            const g=new Canvas(16,16).getContext('2d');
            const gr=kind==='linear'?g.createLinearGradient(0,0,16,16):kind==='radial'?g.createRadialGradient(8,8,0,8,8,12):g.createConicGradient(0,8,8);
            gr.addColorStop(0,'red');gr.addColorStop(0.5,'lime');gr.addColorStop(1,'blue');g.fillStyle=gr;g.fillRect(0,0,16,16);
            return Array.from(g.getImageData(0,0,16,16).data);
        });
        test('visible_text_fill',()=>{const g=new Canvas(64,32).getContext('2d');g.font='20px Arial';g.fillStyle='#f38020';g.fillText('Ry',2,24);return Array.from(g.getImageData(0,0,64,32).data);});
        return results;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runNineteenthRoundCases=runNineteenthRoundCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,nineteenthRound:runNineteenthRoundCases(OffscreenCanvas)}));
})();

(function () {
    function runTwentiethRoundCases(Canvas) {
        const results={};
        const test=(name,fn)=>{try{results[name]={value:fn()};}catch(e){results[name]={error:e.name};}};
        const describe=d=>({colorSpace:d.colorSpace,pixelFormat:d.pixelFormat,data:Array.from(d.data,v=>Number.isNaN(v)?'NaN':v===Infinity?'Infinity':v===-Infinity?'-Infinity':v)});
        for(const width of [16384,16385,20000,32768,65536])for(const colorType of ['unorm8','float16'])test(`wide_${width}_${colorType}`,()=>{
            const g=new Canvas(width,1).getContext('2d',{colorType});if(!g)return null;
            g.fillStyle='red';g.fillRect(0,0,1,1);g.fillRect(width-1,0,1,1);
            return {lost:g.isContextLost(),left:describe(g.getImageData(0,0,1,1)),right:describe(g.getImageData(width-1,0,1,1))};
        });
        for(const space of ['srgb','display-p3'])for(const colorType of ['unorm8','float16'])for(const alpha of [false,true]) {
            const prefix=`pixels_${space}_${colorType}_${alpha}`;
            for(const pixelFormat of ['rgba-unorm8','rgba-float16'])test(`${prefix}_${pixelFormat}`,()=>{
                const g=new Canvas(3,1).getContext('2d',{colorSpace:space,colorType,alpha});
                const d=g.createImageData(3,1,{colorSpace:space,pixelFormat});d.data.set(pixelFormat==='rgba-float16'?[1,.25,.125,0,1,.25,.125,.25,1,.25,.125,1]:[255,64,32,0,255,64,32,64,255,64,32,255]);
                g.putImageData(d,0,0);return describe(g.getImageData(0,0,3,1,{pixelFormat}));
            });
            for(const kind of ['linear','radial','conic'])test(`gradient_${space}_${colorType}_${alpha}_${kind}`,()=>{
                const g=new Canvas(8,8).getContext('2d',{colorSpace:space,colorType,alpha});
                const gradient=kind==='linear'?g.createLinearGradient(0,0,8,8):kind==='radial'?g.createRadialGradient(4,4,0,4,4,6):g.createConicGradient(.5,4,4);
                gradient.addColorStop(0,'rgba(255,0,0,0.125)');gradient.addColorStop(.3,'lime');gradient.addColorStop(1,'blue');g.fillStyle=gradient;g.fillRect(0,0,8,8);
                return describe(g.getImageData(0,0,8,8,{pixelFormat:colorType==='float16'?'rgba-float16':'rgba-unorm8'}));
            });
        }
        for(const sourceSpace of ['srgb','display-p3'])for(const targetSpace of ['srgb','display-p3'])for(const kind of ['direct','image','bitmap','pattern'])test(`hdr_${sourceSpace}_${targetSpace}_${kind}`,()=>{
            const source=new Canvas(4,1),sg=source.getContext('2d',{colorSpace:sourceSpace,colorType:'float16'});
            const d=sg.createImageData(4,1,{colorSpace:sourceSpace,pixelFormat:'rgba-float16'});
            d.data.set([1.17,.373,.219,.317,-.125,1.23,2.5,.73,.02,.123,.456,.004,2,1,.5,1]);sg.putImageData(d,0,0);
            const g=new Canvas(4,1).getContext('2d',{colorSpace:targetSpace,colorType:'float16'});
            if(kind==='direct')return describe(sg.getImageData(0,0,4,1,{colorSpace:targetSpace,pixelFormat:'rgba-float16'}));
            if(kind==='pattern'){g.fillStyle=g.createPattern(source,'repeat');g.fillRect(0,0,4,1);}else g.drawImage(kind==='bitmap'?source.transferToImageBitmap():source,0,0);
            return describe(g.getImageData(0,0,4,1,{pixelFormat:'rgba-float16'}));
        });
        for(const mode of ['source-in','destination-in','destination-out','destination-atop','xor','multiply'])for(const kind of ['fillRect','fill','stroke','fillText','strokeText'])for(const shadow of [false,true])test(`alpha_composite_${mode}_${kind}_${shadow}`,()=>{
            const g=new Canvas(24,24).getContext('2d',{alpha:false});g.fillStyle='#ff8033';g.fillRect(0,0,24,24);
            g.beginPath();g.rect(2,2,20,20);g.clip();g.translate(6,6);g.rotate(.3);g.globalCompositeOperation=mode;
            g.fillStyle='rgba(40,200,60,.4)';g.strokeStyle=g.fillStyle;g.lineWidth=2;
            if(shadow){g.shadowColor='rgba(0,0,255,.6)';g.shadowBlur=2;g.shadowOffsetX=4;}
            if(kind==='fillRect')g.fillRect(0,0,8,8);
            else if(kind==='fill'||kind==='stroke'){g.beginPath();g.rect(0,0,8,8);g[kind]();}
            else {g.font='12px Arial';g[kind]('Ry',0,8);}
            return describe(g.getImageData(0,0,24,24));
        });
        for(const pixelFormat of ['rgba-unorm8','rgba-float16'])for(const action of ['cloneDetached','putDetached','cloneCrossContext'])test(`image_data_${pixelFormat}_${action}`,()=>{
            const g=new Canvas(1,1).getContext('2d'),d=g.createImageData(1,1,{colorSpace:'display-p3',pixelFormat});
            if(action==='cloneCrossContext')return describe(new Canvas(1,1).getContext('2d').createImageData(d));
            structuredClone(d.data.buffer,{transfer:[d.data.buffer]});
            return action==='cloneDetached'?describe(g.createImageData(d)):g.putImageData(d,0,0);
        });
        return results;
    }
    // Keep allocation regressions in separate local processes: the original
    // putLast failure aborted the native module instead of throwing in JS.
    function runTwentiethAllocationCase(Canvas, name) {
        try {
            const c=new Canvas(name==='resizeWide'?2:20000,1),g=c.getContext('2d',{colorType:'float16'});
            if(name==='resizeWide')c.width=20000;
            const d=g.createImageData(1,1,{pixelFormat:'rgba-float16'});d.data.set([1,0,0,1]);
            const x=name==='putLast'?19999:0;g.putImageData(d,x,0);
            return {value:{width:c.width,lost:g.isContextLost(),pixel:Array.from(g.getImageData(x,0,1,1,{pixelFormat:'rgba-float16'}).data)}};
        } catch(e) { return {error:e.name}; }
    }
    function runAllocationLifecycleCases(Canvas) {
        const result={};
        for(const width of [0,16385,32768,65535,65536,100000])for(const operation of ['fill','read','put','reset','resize']) {
            try {
                const c=new Canvas(width,1),g=c.getContext('2d'),before=g.isContextLost();let error;
                try {
                    if(operation==='fill')g.fillRect(0,0,1,1);
                    if(operation==='read')g.getImageData(0,0,1,1);
                    if(operation==='put')g.putImageData(g.createImageData(1,1),0,0);
                    if(operation==='reset')g.reset();
                    if(operation==='resize')c.width=1;
                }catch(e){error=e.name;}
                const after=g.isContextLost();c.width=2;g.fillStyle='red';g.fillRect(0,0,1,1);
                result[`${width}_${operation}`]={before,after,error:error||null,recovered:g.isContextLost(),pixel:Array.from(g.getImageData(0,0,1,1).data)};
            }catch(e){result[`${width}_${operation}`]={error:e.name};}
        }
        return result;
    }
    if(typeof module!=='undefined'&&module.exports) {
        module.exports.runAllocationLifecycleCases=runAllocationLifecycleCases;
        module.exports.runTwentiethRoundCases=runTwentiethRoundCases;
        module.exports.runTwentiethAllocationCase=runTwentiethAllocationCase;
    } else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,
        allocationLifecycle:runAllocationLifecycleCases(OffscreenCanvas),
        twentiethRound:runTwentiethRoundCases(OffscreenCanvas),
        twentiethAllocation:Object.fromEntries(['putLast','readFirst','resizeWide'].map(name=>[name,runTwentiethAllocationCase(OffscreenCanvas,name)]))}));
})();

(function () {
    function runAllocationEdgeCases(Canvas) {
        const result={};
        const ops={
            fillZero:g=>g.fillRect(0,0,0,0),fillFlat:g=>g.fillRect(0,0,0,1),fillOutside:g=>g.fillRect(-10,-10,1,1),
            clearZero:g=>g.clearRect(0,0,0,0),clearFlat:g=>g.clearRect(0,0,0,1),clearOutside:g=>g.clearRect(-10,-10,1,1),
            strokeZero:g=>g.strokeRect(0,0,0,0),strokeFlat:g=>g.strokeRect(0,0,0,1),
            fillEmpty:g=>g.fill(),strokeEmpty:g=>g.stroke(),fillPoint:g=>{g.moveTo(0,0);g.fill();},
            fillSingular:g=>{g.scale(0,0);g.fillRect(0,0,1,1);},
            clipEmpty:g=>g.clip(),fillClipped:g=>{g.clip();g.fillRect(0,0,1,1);},
            textEmpty:g=>g.fillText('',0,0),textNan:g=>g.fillText('A',NaN,0),textMaxZero:g=>g.fillText('A',0,0,0),
            readZero:g=>g.getImageData(0,0,0,1),readOutside:g=>g.getImageData(-2,-2,1,1),
            putDirtyZero:g=>g.putImageData(g.createImageData(1,1),0,0,0,0,0,1),
            putOutside:g=>g.putImageData(g.createImageData(1,1),-2,-2),
            imageZero:g=>g.drawImage(new Canvas(1,1),0,0,0,0),
            imageOutside:g=>g.drawImage(new Canvas(1,1),-2,-2),
            imageCropOutside:g=>g.drawImage(new Canvas(1,1),5,5,1,1,0,0,1,1),
            saveRestore:g=>{g.save();g.restore();},measure:g=>{g.measureText('A');},
            pathHit:g=>{g.rect(0,0,1,1);g.isPointInPath(.5,.5);}
        };
        for(const alpha of [false,true])for(const [name,op] of Object.entries(ops)) {
            const c=new Canvas(65536,1),g=c.getContext('2d',{alpha});let error=null;
            try{op(g);}catch(e){error=e.name;}
            const lost=g.isContextLost();c.width=2;g.fillStyle='red';g.fillRect(0,0,1,1);
            result[`${alpha}_${name}`]={error,lost,pixel:Array.from(g.getImageData(0,0,1,1).data)};
        }
        return result;
    }
    function runRasterEdgeCases(Canvas) {
        const result={};
        for(const vertical of [false,true])for(const colorSpace of ['srgb','display-p3'])for(const colorType of ['unorm8','float16'])for(const alpha of [false,true])for(const op of ['fill','put','copy','pattern','reset']) {
            const c=new Canvas(vertical?2:20000,vertical?20000:2),g=c.getContext('2d',{colorSpace,colorType,alpha});
            const x=vertical?0:19998,y=vertical?19998:0;
            const pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8';
            const d=g.createImageData(2,2,{colorSpace,pixelFormat});
            d.data.set(colorType==='float16'?[1.17,.373,.219,.317,-.125,1.23,2.5,.73,.02,.123,.456,.004,2,1,.5,1]:[123,45,67,81,255,127,33,186,5,31,116,1,255,255,128,255]);
            try {
                if(op==='fill'){g.fillStyle='rgba(230,80,20,.37)';g.fillRect(x,y,2,2);}
                if(op==='put')g.putImageData(d,x,y);
                if(op==='copy'||op==='pattern') {
                    const source=new Canvas(2,2),sg=source.getContext('2d',{colorSpace,colorType});sg.putImageData(d,0,0);
                    if(op==='copy')g.drawImage(source,x,y);
                    else{g.translate(x,y);g.fillStyle=g.createPattern(source,'repeat');g.fillRect(0,0,2,2);}
                }
                if(op==='reset'){g.putImageData(d,x,y);g.reset();g.fillStyle='red';g.fillRect(x,y,1,1);}
                result[`${vertical}_${colorSpace}_${colorType}_${alpha}_${op}`]={pixelFormat,data:Array.from(g.getImageData(x,y,2,2,{colorSpace,pixelFormat}).data),lost:g.isContextLost()};
            }catch(e){result[`${vertical}_${colorSpace}_${colorType}_${alpha}_${op}`]={error:e.name};}
        }
        return result;
    }
    if(typeof module!=='undefined'&&module.exports)Object.assign(module.exports,{runAllocationEdgeCases,runRasterEdgeCases});
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,allocationEdges:runAllocationEdgeCases(OffscreenCanvas),rasterEdges:runRasterEdgeCases(OffscreenCanvas)}));
})();

(function () {
    function runLossStateCases(Canvas) {
        const r={};
        const ops={save:g=>g.save(),restore:g=>g.restore(),begin:g=>g.beginPath(),close:g=>g.closePath(),
            move:g=>g.moveTo(1,1),line:g=>g.lineTo(1,1),rect:g=>g.rect(0,0,1,1),
            scale:g=>g.scale(2,2),rotate:g=>g.rotate(.5),translate:g=>g.translate(1,1),
            transform:g=>g.transform(1,0,0,1,2,3),setTransform:g=>g.setTransform(1,0,0,1,2,3),resetTransform:g=>g.resetTransform(),
            hitEmpty:g=>g.isPointInPath(0,0),strokeHitEmpty:g=>g.isPointInStroke(0,0),
            gradient:g=>g.createLinearGradient(0,0,1,1),pattern:g=>g.createPattern(new Canvas(1,1),'repeat'),
            fillStyle:g=>{g.fillStyle='red';},font:g=>{g.font='15px Arial';},dash:g=>g.setLineDash([2,3]),
            transfer:(g,c)=>{const b=c.transferToImageBitmap();b.close();},
            dirtyEmpty:g=>g.putImageData(g.createImageData(1,1),0,0,5,5,1,1),
            imageEmpty:(g,c)=>g.drawImage(new Canvas(0,0),0,0),
            readOverflow:g=>g.getImageData(2147483647,0,2,1)};
        for(const lostFirst of [false,true])for(const [name,op] of Object.entries(ops)) {
            const c=new Canvas(65536,1),g=c.getContext('2d');
            if(lostFirst)g.fillRect(0,0,1,1);
            let error=null;try{op(g,c);}catch(e){error=e.name;}
            const lost=g.isContextLost();
            r[`${lostFirst}_${name}`]={error,lost,fillStyle:g.fillStyle,font:g.font,dash:g.getLineDash(),transform:['a','b','c','d','e','f'].map(k=>g.getTransform()[k])};
        }
        return r;
    }
    function runSnapshotPrecisionCases(Canvas) {
        const r={};
        for(const space of ['srgb','display-p3'])for(const colorType of ['unorm8','float16'])for(const kind of ['image','bitmap','pattern','self'])for(const seed of [17,81,153,257]) {
            const key=`${space}_${colorType}_${kind}_${seed}`,pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8';
            try {
                let c=new Canvas(16,1),g=c.getContext('2d',{colorSpace:space,colorType});
                const d=g.createImageData(16,1,{colorSpace:space,pixelFormat});let state=seed;
                const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
                for(let i=0;i<64;i++)d.data[i]=colorType==='float16'?(i%4===3?random():random()*3-.3):Math.floor(random()*256);
                g.putImageData(d,0,0);
                for(let pass=0;pass<3;pass++) {
                    const next=kind==='self'?c:new Canvas(16,1),ng=next.getContext('2d',{colorSpace:space,colorType});ng.globalCompositeOperation='copy';
                    if(kind==='pattern'){ng.fillStyle=ng.createPattern(c,'repeat');ng.fillRect(0,0,16,1);}
                    else ng.drawImage(kind==='bitmap'?c.transferToImageBitmap():c,0,0);
                    c=next;g=ng;
                }
                r[key]={pixelFormat,data:Array.from(g.getImageData(0,0,16,1,{colorSpace:space,pixelFormat}).data)};
            }catch(e){r[key]={error:e.name};}
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)Object.assign(module.exports,{runLossStateCases,runSnapshotPrecisionCases});
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,lossState:runLossStateCases(OffscreenCanvas),snapshotPrecision:runSnapshotPrecisionCases(OffscreenCanvas)}));
})();

(function () {
    async function runExportAllocationCases(Canvas) {
        const r={};
        for(const width of [0,2,65536])for(const pre of ['none','context','lost','resize'])for(const op of ['blob','transfer','draw','pattern']) {
            const c=new Canvas(width,1);let g;
            if(pre!=='none')g=c.getContext('2d');
            if(pre==='lost'){c.width=65536;g.fillRect(0,0,1,1);}
            if(pre==='resize'){c.width=65536;g.fillRect(0,0,1,1);c.width=width;}
            let value=null,error=null;
            try {
                if(op==='blob'){const b=await c.convertToBlob();value={type:b.type,nonempty:b.size>0};}
                if(op==='transfer'){const b=c.transferToImageBitmap();value={width:b.width,height:b.height};b.close();}
                if(op==='draw'||op==='pattern') {
                    const target=new Canvas(1,1).getContext('2d');
                    if(op==='draw')target.drawImage(c,0,0);
                    else{const p=target.createPattern(c,'repeat');value=p===null;target.fillStyle=p;target.fillRect(0,0,1,1);}
                    value={value,pixel:Array.from(target.getImageData(0,0,1,1).data)};
                }
            }catch(e){error=e.name;}
            r[`${width}_${pre}_${op}`]={value,error,lost:g?g.isContextLost():null};
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runExportAllocationCases=runExportAllocationCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(async value=>({...value,exportAllocation:await runExportAllocationCases(OffscreenCanvas)}));
})();

(function () {
    function runWideSourceCases(Canvas) {
        const r={};
        for(const width of [16385,20000])for(const vertical of [false,true])for(const colorType of ['unorm8','float16'])for(const alpha of [false,true])for(const kind of ['image','bitmap','pattern','crop']) {
            const c=new Canvas(vertical?2:width,vertical?width:2),g=c.getContext('2d',{colorType,alpha});
            const x=vertical?0:width-2,y=vertical?width-2:0;
            g.fillStyle='rgba(240,80,40,.37)';g.fillRect(x,y,1,2);g.fillStyle='lime';g.fillRect(x+1,y,1,2);
            const target=new Canvas(2,2).getContext('2d',{colorType}),pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8';
            try {
                if(kind==='pattern'){target.translate(-x,-y);target.fillStyle=target.createPattern(c,'repeat');target.fillRect(x,y,2,2);}
                else if(kind==='crop')target.drawImage(c,x,y,2,2,0,0,2,2);
                else target.drawImage(kind==='bitmap'?c.transferToImageBitmap():c,-x,-y);
                r[`${width}_${vertical}_${colorType}_${alpha}_${kind}`]={pixelFormat,data:Array.from(target.getImageData(0,0,2,2,{pixelFormat}).data)};
            }catch(e){r[`${width}_${vertical}_${colorType}_${alpha}_${kind}`]={error:e.name};}
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runWideSourceCases=runWideSourceCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,wideSource:runWideSourceCases(OffscreenCanvas)}));
})();

(function () {
    function runTiledCompositionCases(Canvas) {
        const r={};
        for(const mode of ['source-over','copy','multiply','destination-in'])for(const alpha of [false,true])for(const colorType of ['unorm8','float16'])for(const smoothing of [false,true])for(const variant of ['plain','rotate','crop','shadow']) {
            const key=`${mode}_${alpha}_${colorType}_${smoothing}_${variant}`;
            try {
                const c=new Canvas(20000,4),sg=c.getContext('2d',{colorType});
                sg.fillStyle='rgba(255,80,30,.37)';sg.fillRect(16380,0,4,4);sg.fillStyle='rgba(20,230,90,.73)';sg.fillRect(16384,1,4,3);
                const g=new Canvas(16,16).getContext('2d',{colorType,alpha});g.fillStyle='#335599';g.fillRect(0,0,16,16);g.globalCompositeOperation=mode;g.imageSmoothingEnabled=smoothing;
                g.beginPath();g.rect(1,1,14,14);g.clip();
                if(variant==='rotate'){g.translate(8,5);g.rotate(.31);g.translate(-8,-5);}
                if(variant==='shadow'){g.shadowColor='rgba(0,0,255,.6)';g.shadowBlur=2;g.shadowOffsetX=2;g.shadowOffsetY=1;}
                if(variant==='crop')g.drawImage(c,16381.3,.4,5.7,2.8,2.2,3.1,10.5,7.1);
                else g.drawImage(c,16380,0,8,4,2,3,12,8);
                const pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8';r[key]={pixelFormat,data:Array.from(g.getImageData(0,0,16,16,{pixelFormat}).data)};
            }catch(e){r[key]={error:e.name};}
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runTiledCompositionCases=runTiledCompositionCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,tiledComposition:runTiledCompositionCases(OffscreenCanvas)}));
})();

(function () {
    function runPixelLifecycleCases(Canvas) {
        const r={};
        for(const colorSpace of ['srgb','display-p3'])for(const colorType of ['unorm8','float16'])for(const raster of [false,true])for(const dirty of ['negative','outside','partial','full'])for(const phase of ['put','resize','transfer','restore']) {
            const key=`${colorSpace}_${colorType}_${raster}_${dirty}_${phase}`;
            try {
                const c=new Canvas(raster?20000:8,2),g=c.getContext('2d',{colorSpace,colorType,alpha:dirty!=='negative'}),x=c.width-6;
                const inputFormat=colorType==='float16'?'rgba-unorm8':'rgba-float16';
                const d=g.createImageData(8,2,{colorSpace:colorSpace==='srgb'?'display-p3':'srgb',pixelFormat:inputFormat});
                for(let i=0;i<d.data.length;i++)d.data[i]=inputFormat==='rgba-unorm8'?(i*59+17)%256:(i%4===3?(.13+(i%7)/9):((i*37)%171)/100-.15);
                g.fillStyle='rgba(50,120,230,.4)';g.fillRect(x,0,6,2);g.save();g.translate(3,4);g.beginPath();g.rect(0,0,1,1);g.clip();
                if(dirty==='negative')g.putImageData(d,x,0,6,2,-5,-2);
                if(dirty==='outside')g.putImageData(d,x,0,12,0,2,2);
                if(dirty==='partial')g.putImageData(d,x,0,-2,-1,7,4);
                if(dirty==='full')g.putImageData(d,x,0);
                const pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8';
                const before={pixelFormat,data:Array.from(g.getImageData(x,0,6,2,{colorSpace,pixelFormat}).data)};
                if(phase==='resize'){c.width=c.width;g.fillRect(x,0,2,2);}
                if(phase==='transfer'){const bitmap=c.transferToImageBitmap();bitmap.close();g.fillRect(x,0,2,2);}
                if(phase==='restore'){g.restore();g.fillRect(x,0,2,2);}
                r[key]={before,after:{pixelFormat,data:Array.from(g.getImageData(x,0,6,2,{colorSpace,pixelFormat}).data)},style:g.fillStyle,transform:['a','b','c','d','e','f'].map(k=>g.getTransform()[k]),lost:g.isContextLost()};
            }catch(e){r[key]={error:e.name};}
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runPixelLifecycleCases=runPixelLifecycleCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,pixelLifecycle:runPixelLifecycleCases(OffscreenCanvas)}));
})();

(function () {
    function runTransferStateCases(Canvas) {
        const r={};
        for(const raster of [false,true])for(const colorType of ['unorm8','float16'])for(const alpha of [false,true])for(const colorSpace of ['srgb','display-p3'])for(const state of ['normal','clip','transform','saved'])for(const operation of ['fill','clear']) {
            const key=`${raster}_${colorType}_${alpha}_${colorSpace}_${state}_${operation}`;
            try {
                const c=new Canvas(raster?20000:6,2),g=c.getContext('2d',{colorSpace,colorType,alpha}),x=c.width-6;
                g.fillStyle='rgba(120,60,220,.6)';g.fillRect(x,0,6,2);g.fillStyle='rgba(30,190,80,.7)';
                if(state==='saved'){g.save();g.fillStyle='red';}
                if(state==='clip'){g.beginPath();g.rect(x,0,3,2);g.clip();}
                if(state==='transform')g.translate(x,0);
                const b=c.transferToImageBitmap(),pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8';
                const read=()=>({pixelFormat,data:Array.from(g.getImageData(x,0,6,2,{colorSpace,pixelFormat}).data)});
                const blank=read();
                if(state==='saved')g.restore();
                const dx=state==='transform'?0:x;
                if(operation==='fill')g.fillRect(dx,0,6,2);else g.clearRect(dx,0,6,2);
                const out=new Canvas(6,2).getContext('2d',{colorSpace,colorType});out.drawImage(b,x,0,6,2,0,0,6,2);b.close();
                r[key]={blank,after:read(),snapshot:{pixelFormat,data:Array.from(out.getImageData(0,0,6,2,{colorSpace,pixelFormat}).data)},style:g.fillStyle};
            }catch(e){r[key]={error:e.name};}
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runTransferStateCases=runTransferStateCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,transferState:runTransferStateCases(OffscreenCanvas)}));
})();

(function () {
    function runFormatBoundaryCases(Canvas, raster=false) {
        const r={};
        const values={normal:[.17,.53,.81,.37,.93,.21,.41,.73],hdr:[-.125,1.23,2.5,.73,2,1,.5,1],lowAlpha:[.17,.53,.81,0.000003,.93,.21,.41,0.00004],transparent:[1,.5,.25,0,.2,.4,.8,1]};
        for(const sourceSpace of ['srgb','display-p3'])for(const colorSpace of ['srgb','display-p3'])for(const colorType of ['unorm8','float16'])for(const sourceFormat of ['rgba-unorm8','rgba-float16'])for(const alpha of [false,true])for(const [name,v] of Object.entries(values)) {
            const key=`${sourceSpace}_${colorSpace}_${colorType}_${sourceFormat}_${alpha}_${name}`;
            try {
                const g=new Canvas(raster?20000:2,1).getContext('2d',{colorSpace,colorType,alpha}),d=g.createImageData(2,1,{colorSpace:sourceSpace,pixelFormat:sourceFormat});
                d.data.set(v.map(n=>sourceFormat==='rgba-unorm8'?n*255:n));g.putImageData(d,0,0);
                const reads=[];
                for(const outputSpace of ['srgb','display-p3'])for(const pixelFormat of ['rgba-unorm8','rgba-float16'])reads.push({colorSpace:outputSpace,pixelFormat,data:Array.from(g.getImageData(0,0,2,1,{colorSpace:outputSpace,pixelFormat}).data,v=>Object.is(v,-0)?"-0":Number.isFinite(v)?v:String(v))});
                r[key]={reads};
            }catch(e){r[key]={error:e.name};}
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runFormatBoundaryCases=runFormatBoundaryCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,formatBoundary:runFormatBoundaryCases(OffscreenCanvas),rasterFormatBoundary:runFormatBoundaryCases(OffscreenCanvas,true)}));
})();

(function () {
    if(typeof module!=='undefined'&&module.exports)module.exports.runRasterFormatBoundaryCases=Canvas=>module.exports.runFormatBoundaryCases(Canvas,true);
})();

(function () {
    function runResetDrawingCases(Canvas) {
        const r={};
        for(const raster of [false,true])for(const colorSpace of ['srgb','display-p3'])for(const colorType of ['unorm8','float16'])for(const alpha of [false,true])for(const shape of ['rect','ellipse','stroke','gradient'])for(const operation of ['reset','resize']) {
            const key=`${raster}_${colorSpace}_${colorType}_${alpha}_${shape}_${operation}`;
            try {
                const width=raster?20000:8,c=new Canvas(width,8),g=c.getContext('2d',{colorSpace,colorType,alpha});
                g.save();g.translate(100,100);g.scale(.3,.7);g.rect(0,0,1,1);g.clip();g.globalAlpha=.1;g.globalCompositeOperation='destination-out';g.setLineDash([2,3]);
                if(operation==='reset')g.reset();else{c.width=0;c.width=width;}
                g.restore();g.fillStyle='#4080c0';g.fillRect(0,0,8,8);
                g.fillStyle='rgba(240,100,30,.43)';g.strokeStyle='rgba(30,230,90,.67)';
                if(shape==='rect'){g.fillRect(.7,1.3,5.6,4.4);g.clearRect(2,2,2,2);}
                if(shape==='ellipse'){g.beginPath();g.ellipse(4,4,3,2,.4,0,6.283185307179586);g.fill();}
                if(shape==='stroke'){g.lineWidth=1.5;g.setLineDash([2,1]);g.beginPath();g.moveTo(.5,1.5);g.bezierCurveTo(2,7,6,-1,7.5,6.5);g.stroke();}
                if(shape==='gradient'){const gr=g.createLinearGradient(0,0,8,8);gr.addColorStop(0,'rgba(255,0,0,.2)');gr.addColorStop(.4,'lime');gr.addColorStop(1,'rgba(0,0,255,.8)');g.fillStyle=gr;g.fillRect(0,0,8,8);}
                const pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8';r[key]={pixelFormat,data:Array.from(g.getImageData(0,0,8,8,{colorSpace,pixelFormat}).data),lost:g.isContextLost(),alpha:g.globalAlpha,mode:g.globalCompositeOperation};
            }catch(e){r[key]={error:e.name};}
        }
        return r;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runResetDrawingCases=runResetDrawingCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,resetDrawing:runResetDrawingCases(OffscreenCanvas)}));
})();

(function () {
    function runContextSeparationCases() {
        const node=typeof module!=='undefined'&&module.exports;
        const api=node?require('..'):globalThis;
        const html=(w=6,h=4)=>{const c=node?new api.HTMLCanvasElement():document.createElement('canvas');c.width=w;c.height=h;return c;};
        const off=(w=6,h=4)=>new api.OffscreenCanvas(w,h);
        const result={},test=(n,f)=>{try{result[n]={value:f()};}catch(e){result[n]={error:e.name};}};
        const err=f=>{try{f();return null;}catch(e){return e.name;}};
        const pixel=g=>Array.from(g.getImageData(0,0,1,1).data);
        test('constructors',()=>({same:api.CanvasRenderingContext2D===api.OffscreenCanvasRenderingContext2D,
            html:err(()=>new api.CanvasRenderingContext2D()),off:err(()=>new api.OffscreenCanvasRenderingContext2D()),
            htmlCall:err(()=>api.CanvasRenderingContext2D()),offCall:err(()=>api.OffscreenCanvasRenderingContext2D())}));
        for(const [name,make,Type,Other] of [['html',html,api.CanvasRenderingContext2D,api.OffscreenCanvasRenderingContext2D],['off',off,api.OffscreenCanvasRenderingContext2D,api.CanvasRenderingContext2D]]) {
            test(name+'_identity',()=>{const c=make(),g=c.getContext('2d');return {name:g.constructor.name,tag:Object.prototype.toString.call(g),same:c.getContext('2d')===g,owner:g.canvas===c,instance:g instanceof Type,other:g instanceof Other,proto:Object.getPrototypeOf(g)===Type.prototype};});
            test(name+'_resize',()=>{const c=make(),g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,6,4);g.save();g.translate(2,3);g.setLineDash([1,2]);c.width=c.width;g.restore();return {pixel:pixel(g),style:g.fillStyle,dash:g.getLineDash(),matrix:[g.getTransform().e,g.getTransform().f],same:c.getContext('2d')===g,owner:g.canvas===c};});
            test(name+'_zeroResize',()=>{const c=make(),g=c.getContext('2d');c.width=0;c.width=2;g.fillStyle='blue';g.fillRect(0,0,1,1);return {pixel:pixel(g),width:g.canvas.width};});
            test(name+'_modeLock',()=>{const c=make();c.getContext('2d');return [c.getContext('webgl')===null,c.getContext('webgl2')===null];});
            test(name+'_unknown',()=>[err(()=>make().getContext('other')),make().getContext('2d')!==null]);
            test(name+'_sameBrandBorrow',()=>{const a=make().getContext('2d'),b=make().getContext('2d');b.fillStyle='red';a.fillRect.call(b,0,0,1,1);return pixel(b);});
            for(const method of ['fillRect','getImageData','save','reset','isContextLost'])test(name+'_crossBorrow_'+method,()=>{
                const a=make().getContext('2d'),b=(name==='html'?off():html()).getContext('2d');
                return err(()=>a[method].call(b,0,0,1,1));
            });
            for(const prop of ['fillStyle','globalAlpha','font'])test(name+'_crossProperty_'+prop,()=>{
                make().getContext('2d');const other=(name==='html'?off():html()).getContext('2d');
                const d=Object.getOwnPropertyDescriptor(Type.prototype,prop);
                return [err(()=>d.get.call(other)),err(()=>d.set.call(other,prop==='globalAlpha'?.5:'red'))];
            });
            test(name+'_prototypeCall',()=>{const g=make().getContext('2d');g.fillStyle='lime';Type.prototype.fillRect.call(g,0,0,1,1);return pixel(g);});
        }
        test('transfer_beforeContext',()=>{const c=html(),o=c.transferControlToOffscreen(),g=o.getContext('2d');return {size:[o.width,o.height],name:g.constructor.name,owner:g.canvas===o,htmlGet:err(()=>c.getContext('2d')),again:err(()=>c.transferControlToOffscreen()),resize:err(()=>{c.width=10;})};});
        test('transfer_afterContext',()=>{const c=html();c.getContext('2d');return err(()=>c.transferControlToOffscreen());});
        test('unknownDoesNotLockTransfer',()=>{const c=html();c.getContext('unknown');return c.transferControlToOffscreen().width;});
        test('independentPixels',()=>{const c=html(),o=off(),a=c.getContext('2d'),b=o.getContext('2d');a.fillStyle='red';a.fillRect(0,0,1,1);b.fillStyle='blue';b.fillRect(0,0,1,1);return [pixel(a),pixel(b)];});
        for(const colorType of ['unorm8','float16'])for(const colorSpace of ['srgb','display-p3'])for(const direction of ['htmlToOff','offToHtml'])for(const kind of ['image','pattern'])test(`${colorType}_${colorSpace}_${direction}_${kind}`,()=>{
            const source=direction==='htmlToOff'?html(2,1):off(2,1),target=direction==='htmlToOff'?off(2,1):html(2,1);
            const sg=source.getContext('2d',{colorType,colorSpace}),g=target.getContext('2d',{colorType,colorSpace});
            const pixelFormat=colorType==='float16'?'rgba-float16':'rgba-unorm8',d=sg.createImageData(2,1,{colorSpace,pixelFormat});
            d.data.set(colorType==='float16'?[1.17,.373,.219,.317,-.125,1.23,2.5,.73]:[255,35,97,129,44,233,72,255]);sg.putImageData(d,0,0);
            if(kind==='image')g.drawImage(source,0,0);else{g.fillStyle=g.createPattern(source,'repeat');g.fillRect(0,0,2,1);}
            return {pixelFormat,data:Array.from(g.getImageData(0,0,2,1,{colorSpace,pixelFormat}).data)};
        });
        for(const [label,value] of [['negative',-1],['nan',NaN],['infinity',Infinity],['wrap',4294967298],['tooLarge',2147483648],['fraction',3.9],['text','4'],['undefined',undefined]])for(const prop of ['width','height'])test('html_dimension_'+prop+'_'+label,()=>{const c=html();c[prop]=value;return c[prop];});
        return result;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports.runContextSeparationCases=runContextSeparationCases;
    else globalThis.__canvasResult=Promise.resolve(globalThis.__canvasResult).then(value=>({...value,contextSeparation:runContextSeparationCases()}));
})();
