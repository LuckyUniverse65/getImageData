'use strict';
const assert = require('node:assert/strict');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {createRequire} = require('node:module');
const path = require('node:path');
const consumer = path.resolve(isMainThread ? process.argv[2] : workerData);
const api = createRequire(path.join(consumer, 'app.cjs'))('canvas');
async function test() {
    const {OffscreenCanvas, createImageBitmap, ImageData, Float16Array} = api;
    const a = new OffscreenCanvas(2, 1), b = new OffscreenCanvas(2, 1);
    const g = a.getContext('2d');
    g.fillStyle = 'red'; g.fillRect(0, 0, 1, 1);
    assert.deepEqual(Array.from(g.getImageData(0, 0, 2, 1).data), [255,0,0,255,0,0,0,0]);
    assert.deepEqual(Array.from(b.getContext('2d').getImageData(0, 0, 1, 1).data), [0,0,0,0]);
    assert.equal(g.fillRect.toString(), 'function fillRect() { [native code] }');
    const fp = new ImageData(new Float16Array([1,0,0,1]), 1, 1, {pixelFormat:'rgba-float16'});
    assert.equal(fp.data[0], 1);
    for (const type of ['image/png','image/jpeg','image/webp']) {
        const blob = await a.convertToBlob({type});
        assert.equal(blob.type, type);
        const image = await createImageBitmap(blob);
        assert.equal(image.width, 2); image.close();
    }
    const linked = process.report.getReport().sharedObjects || [];
    assert.ok(!linked.some(file => /(?:libEGL|libGLESv2)\.dll$/i.test(file)), 'ANGLE DLL was loaded');
    return {passed:true, float16:globalThis.Float16Array ? 'native' : 'embedded-ponyfill', linked};
}
if (isMainThread) test().then(async result => {
    await new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {workerData:consumer});
        worker.on('error', reject);
        worker.on('exit', code => code ? reject(new Error('Worker exited ' + code)) : resolve());
    });
    console.log(JSON.stringify(result));
}).catch(error => {console.error(error); process.exitCode=1;});
else test().then(() => parentPort.close()).catch(error => {throw error;});
