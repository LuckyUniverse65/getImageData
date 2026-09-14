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

function offscreenDimension(value) {
    const n = +value;
    if (!Number.isFinite(n) || Math.trunc(n) < 0) {
        throw new TypeError('Canvas dimension is outside the unsigned integer range');
    }
    if (Math.trunc(n) > 0xffffffff) throw new RangeError('Canvas dimension exceeds the native backend limit');
    return Math.trunc(n) || 0;
}

// Convert iterable and dictionary Web IDL arguments in JavaScript, then pass
// normalized numeric data to the native drawing/state implementation.
function adaptContextArguments(context) {
    const nativeDash = context.setLineDash;
    context.setLineDash = function (segments) {
        if (segments == null || typeof segments[Symbol.iterator] !== 'function') {
            throw new TypeError('Line dash must be an iterable');
        }
        return nativeDash.call(this, Array.from(segments, value => +value));
    };
    const nativeTransform = context.setTransform;
    context.setTransform = function (...args) {
        if (args.length >= 6) {
            const values=args.slice(0,6).map(value=>+value);
            if(values.every(Number.isFinite)) return nativeTransform.apply(this, values);
            return;
        }
        if (args.length > 1) throw new TypeError('setTransform requires a dictionary or six numbers');
        const dict = args[0];
        if (dict != null && typeof dict !== 'object' && typeof dict !== 'function') {
            throw new TypeError('Expected a matrix dictionary');
        }
        const values = [['a','m11',1],['b','m12',0],['c','m21',0],['d','m22',1],['e','m41',0],['f','m42',0]].map(([key,alias,fallback])=>{
            const first=dict?.[key],second=dict?.[alias];
            const a=first===undefined?undefined:+first,b=second===undefined?undefined:+second;
            if(a!==undefined && b!==undefined && a!==b && !(Number.isNaN(a)&&Number.isNaN(b))) {
                throw new TypeError('Conflicting matrix dictionary aliases');
            }
            return a===undefined?(b===undefined?fallback:b):a;
        });
        if(values.every(Number.isFinite)) return nativeTransform.apply(this, values);
    };
    const arities={fillRect:4,clearRect:4,strokeRect:4,rect:4,moveTo:2,lineTo:2,
        quadraticCurveTo:4,bezierCurveTo:6,arcTo:5,arc:5,ellipse:7,scale:2,translate:2,rotate:1,transform:6};
    for(const [name,count] of Object.entries(arities)) {
        const method=context[name];
        context[name]=function (...args) {
            if(args.length<count)throw new TypeError(`${name} requires ${count} arguments`);
            for(let i=0;i<count;i++)args[i]=+args[i];
            if(!args.slice(0,count).every(Number.isFinite))return;
            return method.apply(this,args);
        };
    }
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
    constructor(width, height) {
        if (arguments.length < 2) throw new TypeError('OffscreenCanvas requires width and height');
        this._width = offscreenDimension(width);
        this._height = offscreenDimension(height);
        this._contexts = new Map();
        this._native = new native.OffscreenCanvas(this._width, this._height);
    }

    get width() { return this._width; }
    set width(value) {
        this._resize(offscreenDimension(value), this._height);
    }

    get height() { return this._height; }
    set height(value) {
        this._resize(this._width, offscreenDimension(value));
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
        // OffscreenRenderingContextId is a case-sensitive Web IDL enum.
        const kind = String(type);
        if (!['2d', 'webgl', 'webgl2', 'bitmaprenderer'].includes(kind)) {
            throw new TypeError('Invalid OffscreenCanvas context type');
        }
        if (this._contexts.has(kind)) return this._contexts.get(kind);
        // Only a successful context creation locks the canvas to that mode.
        if (this._contexts.size) return null;
        if (kind === "2d" || kind === "webgl" || kind === "webgl2") {
            const context = this._native.getContext(kind, attributes);
            if (kind === "2d" && context && Object.getPrototypeOf(context) !== OffscreenCanvasRenderingContext2D.prototype) {
                Object.setPrototypeOf(context, OffscreenCanvasRenderingContext2D.prototype);
            }
            if (kind === '2d' && context) adaptContextArguments(context);
            if (context) Object.defineProperty(context, 'canvas', { value: this, enumerable: true });
            if (context) this._contexts.set(kind, context);
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
        // HTMLCanvasElement takes a DOMString and also accepts the WebGL alias.
        const name = String(type);
        const kind = name === 'experimental-webgl' ? 'webgl' : name;
        if (!['2d', 'webgl', 'webgl2', 'bitmaprenderer'].includes(kind)) return null;
        if (!this._offscreen) this._offscreen = new OffscreenCanvas(this.width, this.height);
        return this._offscreen.getContext(kind, attributes);
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
