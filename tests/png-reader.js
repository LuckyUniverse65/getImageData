'use strict';
const assert = require('node:assert/strict');
const { inflateSync } = require('node:zlib');
module.exports = async function decodePng(blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    let width, height;
    const idat = [];
    for (let offset = 8; offset < bytes.length;) {
        const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); assert.equal(data[8], 8); assert.equal(data[9], 6); }
        if (type === 'IDAT') idat.push(data);
        offset += length + 12;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * 4;
    assert.equal(raw.length, (stride + 1) * height);
    const result = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        for (let x = 0; x < stride; x++) {
            const at = y * stride + x, a = x >= 4 ? result[at - 4] : 0, b = y ? result[at - stride] : 0, c = y && x >= 4 ? result[at - stride - 4] : 0;
            let predictor = 0;
            if (filter === 1) predictor = a;
            else if (filter === 2) predictor = b;
            else if (filter === 3) predictor = Math.floor((a + b) / 2);
            else if (filter === 4) { const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);predictor=pa<=pb&&pa<=pc?a:pb<=pc?b:c; }
            else assert.equal(filter, 0);
            result[at] = raw[y * (stride + 1) + x + 1] + predictor;
        }
    }
    return Array.from(result);
};
