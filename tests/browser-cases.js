(function () {
    async function runCanvasCases(Canvas, decodeBlob) {
        const results = {};
        const fresh = (w = 24, h = 24) => { const c = new Canvas(w, h); return [c, c.getContext('2d')]; };
        const pixel = (g, x = 0, y = 0) => Array.from(g.getImageData(x, y, 1, 1).data);
        const pixels = g => Array.from(g.getImageData(0, 0, 24, 24).data);
        const error = fn => { try { fn(); return null; } catch (e) { return e.name; } };
        const add = async (name, fn) => { try { results[name] = await fn(); } catch (e) { results[name] = { unexpectedError: e.name, message: e.message }; } };
        await add('gradientLive', () => {
            const [, g] = fresh(); const gr = g.createLinearGradient(0, 0, 24, 0);
            g.fillStyle = gr; gr.addColorStop(0, 'red'); gr.addColorStop(1, 'red');
            g.fillRect(0, 0, 24, 24); return { same: g.fillStyle === gr, pixel: pixel(g) };
        });
        await add('gradientSavedReference', () => {
            const [, g] = fresh(); const gr = g.createRadialGradient(12, 12, 0, 12, 12, 20);
            gr.addColorStop(0, 'blue'); g.strokeStyle = gr; g.fillStyle = gr; g.save();
            g.fillStyle = 'red'; gr.addColorStop(1, 'blue'); g.restore(); g.fillRect(0, 0, 24, 24);
            return { fill: g.fillStyle === gr, stroke: g.strokeStyle === gr, pixel: pixel(g, 12, 12) };
        });
        await add('gradientAcrossContexts', () => {
            const [,a]=fresh(),[,b]=fresh();const gr=a.createLinearGradient(0,0,24,0);
            a.fillStyle=gr;b.fillStyle=gr;gr.addColorStop(0,'red');gr.addColorStop(1,'red');
            a.fillRect(0,0,24,24);b.fillRect(0,0,24,24);return [a.fillStyle===b.fillStyle,pixel(a),pixel(b)];
        });
        await add('gradientErrors', () => {
            const [,g]=fresh();const gr=g.createLinearGradient(0,0,24,0);
            return [error(()=>gr.addColorStop(-0.1,'red')),error(()=>gr.addColorStop(1.1,'red')),error(()=>gr.addColorStop(NaN,'red')),error(()=>gr.addColorStop(0,'invalid-color'))];
        });
        await add('resize', () => {
            const [c, g] = fresh(); g.fillStyle = 'red'; g.fillRect(0, 0, 24, 24); g.save(); g.translate(5, 5);
            c.width = 24; g.restore(); g.fillRect(0, 0, 2, 2);
            return { same: c.getContext('2d') === g, canvas: g.canvas === c, style: g.fillStyle, origin: pixel(g), cleared: pixel(g, 10, 10), transform: g.getTransform().e };
        });
        await add('resizeZeroAndBack', () => {
            const [c, g] = fresh(); c.width = 0; const empty = c.getContext('2d') === g;
            c.width = 5; c.height = 7; g.fillStyle = 'red'; g.fillRect(0, 0, 5, 7);
            return { empty, same: c.getContext('2d') === g, pixel: pixel(g, 4, 6) };
        });
        await add('resetClipTransform', () => {
            const [, g] = fresh(); g.rect(0, 0, 4, 4); g.clip(); g.translate(10, 0); g.save(); g.scale(2, 2);
            g.reset(); g.restore(); g.fillStyle = 'red'; g.fillRect(0, 0, 24, 24);
            return { origin: pixel(g), outside: pixel(g, 15, 15), matrix: Object.fromEntries(['a','b','c','d','e','f'].map(k => [k,g.getTransform()[k]])) };
        });
        await add('resetClearsPath', () => { const [, g] = fresh(); g.rect(0, 0, 24, 24); g.reset(); g.fill(); return pixel(g); });
        await add('pathTranslateAfterCreation', () => { const [, g] = fresh(); g.rect(0, 0, 4, 4); g.translate(10, 0); g.fillStyle = 'red'; g.fill(); return [pixel(g, 1, 1), pixel(g, 11, 1)]; });
        await add('pathMixedTransforms', () => { const [, g] = fresh(); g.rect(0, 0, 4, 4); g.save(); g.translate(10, 0); g.rect(0, 0, 4, 4); g.restore(); g.fillStyle = 'red'; g.fill(); return [pixel(g, 1, 1), pixel(g, 11, 1), pixel(g, 6, 1)]; });
        await add('pathClipAfterTransform', () => { const [, g] = fresh(); g.rect(0, 0, 4, 4); g.translate(10, 0); g.clip(); g.resetTransform(); g.fillStyle = 'red'; g.fillRect(0, 0, 24, 24); return [pixel(g, 1, 1), pixel(g, 11, 1)]; });
        await add('pathHitTest', () => { const [, g] = fresh(); g.translate(10, 0); g.rect(0, 0, 4, 4); return [g.isPointInPath(1, 1), g.isPointInPath(11, 1)]; });
        await add('pathScaleAfterCreation', () => { const [,g]=fresh();g.rect(1,1,3,3);g.scale(2,3);g.rect(4,1,2,2);g.resetTransform();g.fillStyle='red';g.fill();return [pixel(g,2,2),pixel(g,9,4),pixel(g,5,5)]; });
        await add('restorePreservesCurrentPath', () => {const [,g]=fresh();g.save();g.translate(10,0);g.rect(0,0,4,4);g.restore();g.fill();return [pixel(g,1,1),pixel(g,11,1)];});
        for (const method of ['arc', 'ellipse']) for (const ccw of [false, true]) {
            await add(method + (ccw ? 'CCW' : 'CW'), () => { const [, g] = fresh(); g.beginPath(); if (method === 'arc') g.arc(12,12,8,0,Math.PI/2,ccw); else g.ellipse(12,12,8,6,0,0,Math.PI/2,ccw); g.stroke(); return pixels(g); });
        }
        await add('arcConnection', () => { const [, g] = fresh(); g.moveTo(1, 1); g.arc(12, 12, 8, 0, Math.PI / 2); g.stroke(); return pixels(g); });
        await add('arcFullTurnCCW', () => { const [, g] = fresh(); g.arc(12,12,8,0,-Math.PI*4,true); g.fill(); return pixels(g); });
        await add('arcNegativeAngles', () => {const [,g]=fresh();g.arc(12,12,8,-Math.PI/2,-Math.PI,true);g.stroke();return pixels(g);});
        await add('ellipseCCWRotated', () => {const [,g]=fresh();g.ellipse(12,12,8,6,0.4,0.3,2,true);g.stroke();return pixels(g);});
        await add('arcRadiusErrors',()=>{const [,g]=fresh();return [error(()=>g.arc(0,0,-1,0,1)),error(()=>g.ellipse(0,0,-1,1,0,0,1)),error(()=>g.ellipse(0,0,1,-1,0,0,1))];});
        await add('negativeRead', () => { const [, g] = fresh(); g.fillStyle='red';g.fillRect(0,0,2,2);const d=g.getImageData(2,2,-2,-2);return {width:d.width,height:d.height,data:Array.from(d.data)}; });
        await add('fractionalRead', () => { const [, g] = fresh();g.fillStyle='red';g.fillRect(0,0,1,1);return Array.from(g.getImageData(-0.8,-0.8,1.9,1.9).data); });
        // Chrome 153 Graphite sometimes leaves the out-of-bounds portion
        // uninitialized. Its CPU readback provides the specified transparent padding.
        await add('outOfBoundsRead', () => { const g = new Canvas(24,24).getContext('2d',{willReadFrequently:true});g.fillStyle='red';g.fillRect(0,0,1,1);return Array.from(g.getImageData(-1,-1,2,2).data); });
        await add('readErrors', () => { const [, g] = fresh();return [error(()=>g.getImageData(0,0,0,1)),error(()=>g.getImageData(0,0,1,0)),error(()=>g.getImageData(0,0,NaN,1)),error(()=>g.getImageData(0,0))]; });
        await add('bitmapTransfer', () => {
            const [c,g]=fresh();g.fillStyle='red';g.fillRect(0,0,24,24);g.save();g.translate(2,0);g.beginPath();g.rect(0,0,3,3);g.clip();
            const bitmap=c.transferToImageBitmap(); const [,target]=fresh(); target.drawImage(bitmap,0,0); const transferred=pixel(target);
            const empty=pixel(g);const style=g.fillStyle;const translation=g.getTransform().e;g.fill();const filled=pixel(g,2,1);const outside=pixel(g,10,10);g.restore();
            if(bitmap.close)bitmap.close(); return {transferred,empty,style,translation,filled,outside,restored:g.getTransform().e};
        });
        await add('transferErrors', () => { const c=new Canvas(0,0);const a=error(()=>c.transferToImageBitmap());c.getContext('2d');return [a,error(()=>c.transferToImageBitmap()),error(()=>new Canvas(1,1).transferToImageBitmap())]; });
        for (const type of [undefined, 'image/png', 'image/unsupported']) await add('blob-' + (type || 'default'), async () => {
            const [c,g]=fresh(2,2);g.fillStyle='red';g.fillRect(0,0,2,2);g.save();g.translate(1,0);
            const pending=c.convertToBlob(type?{type}:undefined); const syncPixel=pixel(g);const blob=await pending;
            const bytes=new Uint8Array(await blob.arrayBuffer());const decoded=await decodeBlob(blob);
            return {type:blob.type,header:Array.from(bytes.slice(0,8)),decoded,syncPixel,after:pixel(g),style:g.fillStyle,translation:g.getTransform().e};
        });
        await add('blobZero', async () => {try {await new Canvas(0,0).convertToBlob();return null;}catch(e){return e.name;} });
        await add('blobSnapshot',async()=>{const [c,g]=fresh(2,2);g.fillStyle='rgba(255, 0, 0, 0.5)';g.fillRect(0,0,2,2);const pending=c.convertToBlob();g.clearRect(0,0,2,2);return {decoded:await decodeBlob(await pending),after:pixel(g)};});
        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runCanvasCases;
    else globalThis.__canvasResult = runCanvasCases(OffscreenCanvas, async blob => {
        const image=await createImageBitmap(blob);const canvas=new OffscreenCanvas(image.width,image.height);const g=canvas.getContext('2d');g.drawImage(image,0,0);image.close();return Array.from(g.getImageData(0,0,canvas.width,canvas.height).data);
    });
})();
