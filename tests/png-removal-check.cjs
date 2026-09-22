'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2];

async function main() {
    if (mode === 'browser') {
        // Reuse an approved probe path without restarting the persistent session.
        const slot = path.join(__dirname, 'twentythird-round-probe.js');
        const original = fs.readFileSync(slot);
        try {
            fs.copyFileSync(path.join(__dirname, 'png-removal-cases.js'), slot);
            const result = await require('../capture-cdp.cjs').capture({
                script: 'tests/twentythird-round-probe.js', outputName: 'png-removal'});
            console.log(JSON.stringify({chromeVersion: result.chromeVersion, runId: result.runId,
                cases: Object.keys(result.value).length,
                boundaries: Object.fromEntries(Object.entries(result.value).filter(([key]) => !/^(alpha|opaque)-/.test(key)))}));
        } finally {
            fs.writeFileSync(slot, original);
        }
        return;
    }
    assert.ok(['before', 'after'].includes(mode), 'Use before, browser or after');
    const canvas = require('../index.js');
    const result = await require('./png-removal-cases.js')(canvas.OffscreenCanvas, canvas.createImageBitmap);
    fs.writeFileSync(path.join(root, 'out', 'png-removal-' + mode + '.json'), JSON.stringify(result, null, 2) + '\n');
    if (mode === 'before') {
        console.log(JSON.stringify({cases: Object.keys(result).length,
            boundaries: Object.fromEntries(Object.entries(result).filter(([key]) => !/^(alpha|opaque)-/.test(key)))}));
        return;
    }
    const before = JSON.parse(fs.readFileSync(path.join(root, 'out/png-removal-before.json')));
    const browser = JSON.parse(fs.readFileSync(path.join(root, 'out/png-removal-browser.json')));
    const changed = [];
    let exact = 0;
    for (const [key, value] of Object.entries(result)) {
        if (JSON.stringify(value) === JSON.stringify(before[key])) exact++;
        else {
            changed.push(key);
            assert.deepEqual(value, browser.value[key], key + ' must match Chrome');
            assert.ok(value.type === 'image/webp' || value.type === 'image/jpeg', key);
        }
        if (/^(alpha|opaque)-/.test(key)) {
            assert.ok(value.bytes?.length, key + ' must encode successfully');
            assert.equal(value.pixels.length, 7 * 5 * 4);
        } else {
            // Encoders may produce different bitstreams; compare boundary behavior.
            assert.equal(value.error, browser.value[key].error, key);
            assert.equal(value.type, browser.value[key].type, key);
        }
    }
    assert.deepEqual(changed.sort(), ['jpeg-over-height', 'jpeg-over-width', 'jpeg-over-width-rows',
        'webp-over-height', 'webp-over-width', 'webp-over-width-rows']);
    const native = require('../webgl.node');
    assert.equal(native.encodeImage(new Uint8Array(4), 0, 1, 'image/png'), undefined);
    assert.equal(native.encodeImage(new Uint8Array(4), 2, 1, 'image/png'), undefined);
    assert.equal(native.encodeImage(new Uint8Array(16384 * 4), 16384, 1, 'image/webp'), undefined);
    // Fault injection covers genuine encoder failure without exhausting process memory.
    const originalEncoder = native.encodeImage;
    try {
        const input = new canvas.OffscreenCanvas(1, 1);
        input.getContext('2d');
        for (const empty of [undefined, null]) {
            native.encodeImage = () => empty;
            await assert.rejects(input.convertToBlob(), {name: 'EncodingError'});
        }
    } finally {
        native.encodeImage = originalEncoder;
    }
    const evidence = {backupCommit: '16cabd3e82904dab8ccfafaa72045ab15364bc29',
        chromeVersion: browser.chromeVersion, runId: browser.runId, scriptSHA256: browser.scriptSHA256,
        cases: Object.keys(result).length, unchanged: exact, changedToMatchChrome: changed,
        normalBytesAndDecodedPixelsExact: 60, nativeFailureValue: 'undefined',
        indexSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'index.js'))).digest('hex')};
    fs.writeFileSync(path.join(root, 'docs/png-removal-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence));
}
main().catch(error => {console.error(error); process.exitCode = 1;});
