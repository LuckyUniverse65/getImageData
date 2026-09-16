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
        await add('spacingFontChange',()=>{const g=fresh();g.font='20px Arial';g.letterSpacing='1em';const before=g.measureText('AB').width;g.font='10px Arial';return {before,spacing:g.letterSpacing,...textResult(g,'AB')};});
        for(const [name,text] of [['combining','a\u0301b'],['ligature','office'],['fallback','A\u4e2da'],['spaces',' A  B ']])await add('spacingClusters_'+name,()=>{const g=fresh();g.font='17px Arial';g.letterSpacing='1.5px';g.wordSpacing='2px';return textResult(g,text);});
        await add('textOptionsSavedDrawing',()=>{const g=fresh();g.font='20px Arial';g.letterSpacing='2px';g.wordSpacing='1px';g.fontKerning='none';g.save();g.letterSpacing='0px';g.wordSpacing='0px';g.fontKerning='auto';g.restore();return textResult(g,'AV A');});
        for(const direction of ['ltr','rtl'])await add('bidiStrokeMaxWidth_'+direction,()=>{const g=fresh();g.font='17px Arial';g.direction=direction;g.textAlign='start';g.strokeText('ab \u05d0\u05d1 12',70,30,40);return pixels(g);});
        for(const family of ['Microsoft YaHei','SimSun','Noto Sans SC'])await add('italicFallbackStroke_'+family,()=>{const g=fresh();g.font='italic 17px Tahoma, "'+family+'"';g.shadowColor='blue';g.shadowOffsetX=2;g.shadowBlur=1;g.strokeText('A\u4e2da',4,30);return pixels(g);});
        return results;
    }
    if(typeof module!=='undefined'&&module.exports){module.exports=runFourthRoundCases;module.exports.runFifthRoundCases=runFifthRoundCases;module.exports.runSixthRoundCases=runSixthRoundCases;module.exports.runSeventhRoundCases=runSeventhRoundCases;module.exports.runEighthRoundCases=runEighthRoundCases;module.exports.runNinthRoundCases=runNinthRoundCases;module.exports.runTenthRoundCases=runTenthRoundCases;module.exports.runEleventhRoundCases=runEleventhRoundCases;module.exports.runTwelfthRoundCases=runTwelfthRoundCases;}
    else globalThis.__canvasResult=(async()=>({fourthRound:runFourthRoundCases(OffscreenCanvas),fifthRound:runFifthRoundCases(OffscreenCanvas),sixthRound:await runSixthRoundCases(OffscreenCanvas),seventhRound:runSeventhRoundCases(OffscreenCanvas),eighthRound:await runEighthRoundCases(OffscreenCanvas),ninthRound:await runNinthRoundCases(OffscreenCanvas),tenthRound:await runTenthRoundCases(OffscreenCanvas),eleventhRound:await runEleventhRoundCases(OffscreenCanvas),twelfthRound:await runTwelfthRoundCases(OffscreenCanvas)}))();
})();
