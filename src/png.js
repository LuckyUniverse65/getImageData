'use strict';

const { deflateSync } = require('node:zlib');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    crcTable[i] = c;
}
function chunk(type, data) {
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length, 0);
    output.write(type, 4, 4, 'ascii');
    data.copy(output, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < output.length - 4; i++) crc = crcTable[(crc ^ output[i]) & 255] ^ (crc >>> 8);
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
    return output;
}

// PNG is mandatory for Canvas export. Other requested formats fall back to PNG
// until a corresponding encoder is available, as permitted by the Canvas API.
function encodePng(width, height, rgba) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6; // RGBA, 8 bits per component, non-interlaced.
    const stride = width * 4;
    const rows = Buffer.alloc((stride + 1) * height);
    const pixels = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    for (let y = 0; y < height; y++) pixels.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    return Buffer.concat([signature, chunk('IHDR', header), chunk('sRGB', Buffer.from([0])), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { encodePng };
