"use strict";

const native = require("./webgl.node");
const { encodePng } = require('./src/png');
// Canvas 2D is provided by the compiled Node-API module.  The reference
// JavaScript rasterizer is intentionally not used as the production backend.
const OffscreenCanvasRenderingContext2D = native.OffscreenCanvasRenderingContext2D;
const imageDataObjects = new WeakSet();
const imageSources = new WeakSet();
const imageSourceState = new WeakMap();
const contexts = new WeakSet();
const contextInternals = new WeakMap();
const patternTransforms = new WeakMap();
class CanvasPattern {
    constructor() { throw new TypeError("Illegal constructor"); }
    get [Symbol.toStringTag]() { return "CanvasPattern"; }
    setTransform(matrix = {}) {
        const apply = patternTransforms.get(this);
        if (!apply) throw new TypeError("Illegal invocation");
        if (matrix != null && !isObject(matrix)) throw new TypeError("Expected a matrix dictionary");
        const fields = Object.create(null);
        for (const key of ["a","b","c","d","e","f","m11","m12","m21","m22","m41","m42"]) {
            const value = matrix?.[key];
            fields[key] = value === undefined ? undefined : +value;
        }
        const values = [["a","m11",1],["b","m12",0],["c","m21",0],["d","m22",1],["e","m41",0],["f","m42",0]].map(([key,alias,fallback]) => {
            const a=fields[key], b=fields[alias];
            if(a!==undefined && b!==undefined && a!==b && !(Number.isNaN(a)&&Number.isNaN(b))) throw new TypeError("Conflicting matrix dictionary aliases");
            return a===undefined ? (b===undefined ? fallback : b) : a;
        });
        return apply(...values);
    }
}
Object.defineProperty(CanvasPattern.prototype, 'setTransform', {enumerable:true});
Object.defineProperty(CanvasPattern.prototype, Symbol.toStringTag, {value:'CanvasPattern', writable:false, enumerable:false, configurable:true});
const offscreenCanvases = new WeakSet();
function requireOffscreenCanvas(value) {
    if(!offscreenCanvases.has(value))throw new TypeError('Illegal invocation');
}
const isObject = value => value !== null && (typeof value === 'object' || typeof value === 'function');
// Web IDL converts each iterator value immediately and does not perform
// Array.from's IteratorClose on conversion failure.
function convertSequence(value, iteratorMethod, convert) {
    const iterator=iteratorMethod.call(value);
    if(!isObject(iterator))throw new TypeError('Invalid iterator');
    const next=iterator.next,values=[];
    if(typeof next!=='function')throw new TypeError('Invalid iterator next');
    for(;;){
        const step=next.call(iterator);
        if(!isObject(step))throw new TypeError('Invalid iterator result');
        if(step.done)return values;
        values.push(convert(step.value));
    }
}
const domString = value => { if (typeof value === 'symbol') throw new TypeError('Cannot convert Symbol to string'); return String(value); };
function enumValue(value, allowed) {
    const text=domString(value);
    if(!allowed.includes(text))throw new TypeError('Invalid enum value: '+text);
    return text;
}
function contextOptions(attributes) {
    // OffscreenCanvas accepts an object argument; primitive options are empty.
    if(!isObject(attributes))return Object.create(null);
    const result=Object.create(null);
    const enums={colorSpace:['srgb','display-p3'],colorType:['unorm8','float16'],powerPreference:['default','low-power','high-performance']};
    for(const key of ['alpha','antialias','colorSpace','colorType','depth','desynchronized','failIfMajorPerformanceCaveat','powerPreference','premultipliedAlpha','preserveDrawingBuffer','stencil','willReadFrequently','xrCompatible']){
        const value=attributes[key];
        if(value!==undefined)result[key]=Object.hasOwn(enums,key)?enumValue(value,enums[key]):!!value;
    }
    return result;
}
function imageDataSettings(value) {
    if(value!=null&&!isObject(value))throw new TypeError('Expected ImageData settings dictionary');
    const result=Object.create(null);
    for(const [key,allowed] of [['colorSpace',['srgb','display-p3']],['pixelFormat',['rgba-unorm8','rgba-float16']]]){
        const member=value?.[key];
        if(member!==undefined)result[key]=enumValue(member,allowed);
    }
    return result;
}
function signedLong(value) {
    const n=+value;
    if(!Number.isFinite(n)||Math.trunc(n)<-2147483648||Math.trunc(n)>2147483647)throw new TypeError('Coordinate is outside signed long range');
    return Math.trunc(n)||0;
}
function checkImageSource(source) {
    if (!imageSources.has(source)) throw new TypeError('Expected a Canvas image source');
    const state = imageSourceState.get(source) || source;
    if (!state.width || !state.height) throw new DOMException('Image source has no pixels', 'InvalidStateError');
    return state;
}

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
    contexts.add(context);
    contextInternals.set(context, {
        opaque: context.getContextAttributes().alpha === false,
        read: context.getImageData.bind(context),
        resize: context._resize.bind(context),
        clear: context._clearBitmap.bind(context)
    });
    const nativeDash = context.setLineDash;
    context.setLineDash = function (segments) {
        if (!isObject(segments))throw new TypeError('Line dash must be a sequence object');
        const iterator=segments[Symbol.iterator];
        if (typeof iterator !== 'function') {
            throw new TypeError('Line dash must be an iterable');
        }
        return nativeDash.call(this, convertSequence(segments,iterator,value=>+value));
    };
    const nativeTransform = context.setTransform;
    context.setTransform = function (...args) {
        if (args.length >= 6) {
            const values=args.slice(0,6).map(value=>+value);
            if(values.every(Number.isFinite)) return nativeTransform.apply(this, values);
            return;
        }
        const dict = args[0];
        if (dict != null && typeof dict !== 'object' && typeof dict !== 'function') {
            throw new TypeError('Expected a matrix dictionary');
        }
        const fields={};
        for(const key of ['a','b','c','d','e','f','m11','m12','m21','m22','m41','m42','is2D','m13','m14','m23','m24','m31','m32','m33','m34','m43','m44']) {
            const value=dict?.[key];
            fields[key]=value===undefined?undefined:key==='is2D'?!!value:+value;
        }
        const values = [['a','m11',1],['b','m12',0],['c','m21',0],['d','m22',1],['e','m41',0],['f','m42',0]].map(([key,alias,fallback])=>{
            const a=fields[key],b=fields[alias];
            if(a!==undefined && b!==undefined && a!==b && !(Number.isNaN(a)&&Number.isNaN(b))) {
                throw new TypeError('Conflicting matrix dictionary aliases');
            }
            return a===undefined?(b===undefined?fallback:b):a;
        });
        if(fields.is2D===true && ['m13','m14','m23','m24','m31','m32','m33','m34','m43','m44'].some(k=>fields[k]!==undefined&&fields[k]!==(['m33','m44'].includes(k)?1:0)))throw new TypeError('Matrix is not 2D');
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
    for(const name of ['fillText','strokeText','measureText']) {
        const method=context[name],count=name==='measureText'?1:3;
        context[name]=function(...args){
            if(args.length<count)throw new TypeError(`${name} requires ${count} arguments`);
            args[0]=domString(args[0]).replace(/[\t\n\f\r]/g,' ');
            if(count===3){args[1]=+args[1];args[2]=+args[2];if(args[3]!==undefined)args[3]=+args[3];}
            return method.apply(this,args);
        };
    }
    const drawImage=context.drawImage;
    context.drawImage=function(...args){
        if(args.length<3 || args.length===4 || (args.length>5&&args.length<9))throw new TypeError('Invalid drawImage overload');
        if(!imageSources.has(args[0]))throw new TypeError('Expected a Canvas image source');
        const count=args.length>=9?9:args.length>=5?5:3;
        for(let i=1;i<count;i++)args[i]=+args[i];
        const source = checkImageSource(args[0]);
        if(!args.slice(1,count).every(Number.isFinite))return;
        args[0] = {width:source.width, height:source.height, data:source.data, opaque:source.opaque === true};
        return drawImage.apply(this,args.slice(0,count));
    };
    const createPattern=context.createPattern;
    context.createPattern=function(source,repetition){
        if(arguments.length<2)throw new TypeError('createPattern requires two arguments');
        if(!imageSources.has(source))throw new TypeError('Expected a Canvas image source');
        repetition=repetition===null?'':domString(repetition);
        if(!['','repeat','repeat-x','repeat-y','no-repeat'].includes(repetition))throw new DOMException('Invalid repetition','SyntaxError');
        const state = checkImageSource(source);
        const pattern=createPattern.call(this,{width:state.width,height:state.height,data:state.data},repetition||'repeat');
        if(pattern){
            patternTransforms.set(pattern,pattern.setTransform.bind(pattern));
            delete pattern.setTransform;
            Object.setPrototypeOf(pattern,CanvasPattern.prototype);
        }
        return pattern;
    };
    for(const name of ['getImageData','createImageData']) {
        const method=context[name];
        context[name]=function(...args){
            if(name==='createImageData' && (args.length===0 || (args.length===1&&!imageDataObjects.has(args[0]))))throw new TypeError('Expected ImageData or two dimensions');
            const count=name==='getImageData'?4:args.length>=2?2:0;
            if(args.length<count)throw new TypeError('Missing ImageData coordinates');
            if(count){
                for(let i=0;i<count;i++)args[i]=signedLong(args[i]);
                args[count]=imageDataSettings(args[count]);
            }
            const data=method.apply(this,args);if(data)imageDataObjects.add(data);return data;
        };
    }
    const putImageData=context.putImageData;
    context.putImageData=function(...args){
        if(args.length<3 || (args.length>3&&args.length<7))throw new TypeError('Invalid putImageData overload');
        if(!imageDataObjects.has(args[0]))throw new TypeError('Expected ImageData');
        // Complete user conversions before native code obtains a buffer pointer.
        const count=args.length>=7?7:3;
        for(let i=1;i<count;i++){
            args[i]=signedLong(args[i]);
        }
        if(args[0].data.buffer.byteLength===0)throw new DOMException('ImageData buffer is detached','InvalidStateError');
        return putImageData.apply(this,args);
    };
    for(const name of ['fill','clip','isPointInPath','isPointInStroke']) {
        const method=context[name],hit=name.startsWith('isPoint'),ruleIndex=hit?2:0;
        context[name]=function(...args){
            if(hit){if(args.length<2)throw new TypeError('Expected point coordinates');args[0]=+args[0];args[1]=+args[1];}
            if(name!=='isPointInStroke'){
                const rule=args[ruleIndex]===undefined?'nonzero':domString(args[ruleIndex]);
                if(!['nonzero','evenodd'].includes(rule))throw new TypeError('Invalid fill rule');
                args[ruleIndex]=rule;
            }
            return method.apply(this,args);
        };
    }
    const roundRect=context.roundRect;
    context.roundRect=function(x,y,w,h,radii=0){
        if(arguments.length<4)throw new TypeError('roundRect requires four coordinates');
        const coords=[+x,+y,+w,+h];
        const convertPoint=v=>{
            if(isObject(v)){let x=v.x;x=x===undefined?0:+x;let y=v.y;y=y===undefined?0:+y;return {x,y};}
            const n=+v;return {x:n,y:n};
        };
        const iterator=isObject(radii)?radii[Symbol.iterator]:undefined;
        if(iterator!=null&&typeof iterator!=='function')throw new TypeError('Invalid radii iterator');
        const points=iterator==null?[convertPoint(radii)]:convertSequence(radii,iterator,convertPoint);
        if(points.length<1||points.length>4)throw new RangeError('Expected one to four radii');
        if(!coords.every(Number.isFinite)||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;
        if(points.some(p=>p.x<0||p.y<0))throw new RangeError('Negative radius');
        return roundRect.call(this,...coords,points);
    };
    const stroke=context.stroke;
    context.stroke=function(...args){
        if(args.length)throw new TypeError('Expected Path2D');
        return stroke.call(this);
    };
    // Validate the receiver before argument conversion, including no-op calls.
    for(const name of Object.keys(context)){
        if(typeof context[name]!=='function')continue;
        const method=context[name];
        context[name]=function(...args){if(!contexts.has(this))throw new TypeError('Illegal invocation');return method.apply(this,args);};
    }
}

const imageBitmaps = new WeakSet();
const bitmapCreationKey = Symbol('ImageBitmap internal creation');
function requireImageBitmap(value) {
    if(!imageBitmaps.has(value))throw new TypeError('Illegal invocation');
}
class ImageBitmap {
    #width; #height; #pixels;
    constructor(key, width, height, pixels) {
        if(key!==bitmapCreationKey)throw new TypeError('Illegal constructor');
        imageBitmaps.add(this);
        imageSources.add(this);
        const owner = this;
        imageSourceState.set(this, {
            get width() { return owner.#width; },
            get height() { return owner.#height; },
            get data() { return owner.#readPixels(); }
        });
        this.#width = width;
        this.#height = height;
        this.#pixels = new Uint8ClampedArray(pixels);
    }
    get width() { requireImageBitmap(this); return this.#width; }
    get height() { requireImageBitmap(this); return this.#height; }
    #readPixels() { return this.#pixels; }
    get data() { return this.#readPixels(); }
    close() { requireImageBitmap(this); this.#width = 0; this.#height = 0; this.#pixels = new Uint8ClampedArray(0); }
}

class OffscreenCanvas {
    #width; #height; #contexts; #native;
    constructor(width, height) {
        if (arguments.length < 2) throw new TypeError('OffscreenCanvas requires width and height');
        this.#width = offscreenDimension(width);
        this.#height = offscreenDimension(height);
        this.#contexts = new Map();
        this.#native = new native.OffscreenCanvas(this.#width, this.#height);
        offscreenCanvases.add(this);
        imageSources.add(this);
        const owner = this;
        imageSourceState.set(this, {
            get width() { return owner.#width; },
            get height() { return owner.#height; },
            get data() { return owner.#readPixels(); },
            get opaque() { return contextInternals.get(owner.#contexts.get("2d"))?.opaque === true; }
        });
    }

    get width() { requireOffscreenCanvas(this); return this.#width; }
    set width(value) {
        requireOffscreenCanvas(this);
        this.#resize(offscreenDimension(value), this.#height);
    }

    get height() { requireOffscreenCanvas(this); return this.#height; }
    set height(value) {
        requireOffscreenCanvas(this);
        const height = offscreenDimension(value);
        this.#resize(this.#width, height);
    }

    get data() { return this.#readPixels(); }

    #readPixels() {
        if (!this.#width || !this.#height) return new Uint8ClampedArray(0);
        const context = this.#contexts.get("2d");
        if (!context) return new Uint8ClampedArray(this.#width * this.#height * 4);
        return contextInternals.get(context).read(0, 0, this.#width, this.#height).data;
    }

    #resize(width, height) {
        const context = this.#contexts.get('2d');
        if (context) contextInternals.get(context).resize(width, height);
        this.#width = width;
        this.#height = height;
        this.#native.width = width;
        this.#native.height = height;
    }

    getContext(type, attributes) {
        requireOffscreenCanvas(this);
        // OffscreenRenderingContextId is a case-sensitive Web IDL enum.
        const kind = String(type);
        if (!['2d', 'webgl', 'webgl2', 'bitmaprenderer'].includes(kind)) {
            throw new TypeError('Invalid OffscreenCanvas context type');
        }
        // Web IDL conversion precedes the implementation's cached-context path.
        attributes=contextOptions(attributes);
        if (this.#contexts.has(kind)) return this.#contexts.get(kind);
        // Only a successful context creation locks the canvas to that mode.
        if (this.#contexts.size) return null;
        if (kind === "2d" || kind === "webgl" || kind === "webgl2") {
            const context = this.#native.getContext(kind, attributes);
            if (kind === "2d" && context && Object.getPrototypeOf(context) !== OffscreenCanvasRenderingContext2D.prototype) {
                Object.setPrototypeOf(context, OffscreenCanvasRenderingContext2D.prototype);
            }
            if (kind === '2d' && context) adaptContextArguments(context);
            if (context) Object.defineProperty(context, 'canvas', { value: this, enumerable: true });
            if (context) this.#contexts.set(kind, context);
            return context;
        }
        return null;
    }

    transferToImageBitmap() {
        requireOffscreenCanvas(this);
        const context = this.#contexts.get("2d");
        if (!context) throw new DOMException('Canvas has no rendering context', 'InvalidStateError');
        if (!this.#width || !this.#height) throw new DOMException('Canvas has no transferable image', 'UnknownError');
        const bitmap = new ImageBitmap(bitmapCreationKey, this.#width, this.#height, this.#readPixels());
        contextInternals.get(context).clear();
        return bitmap;
    }

    async convertToBlob(options = {}) {
        requireOffscreenCanvas(this);
        if(options!=null&&!isObject(options))throw new TypeError('Expected ImageEncodeOptions dictionary');
        // Web IDL reads dictionary members alphabetically, before canvas state.
        const quality=options?.quality;
        if(quality!==undefined)void +quality; // unrestricted double, including NaN/Infinity
        const type=options?.type;
        if(type!==undefined)domString(type);
        if (!this.#width || !this.#height) throw new DOMException('Canvas has zero size', 'IndexSizeError');
        if(!this.#contexts.size)throw new DOMException('Canvas has no rendering context','InvalidStateError');
        const bytes = encodePng(this.#width, this.#height, this.#readPixels());
        return new Blob([bytes], {type: 'image/png'});
    }
}

class HTMLCanvasElement {
    constructor(width = 300, height = 150) {
        imageSources.add(this);
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
    target.CanvasPattern = CanvasPattern;
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
    CanvasPattern,
    OffscreenCanvasRenderingContext2D,
    CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D,
    HTMLCanvasElement,
    installWebGLGlobals
});
