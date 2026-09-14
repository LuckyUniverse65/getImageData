"use strict";

const native = require("./webgl.node");
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

class OffscreenCanvas {
    constructor(width = 300, height = 150) {
        this._width = dimension(width, 300);
        this._height = dimension(height, 150);
        this._contexts = new Map();
        this._native = new native.OffscreenCanvas(this._width, this._height);
    }

    get width() { return this._width; }
    set width(value) {
        this._width = dimension(value, 300);
        this._resetContexts();
    }

    get height() { return this._height; }
    set height(value) {
        this._height = dimension(value, 150);
        this._resetContexts();
    }

    get data() {
        const context = this._contexts.get("2d");
        if (!context) return new Uint8ClampedArray(this._width * this._height * 4);
        return context.getImageData(0, 0, this._width, this._height).data;
    }

    _resetContexts() {
        this._native = new native.OffscreenCanvas(this._width, this._height);
        this._contexts.clear();
    }

    getContext(type, attributes) {
        const kind = String(type).toLowerCase();
        if (this._contexts.has(kind)) return this._contexts.get(kind);
        if (kind === "2d" || kind === "webgl" || kind === "experimental-webgl" || kind === "webgl2") {
            const context = this._native.getContext(kind, attributes);
            if (kind === "2d" && context && Object.getPrototypeOf(context) !== OffscreenCanvasRenderingContext2D.prototype) {
                Object.setPrototypeOf(context, OffscreenCanvasRenderingContext2D.prototype);
            }
            this._contexts.set(kind, context);
            return context;
        }
        return null;
    }

    transferToImageBitmap() {
        const context = this._contexts.get("2d");
        const pixels = context ? context.getImageData(0, 0, this._width, this._height).data : new Uint8ClampedArray(this._width * this._height * 4);
        if (context && typeof context.reset === "function") context.reset();
        return {width: this._width, height: this._height, data: new Uint8ClampedArray(pixels)};
    }

    convertToBlob(options) {
        const bitmap = this.transferToImageBitmap();
        const bytes = Buffer.from(bitmap.data);
        const type = options && options.type || "image/raw";
        if (typeof Blob === "function") return Promise.resolve(new Blob([bytes], {type}));
        return Promise.resolve({size: bytes.length, type, arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))});
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
