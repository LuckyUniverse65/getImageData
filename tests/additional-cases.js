(function () {
    function runAdditionalCases(Canvas) {
        const results = {};
        const fresh = (attributes) => new Canvas(16,16).getContext('2d',attributes);
        const pixel = (g,x=0,y=0) => Array.from(g.getImageData(x,y,1,1).data);
        const attempt = fn => { try { return {value:fn()}; } catch(e) { return {error:e.name}; } };
        const add = (name,fn) => {results[name]=attempt(fn);};
        const matrix = g => ['a','b','c','d','e','f'].map(key=>g.getTransform()[key]);
        const redSource = () => {const g=fresh();g.fillStyle='red';g.fillRect(0,0,16,16);return g.canvas;};

        add('emptyClip',()=>{const g=fresh();g.beginPath();g.clip();g.fillStyle='red';g.fillRect(0,0,16,16);return pixel(g);});
        add('setTransformObject',()=>{const g=fresh();g.setTransform({a:2,d:3,e:4,f:5});return matrix(g);});
        add('setTransformNoArgs',()=>{const g=fresh();g.translate(4,5);g.setTransform();return matrix(g);});
        add('invalidLineDash',()=>{const g=fresh();g.setLineDash([3,4]);g.setLineDash([2,-1]);return g.getLineDash();});
        add('iterableLineDash',()=>{const g=fresh();g.setLineDash(new Float32Array([2,3]));return g.getLineDash();});
        add('numericStringRect',()=>{const g=fresh();g.fillStyle='red';g.fillRect('0','0','4','4');return pixel(g,1,1);});
        add('negativeFillRect',()=>{const g=fresh();g.fillStyle='red';g.fillRect(4,4,-4,-4);return pixel(g,1,1);});
        add('negativeClearRect',()=>{const g=fresh();g.fillStyle='red';g.fillRect(0,0,16,16);g.clearRect(4,4,-4,-4);return pixel(g,1,1);});
        add('copyFillOutside',()=>{const g=fresh();g.fillStyle='red';g.fillRect(0,0,16,16);g.globalCompositeOperation='copy';g.fillStyle='blue';g.fillRect(0,0,2,2);return [pixel(g),pixel(g,8,8)];});
        add('copyImageOutside',()=>{const g=fresh();g.fillStyle='blue';g.fillRect(0,0,16,16);g.globalCompositeOperation='copy';g.drawImage(redSource(),0,0,2,2);return [pixel(g),pixel(g,8,8)];});
        add('copyClippedOutside',()=>{const g=fresh();g.fillStyle='red';g.fillRect(0,0,16,16);g.rect(0,0,8,8);g.clip();g.globalCompositeOperation='copy';g.fillStyle='blue';g.fillRect(0,0,2,2);return [pixel(g),pixel(g,4,4),pixel(g,12,12)];});
        add('negativeImageDestination',()=>{const g=fresh();g.drawImage(redSource(),4,4,-4,-4);return pixel(g,1,1);});
        add('negativeImageSource',()=>{const g=fresh();g.drawImage(redSource(),4,4,-4,-4,0,0,4,4);return pixel(g,1,1);});
        add('imageSmoothingDefault',()=>{const c=new Canvas(2,1),s=c.getContext('2d');s.fillStyle='red';s.fillRect(0,0,1,1);s.fillStyle='blue';s.fillRect(1,0,1,1);const g=fresh();g.drawImage(c,0,0,8,4);return [pixel(g,3,1),pixel(g,4,1)];});
        add('imageSmoothingState',()=>{const g=fresh();const before=g.imageSmoothingEnabled;g.save();g.imageSmoothingEnabled=false;g.restore();return {before:before??null,after:g.imageSmoothingEnabled??null};});
        add('gradientCreationTransform',()=>{const g=fresh();g.translate(8,0);const gr=g.createLinearGradient(0,0,8,0);gr.addColorStop(0,'red');gr.addColorStop(1,'blue');g.resetTransform();g.fillStyle=gr;g.fillRect(0,0,16,16);return [pixel(g,1,1),pixel(g,9,1)];});
        add('gradientDrawTransform',()=>{const g=fresh();const gr=g.createLinearGradient(0,0,8,0);gr.addColorStop(0,'red');gr.addColorStop(1,'blue');g.translate(8,0);g.fillStyle=gr;g.fillRect(0,0,8,8);return pixel(g,9,1);});
        add('opaqueContext',()=>{const g=fresh({alpha:false});const before=pixel(g);g.fillStyle='red';g.fillRect(0,0,16,16);g.clearRect(0,0,16,16);return {before,after:pixel(g),attributes:g.getContextAttributes()??null};});
        add('zeroCanvasRead',()=>{const g=new Canvas(0,0).getContext('2d');return pixel(g);});
        add('negativeCreateImageData',()=>{const d=fresh().createImageData(-2,-3);return {width:d.width,height:d.height,length:d.data.length};});
        add('zeroCreateImageData',()=>{const d=fresh().createImageData(0,2);return {width:d.width,height:d.height};});
        add('putNegativeDirtySize',()=>{const g=fresh(),d=g.createImageData(2,2);for(let i=0;i<d.data.length;i+=4)d.data.set([255,0,0,255],i);g.putImageData(d,0,0,2,2,-2,-2);return pixel(g);});
        add('putFractionalOrigin',()=>{const g=fresh(),d=g.createImageData(1,1);d.data.set([255,0,0,255]);g.putImageData(d,-0.5,-0.5);return pixel(g);});
        add('emptyTextBounds',()=>{const t=fresh().measureText('');return {width:t.width,left:t.actualBoundingBoxLeft,right:t.actualBoundingBoxRight,ascent:t.actualBoundingBoxAscent,descent:t.actualBoundingBoxDescent};});
        add('fillTextMaxWidth',()=>{const g=fresh();g.font='12px Arial';g.fillText('MMMM',0,12,4);const d=g.getImageData(0,0,16,16).data;let outside=0;for(let y=0;y<16;y++)for(let x=5;x<16;x++)if(d[(y*16+x)*4+3])outside++;return {pixelsPastMaxWidth:outside};});
        add('invalidFont',()=>{const g=fresh();g.font='12px Arial';g.font='invalid';return g.font;});
        add('negativeArcTo',()=>{fresh().arcTo(0,0,1,1,-1);return 'accepted';});
        add('missingScaleArgument',()=>{const g=fresh();g.scale(2);return matrix(g);});
        add('missingCanvasDimensions',()=>{const c=new Canvas();return [c.width,c.height];});
        add('undefinedCanvasDimension',()=>{const c=new Canvas(2,2);c.width=undefined;return [c.width,c.height];});
        return results;
    }
    if(typeof module!=='undefined'&&module.exports)module.exports=runAdditionalCases;
    else globalThis.__canvasResult=runAdditionalCases(OffscreenCanvas);
})();
