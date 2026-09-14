'use strict';
const assert = require('node:assert/strict');
const {OffscreenCanvas} = require('..');
const context = new OffscreenCanvas(2,2).getContext('2d');
(function () {
    const gradient = context.createLinearGradient(0,0,2,0);
    context.fillStyle = gradient;
    context.save();
    gradient.addColorStop(0,'red');
    gradient.addColorStop(1,'red');
    context.fillStyle = 'blue';
})();
global.gc();
context.restore();
context.fillRect(0,0,2,2);
assert.deepEqual(Array.from(context.getImageData(0,0,1,1).data),[255,0,0,255]);
assert.equal(typeof context.fillStyle.addColorStop,'function');
