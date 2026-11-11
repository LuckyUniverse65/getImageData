'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    return {exports: Object.keys(api).length, shapeParity: true, codecs: ['png','jpeg','webp']};
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
