'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const entry = path.resolve(isMainThread ? process.argv[2] : workerData);
const api = require(entry);

function shape(api) {
    const descriptor = value => Object.fromEntries(Reflect.ownKeys(value).map(key => {
        const d = Object.getOwnPropertyDescriptor(value, key);
        return [String(key), { type: typeof d.value, get: !!d.get, set: !!d.set,
            enumerable: d.enumerable, configurable: d.configurable,
            ...(typeof d.value === 'function' ? { length: d.value.length, name: d.value.name } : {}) }];
    }).sort(([a], [b]) => a.localeCompare(b, 'en')));
    return Object.fromEntries(Object.keys(api).sort().map(key => [key, {
        type: typeof api[key], ...(typeof api[key] === 'function' ? {
            length: api[key].length, name: api[key].name,
            prototype: api[key].prototype ? descriptor(api[key].prototype) : null,
        } : {})
    }]));
}

async function check() {
    const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../snapshot/native-api-contract.json')));
    assert.deepEqual(shape(api), contract, 'All exports, prototypes, arities and accessors must match Windows');
    if (entry.endsWith('.js')) assert.equal((await import(pathToFileURL(entry).href)).default, api);
    const canvas = new api.OffscreenCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 8, 8);
    assert.deepEqual(Array.from(ctx.getImageData(1, 1, 1, 1).data), [255, 0, 0, 255]);
    for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
        const blob = await canvas.convertToBlob({type: mime});
        assert.equal(blob.type, mime);
        const data = api.decodeImage(new Uint8Array(await blob.arrayBuffer()));
        assert.equal(data.width, 8); assert.equal(data.height, 8);
        const bytes = api.encodeImage(data.data, data.width, data.height, mime);
        assert.ok(bytes.length > 0);
        const bitmap = await api.createImageBitmap(blob);
        assert.equal(bitmap.width, 8); bitmap.close();
    }
    const f = ctx.getImageData(0, 0, 1, 1, {pixelFormat: 'rgba-float16'});
    assert.ok(f.data instanceof api.Float16Array); assert.equal(f.data[0], 1);
    ctx.font = '18px sans-serif'; ctx.fillStyle = 'black'; ctx.fillText('Canvas 中文 العربية', 0, 7);
    assert.ok(ctx.measureText('Canvas').width > 0);
    const methods = exercise2D(api.OffscreenCanvas, api.OffscreenCanvasRenderingContext2D);
    exercise2D(api.HTMLCanvasElement, api.CanvasRenderingContext2D);
    const html = new api.HTMLCanvasElement(8, 8);
    const transferred = html.transferControlToOffscreen();
    assert.ok(transferred instanceof api.OffscreenCanvas);
    assert.throws(() => html.getContext('2d'), {name: 'InvalidStateError'});
    assert.throws(() => html.transferControlToOffscreen(), {name: 'InvalidStateError'});
    transferred.getContext('2d').fillRect(0, 0, 8, 8);
    assert.equal(html[api.canvasPixels]()[3], 255);
    const src = new api.OffscreenCanvas(2, 2);
    src.getContext('2d').fillStyle = 'lime'; src.getContext('2d').fillRect(0, 0, 2, 2);
    const frame = src.transferToImageBitmap();
    assert.equal(src.getContext('2d').getImageData(0, 0, 1, 1).data[3], 0);
    const dest = new api.OffscreenCanvas(2, 2);
    const renderer = dest.getContext('bitmaprenderer');
    assert.ok(renderer instanceof api.ImageBitmapRenderingContext);
    renderer.transferFromImageBitmap(frame);
    assert.equal(frame.width, 0);
    const decoded = api.decodeImage(new Uint8Array(await (await dest.convertToBlob()).arrayBuffer()));
    assert.deepEqual(Array.from(decoded.data.slice(0, 4)), [0, 255, 0, 255]);
    const crop = await api.createImageBitmap(dest, 0, 0, 1, 1, {resizeWidth: 4, resizeHeight: 3});
    assert.equal(crop.width, 4); assert.equal(crop.height, 3); crop.close();
    for (const mode of ['webgl', 'webgl2']) {
        const gl = new api.OffscreenCanvas(2, 2).getContext(mode);
        // The original WebGL compatibility implementation returns plain host objects.
        assert.ok(gl); assert.equal(typeof gl.createBuffer, 'function');
        assert.equal(gl.NO_ERROR, 0); assert.equal(gl.getError(), 0);
        const buffer = gl.createBuffer(); assert.ok(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1]), gl.STATIC_DRAW);
        gl.deleteBuffer(buffer);
        assert.ok(api.createWebGLContext(mode));
    }
    const target = {};
    api.installWebGLGlobals(target);
    assert.equal(target.OffscreenCanvas, api.OffscreenCanvas);
    assert.ok(target.document.createElement('canvas') instanceof api.HTMLCanvasElement);
    assert.deepEqual([new api.DOMPoint(1, 2).matrixTransform(new api.DOMMatrix([2, 0, 0, 3, 4, 5])).x,
        new api.DOMPoint(1, 2).matrixTransform(new api.DOMMatrix([2, 0, 0, 3, 4, 5])).y], [6, 11]);
    const p3 = new api.OffscreenCanvas(2, 2).getContext('2d', {colorSpace: 'display-p3', colorType: 'float16'});
    p3.fillStyle = 'red'; p3.fillRect(0, 0, 2, 2);
    const p3data = p3.getImageData(0, 0, 1, 1, {colorSpace: 'display-p3', pixelFormat: 'rgba-float16'});
    assert.equal(p3data.colorSpace, 'display-p3'); assert.ok(p3data.data instanceof api.Float16Array);
    assert.ok(p3data.data[0] > 0.9 && p3data.data[0] < 0.94); assert.equal(p3data.data[3], 1);
    const diagnostics = JSON.parse(api.getRenderDiagnostics());
    assert.ok(diagnostics.availableFontFamilies.length);
    if (process.platform === 'linux') {
        assert.equal(diagnostics.defaultBackend, 'raster'); assert.ok(diagnostics.rasterSurfaces > 0);
    }
    if (process.env.CANVAS_DIAGNOSTICS === '1') {
        assert.ok(diagnostics.usedFonts.length > 0);
        assert.ok(diagnostics.usedFonts.every(f => typeof f.version === 'string'));
    }
    const demo = fs.readFileSync(path.join(__dirname, '../demo/demo_server.js'), 'utf8');
    const start = demo.indexOf('    gl.scale('), end = demo.indexOf('    const data = Array.from(', start);
    assert.ok(start >= 0 && end > start);
    const draw = demo.slice(start, end) + '\nArray.from(gl.getImageData(0, 0, 48, 48).data)';
    const paint = () => Array.from(vm.runInNewContext(draw, {gl: new api.OffscreenCanvas(48,48).getContext('2d')}));
    const pixels = paint(); assert.equal(pixels.length,9216); assert.ok(pixels.some(v=>v!==0));
    assert.deepEqual(pixels, paint(), 'Repeated demo draws must be deterministic on this machine');
    for (let i = 0; i < 30; i++) {
        const c = new api.OffscreenCanvas(16,16), g = c.getContext('2d');
        const p = new api.Path2D('M0 0 H16 V16 H0 Z');
        g.fillStyle = 'blue'; g.fill(p);
        const b = c.transferToImageBitmap(); g.drawImage(b, 0, 0); b.close();
        assert.deepEqual(Array.from(g.getImageData(1,1,1,1).data), [0,0,255,255]);
        if (i % 10 === 0) global.gc?.();
    }
    return {exports: Object.keys(api).length, shapeParity: true, contextMethodsExercised: methods,
        codecs: ['png','jpeg','webp'], bitmaprenderer: true, htmlTransfer: true,
        float16: true, displayP3: true, webglCompatibility: true, lifecycleIterations: 30,
        demoRGBAValues: pixels.length, demoSHA256: crypto.createHash('sha256').update(Buffer.from(pixels)).digest('hex'), esmDefaultImport: entry.endsWith('.js')};
}

