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
        return results;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports=runFourthRoundCases;
    else globalThis.__canvasResult=runFourthRoundCases(OffscreenCanvas);
})();
