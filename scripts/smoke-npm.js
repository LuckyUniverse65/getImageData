'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const consumer = path.resolve(isMainThread ? process.argv[2] : workerData.consumer);
const consumerRequire = createRequire(path.join(consumer, 'app.js'));
const entry = consumerRequire.resolve('lucky65_canvas');
assert.equal(entry, path.join(consumer, 'node_modules/lucky65_canvas/index.js'));
const api = consumerRequire('lucky65_canvas');

async function smoke() {
    const { OffscreenCanvas, ImageData, Float16Array, createImageBitmap } = api;
    const canvas = new OffscreenCanvas(2, 1);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 1, 1);
    const expected = [255, 0, 0, 255, 0, 0, 0, 0];
    assert.deepEqual(Array.from(ctx.getImageData(0, 0, 2, 1).data), expected);
    assert.equal(ctx.canvas, canvas);
    const floatData = new ImageData(new Float16Array([1, 0, 0, 1]), 1, 1, { pixelFormat: 'rgba-float16' });
    assert.equal(floatData.data[0], 1);
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
        const blob = await canvas.convertToBlob({ type });
        assert.equal(blob.type, type);
        const bitmap = await createImageBitmap(blob);
        assert.equal(bitmap.width, 2);
        assert.equal(bitmap.height, 1);
        bitmap.close();
        if (type === 'image/png') {
            const decoded = api.decodeImage(new Uint8Array(await blob.arrayBuffer()));
            assert.deepEqual(Array.from(decoded.data), expected);
        }
    }
    const html = new api.HTMLCanvasElement(2, 1);
    assert.ok(html.getContext('2d') instanceof api.CanvasRenderingContext2D);
    canvas.width = canvas.width;
    assert.deepEqual(Array.from(ctx.getImageData(0, 0, 1, 1).data), [0, 0, 0, 0]);
    assert.equal((await import(pathToFileURL(entry).href)).default, api);
}

async function main() {
    await smoke();
    const sourceBinary = require(path.resolve(process.argv[3]));
    assert.deepEqual(Object.keys(api).sort(), Object.keys(sourceBinary).sort());
    // Exercise the existing 48x48 drawing without the demo's console output
    // or hardcoded historical reference array.
    const source = fs.readFileSync(path.join(__dirname, '../demo/demo_server.js'), 'utf8');
    const start = source.indexOf('    gl.scale(');
    const end = source.indexOf('    const data = Array.from(', start);
    assert.ok(start >= 0 && end > start, 'Demo drawing markers changed');
    const draw = source.slice(start, end) + '\nArray.from(gl.getImageData(0, 0, 48, 48).data);';
    const pixels = backend => vm.runInNewContext(draw, { gl: new backend.OffscreenCanvas(48, 48).getContext('2d') });
    const actual = Array.from(pixels(api));
    assert.deepEqual(actual, Array.from(pixels(sourceBinary)));
    await new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { workerData: { consumer } });
        worker.once('error', reject);
        worker.once('exit', code => code ? reject(new Error('Worker exited ' + code)) : resolve());
    });
    console.log(JSON.stringify({ passed: true, exports: Object.keys(api).length, demoRGBAValues: actual.length,
        demoMismatches: 0, codecs: ['png', 'jpeg', 'webp'], worker: true, esmDefaultImport: true }));
}

(isMainThread ? main() : smoke().then(() => parentPort.close())).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
