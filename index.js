"use strict";

const native = require("./webgl.node");
const { encodePng } = require('./src/png');
// Canvas 2D is provided by the compiled Node-API module.  The reference
// JavaScript rasterizer is intentionally not used as the production backend.
const OffscreenCanvasRenderingContext2D = native.OffscreenCanvasRenderingContext2D;

function dimension(value, fallback) {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) {
        throw new RangeError("Canvas dimensions must be finite unsigned integers");
    }
    return Math.floor(n);
}

class ImageBitmap {
    constructor(width, height, pixels) {
        this._width = width;
        this._height = height;
        this._pixels = new Uint8ClampedArray(pixels);
    }
    get width() { return this._width; }
    get height() { return this._height; }
    get data() { return this._pixels; }
    close() { this._width = 0; this._height = 0; this._pixels = new Uint8ClampedArray(0); }
}

class OffscreenCanvas {
    constructor(width = 300, height = 150) {
        this._width = dimension(width, 300);
        this._height = dimension(height, 150);
        this._contexts = new Map();
        this._native = new native.OffscreenCanvas(this._width, this._height);
    }

    get width() { return this._width; }
    set width(value) {
        this._resize(dimension(value, 300), this._height);
    }

    get height() { return this._height; }
    set height(value) {
        this._resize(this._width, dimension(value, 150));
    }

    get data() {
        if (!this._width || !this._height) return new Uint8ClampedArray(0);
        const context = this._contexts.get("2d");
        if (!context) return new Uint8ClampedArray(this._width * this._height * 4);
        return context.getImageData(0, 0, this._width, this._height).data;
    }

    _resize(width, height) {
        const context = this._contexts.get('2d');
        if (context) context._resize(width, height);
        this._width = width;
        this._height = height;
        this._native.width = width;
        this._native.height = height;
    }

    getContext(type, attributes) {
        const kind = String(type).toLowerCase();
        if (this._contexts.has(kind)) return this._contexts.get(kind);
        if (kind === "2d" || kind === "webgl" || kind === "experimental-webgl" || kind === "webgl2") {
            const context = this._native.getContext(kind, attributes);
            if (kind === "2d" && context && Object.getPrototypeOf(context) !== OffscreenCanvasRenderingContext2D.prototype) {
                Object.setPrototypeOf(context, OffscreenCanvasRenderingContext2D.prototype);
            }
            if (context) Object.defineProperty(context, 'canvas', { value: this, enumerable: true });
            this._contexts.set(kind, context);
            return context;
        }
        return null;
    }

    transferToImageBitmap() {
        const context = this._contexts.get("2d");
        if (!context) throw new DOMException('Canvas has no rendering context', 'InvalidStateError');
        if (!this._width || !this._height) throw new DOMException('Canvas has no transferable image', 'UnknownError');
        const bitmap = new ImageBitmap(this._width, this._height, this.data);
        context._clearBitmap();
        return bitmap;
    }

    async convertToBlob(options = {}) {
        if (!this._width || !this._height) throw new DOMException('Canvas has zero size', 'IndexSizeError');
        const bytes = encodePng(this._width, this._height, this.data);
        return new Blob([bytes], {type: 'image/png'});
    }
}

class HTMLCanvasElement {
    constructor(width = 300, height = 150) {
        this.width = dimension(width, 300);
        this.height = dimension(height, 150);
        this._offscreen = null;
    }
    transferControlToOffscreen() {
        if (this._offscreen) throw new Error("The canvas has already been transferred");
        this._offscreen = new OffscreenCanvas(this.width, this.height);
        return this._offscreen;
    }
    getContext(type, attributes) {
        if (!this._offscreen) this._offscreen = new OffscreenCanvas(this.width, this.height);
        return this._offscreen.getContext(type, attributes);
    }
    get data() {
        if (!this._offscreen) return new Uint8ClampedArray(this.width * this.height * 4);
        return this._offscreen.data;
    }
}

function installWebGLGlobals(target = globalThis) {
    native.installWebGLGlobals(target);
    target.OffscreenCanvas = OffscreenCanvas;
    target.OffscreenCanvasRenderingContext2D = OffscreenCanvasRenderingContext2D;
    target.CanvasRenderingContext2D = OffscreenCanvasRenderingContext2D;
    target.HTMLCanvasElement = HTMLCanvasElement;
    if (!target.document) {
        target.document = {
            createElement: function (name) {
                if (String(name).toLowerCase() === "canvas") return new HTMLCanvasElement();
                return {nodeName: String(name).toUpperCase()};
            }
        };
    }
    return target;
}

module.exports = Object.assign({}, native, {
    OffscreenCanvas,
    OffscreenCanvasRenderingContext2D,
    CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D,
    HTMLCanvasElement,
    installWebGLGlobals
});
