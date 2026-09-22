'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const native = require('../webgl.node');
const api = require('..');

test('separate interfaces are available before creating user contexts', () => {
    assert.notEqual(api.CanvasRenderingContext2D, api.OffscreenCanvasRenderingContext2D);
    for (const Type of [api.CanvasRenderingContext2D, api.OffscreenCanvasRenderingContext2D]) {
        assert.equal(typeof Type.prototype.fillRect, 'function');
        assert.equal(typeof Object.getOwnPropertyDescriptor(Type.prototype, 'fillStyle').get, 'function');
        assert.throws(() => new Type(), TypeError);
    }
    const target = {};
    api.installWebGLGlobals(target);
    assert.equal(target.CanvasRenderingContext2D, api.CanvasRenderingContext2D);
    assert.equal(target.OffscreenCanvasRenderingContext2D, api.OffscreenCanvasRenderingContext2D);
    const canvas = target.document.createElement('canvas');
    assert.ok(canvas.getContext('2d') instanceof api.CanvasRenderingContext2D);
    assert.equal(canvas.getContext('2d').canvas, canvas);
});

test('native host and context brands reject cross-interface receivers', () => {
    const html = new native.HTMLCanvasElement(2, 2);
    const offscreen = new native.OffscreenCanvas(2, 2);
    const a = html.getContext('2d'), b = offscreen.getContext('2d');
    assert.throws(() => html.getContext.call(offscreen, '2d'), TypeError);
    assert.throws(() => offscreen.getContext.call(html, '2d'), TypeError);
    for (const [source, other] of [[a, b], [b, a]]) {
        assert.throws(() => source.fillRect.call(other, 0, 0, 1, 1), TypeError);
        const descriptor = Object.getOwnPropertyDescriptor(source, 'fillStyle');
        assert.throws(() => descriptor.get.call(other), TypeError);
        let converted = false;
        assert.throws(() => descriptor.set.call(other, {toString() {converted = true; return 'red';}}), TypeError);
        assert.equal(converted, false);
        const same = source === a ? html.getContext('2d') : offscreen.getContext('2d');
        same.fillStyle = 'red';
        source.fillRect.call(same, 0, 0, 1, 1);
        assert.deepEqual(Array.from(same.getImageData(0, 0, 1, 1).data), [255, 0, 0, 255]);
    }
});

test('DOM host storage is independent of an OffscreenCanvas wrapper', () => {
    const canvas = new api.HTMLCanvasElement(2, 1), context = canvas.getContext('2d');
    // A user property named like the old internal field cannot redirect storage.
    canvas._offscreen = new api.OffscreenCanvas(2, 1);
    context.fillStyle = 'red';context.fillRect(0, 0, 1, 1);
    assert.deepEqual(Array.from(canvas[api.canvasPixels]().slice(0, 4)), [255, 0, 0, 255]);
    assert.deepEqual(Array.from(canvas._offscreen[api.canvasPixels]().slice(0, 4)), [0, 0, 0, 0]);
    const getter = Object.getOwnPropertyDescriptor(api.CanvasRenderingContext2D.prototype, 'canvas').get;
    assert.equal(getter.call(context), canvas);
    assert.throws(() => getter.call(canvas._offscreen.getContext('2d')), TypeError);
    assert.throws(() => canvas.transferControlToOffscreen(), {name: 'InvalidStateError'});
});
