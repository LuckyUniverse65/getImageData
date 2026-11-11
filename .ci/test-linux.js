'use strict';

const assert = require('node:assert/strict');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const args = isMainThread ? process.argv.slice(2) : workerData;
const api = args[0] === '--adapter'
    ? require(require('node:path').resolve(args[1]))(require(require('node:path').resolve(args[2])))
    : require('lucky65_canvas');

async function check() {
    let checks = 0;
    const canvas = new api.OffscreenCanvas(4, 2);
    const ctx = canvas.getContext('2d');
    assert.equal(ctx.canvas, canvas);
    assert.equal(ctx, canvas.getContext('2d'));
    assert.equal(canvas.getContext('webgl'), null);
    assert.equal(canvas.getContext('bitmaprenderer'), null);
    checks += 4;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 1, 1);
    assert.deepEqual(Array.from(ctx.getImageData(0, 0, 2, 1).data), [255, 0, 0, 255, 0, 0, 0, 0]);
    const image = new api.ImageData(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);
    ctx.putImageData(image, 1, 0);
    assert.deepEqual(Array.from(ctx.getImageData(1, 0, 1, 1).data), [0, 255, 0, 255]);
    checks += 2;
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
        const blob = await canvas.convertToBlob({ type });
        assert.equal(blob.type, type);
        const bitmap = await api.createImageBitmap(blob);
        assert.equal(bitmap.width, 4);
        assert.equal(bitmap.height, 2);
        const copy = new api.OffscreenCanvas(4, 2);
        copy.getContext('2d').drawImage(bitmap, 0, 0);
        if (type === 'image/png') {
            assert.deepEqual(Array.from(copy.getContext('2d').getImageData(0, 0, 4, 2).data),
                Array.from(ctx.getImageData(0, 0, 4, 2).data));
        }
        bitmap.close();
        assert.equal(bitmap.width, 0);
        checks++;
    }
    const crop = await api.createImageBitmap(canvas, 1, 0, 1, 1, { resizeWidth: 2, resizeHeight: 2, resizeQuality: 'pixelated' });
    const cropped = new api.OffscreenCanvas(2, 2);
    cropped.getContext('2d').drawImage(crop, 0, 0);
    assert.deepEqual(Array.from(cropped.getContext('2d').getImageData(0, 0, 1, 1).data), [0, 255, 0, 255]);
    crop.close();
    await assert.rejects(api.createImageBitmap(crop), { name: 'InvalidStateError' });
    checks += 2;

    ctx.translate(2, 1);
    const transferred = canvas.transferToImageBitmap();
    assert.ok(transferred instanceof api.ImageBitmap);
    assert.deepEqual(Array.from(ctx.getImageData(0, 0, 1, 1).data), [0, 0, 0, 0]);
    ctx.fillRect(0, 0, 1, 1);
    assert.deepEqual(Array.from(ctx.getImageData(2, 1, 1, 1).data), [255, 0, 0, 255]);
    transferred.close();
    canvas.width = canvas.width;
    assert.equal(ctx.getTransform().e, 0);
    assert.deepEqual(Array.from(ctx.getImageData(2, 1, 1, 1).data), [0, 0, 0, 0]);
    checks += 2;

    const path = new api.Path2D();
    path.rect(0, 0, 1, 1);
    ctx.fillStyle = 'blue';
    ctx.fill(path);
    assert.deepEqual(Array.from(ctx.getImageData(0, 0, 1, 1).data), [0, 0, 255, 255]);
    const gradient = ctx.createLinearGradient(0, 0, 4, 0);
    gradient.addColorStop(0, 'red'); gradient.addColorStop(1, 'blue');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 4, 1);
    const gradientPixels = ctx.getImageData(0, 0, 4, 1).data;
    assert.ok(gradientPixels[0] > gradientPixels[12]);
    const pattern = ctx.createPattern(cropped, 'repeat');
    ctx.fillStyle = pattern; ctx.fillRect(0, 0, 4, 2);
    assert.deepEqual(Array.from(ctx.getImageData(3, 1, 1, 1).data), [0, 255, 0, 255]);
    checks += 3;

    const text = new api.OffscreenCanvas(160, 50);
    const textCtx = text.getContext('2d');
    textCtx.font = '20px sans-serif';
    assert.ok(textCtx.measureText('Hello').width > 0);
    textCtx.fillText('Hello Canvas', 2, 30);
    assert.ok(textCtx.getImageData(0, 0, 160, 50).data.some((v, i) => i % 4 === 3 && v > 0));
    const encoded = api.encodeImage(textCtx.getImageData(0, 0, 160, 50).data, 160, 50, 'image/png');
    assert.equal((await api.loadImage(encoded)).width, 160);
    assert.throws(() => api.decodeImage(encoded), { name: 'NotSupportedError' });
    const html = new api.HTMLCanvasElement(2, 1);
    assert.ok(html.getContext('2d') instanceof api.CanvasRenderingContext2D);
    assert.throws(() => new api.HTMLCanvasElement().transferControlToOffscreen(), { name: 'NotSupportedError' });
    checks += 4;
    return checks;
}

async function main() {
    const checks = await check();
    await Promise.all([0, 1].map(() => new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { workerData: args });
        worker.once('error', reject);
        worker.once('exit', code => code ? reject(new Error('Worker exited ' + code)) : resolve());
    })));
    const diagnostics = JSON.parse(api.getRenderDiagnostics());
    console.log(JSON.stringify({ passed: true, platform: process.platform, arch: process.arch,
        node: process.version, checks, workers: 2, backend: diagnostics.defaultBackend,
        fontFamilies: diagnostics.availableFontFamilies.length,
        glibc: process.report.getReport().header.glibcVersionRuntime || null }));
}

(isMainThread ? main() : check().then(() => parentPort.close())).catch(error => {
    console.error(error); process.exitCode = 1;
});