function exercise2D(Canvas, Context) {
    const c = new Canvas(32, 32), g = c.getContext('2d');
    assert.ok(g instanceof Context); assert.equal(g.canvas, c);
    assert.equal(c.getContext('2d'), g); assert.equal(c.getContext('webgl'), null);
    const called = new Set();
    const call = (name, ...args) => {called.add(name); return g[name](...args);};
    call('save'); call('translate', 3, 4); call('scale', 2, 2); call('rotate', 0);
    call('transform', 1, 0, 0, 1, 0, 0);
    assert.equal(call('getTransform').e, 3); call('restore');
    call('setTransform', new api.DOMMatrix([1,0,0,1,2,3])); call('resetTransform');
    call('setLineDash', [2,3]); assert.deepEqual(call('getLineDash'), [2,3]); call('setLineDash', []);
    call('beginPath'); call('moveTo', 1,1); call('lineTo', 10,1);
    call('quadraticCurveTo', 12,3,10,10); call('bezierCurveTo', 8,12,3,12,1,10); call('closePath');
    call('fill'); call('stroke'); call('beginPath'); call('rect', 0,0,20,20);
    assert.equal(call('isPointInPath', 5,5), true); assert.equal(call('isPointInStroke', 0,5), true);
    call('save'); call('clip'); call('fillRect', 0,0,32,32); call('restore');
    call('beginPath'); call('arc', 10,10,3,0,Math.PI); call('arcTo', 12,10,15,15,2);
    call('ellipse', 10,10,5,3,0,0,2*Math.PI); call('roundRect', 0,0,10,10,2); call('stroke');
    call('clearRect', 0,0,32,32); call('strokeRect', 2,2,20,20);
    for (const [name,args] of [['createLinearGradient',[0,0,32,0]], ['createRadialGradient',[16,16,0,16,16,16]], ['createConicGradient',[0,16,16]]]) {
        const gradient = call(name,...args); assert.ok(gradient instanceof api.CanvasGradient);
        gradient.addColorStop(0,'red'); gradient.addColorStop(1,'blue'); g.fillStyle=gradient;
        call('fillRect', 0,0,32,32); assert.equal(call('getImageData',16,16,1,1).data[3],255);
    }
    const tile = new api.OffscreenCanvas(1,1); tile.getContext('2d').fillStyle='lime'; tile.getContext('2d').fillRect(0,0,1,1);
    const pattern = call('createPattern',tile,'repeat'); assert.ok(pattern instanceof api.CanvasPattern);
    pattern.setTransform(new api.DOMMatrix()); g.fillStyle=pattern; call('fillRect',0,0,32,32);
    assert.deepEqual(Array.from(call('getImageData',3,3,1,1).data),[0,255,0,255]);
    call('drawImage',tile,0,0,4,4);
    const data=call('createImageData',1,1); data.data.set([255,0,0,255]); call('putImageData',data,3,3);
    assert.deepEqual(Array.from(call('getImageData',3,3,1,1).data),[255,0,0,255]);
    g.font='12px sans-serif'; g.fillStyle='black'; call('fillText','Canvas',0,14); call('strokeText','Canvas',0,28);
    const metrics=call('measureText','Canvas'); assert.ok(metrics instanceof api.TextMetrics); assert.ok(metrics.width>0);
    assert.equal(call('getContextAttributes').alpha,true); assert.equal(call('isContextLost'),false);
    call('reset'); assert.deepEqual(Array.from(call('getImageData',3,3,1,1).data),[0,0,0,0]);
    g.fillStyle = 'red'; g.globalAlpha = 0.5; call('fillRect',0,0,32,32);
    const half = call('getImageData',10,10,1,1).data; assert.equal(half[0],255); assert.ok(half[3]>=127 && half[3]<=128);
    call('reset'); g.filter = 'opacity(50%)'; call('fillRect',0,0,32,32);
    assert.ok(call('getImageData',10,10,1,1).data[3]>=127); assert.ok(call('getImageData',10,10,1,1).data[3]<=128);
    call('reset'); g.shadowColor = 'red'; g.shadowOffsetX = 12; g.fillStyle = 'blue'; call('fillRect',0,0,4,4);
    assert.deepEqual(Array.from(call('getImageData',13,1,1,1).data),[255,0,0,255]);
    c.width = c.width; assert.equal(g.shadowOffsetX,0); assert.equal(call('getImageData',13,1,1,1).data[3],0);
    const expected = Object.entries(shape(api)[Context.name].prototype).filter(([key,v])=>key!=='constructor'&&v.type==='function').map(([key])=>key).sort();
    assert.deepEqual([...called].sort(),expected,'Every existing 2D method must be exercised');
    return called.size;
}
async function main() {
    if (process.argv[3] === '--record-contract') {
        fs.writeFileSync(path.join(__dirname, '../snapshot/native-api-contract.json'), JSON.stringify(shape(api), null, 2) + '\n');
        return;
    }
    const result = await check();
    if (isMainThread) {
        await Promise.all(Array.from({length: 4}, () => new Promise((resolve, reject) => {
            const w = new Worker(__filename, {workerData: entry});
            w.once('error', reject); w.once('exit', c => c ? reject(new Error('Worker exit '+c)) : resolve());
        })));
        console.log(JSON.stringify({...result, platform: process.platform, workers: 4, passed: true}));
    } else parentPort.close();
}
main().catch(e => { console.error(e); process.exitCode = 1; });
