"use strict";

const native = require("./webgl.node");
const Float16Array = globalThis.Float16Array || require('@petamoriken/float16').Float16Array;
const { DOMMatrix, DOMMatrixReadOnly, DOMPoint, DOMPointReadOnly, matrixComponents, createMatrix } = require('./src/dommatrix.js');
// Canvas 2D is provided by the compiled Node-API module.  The reference
// JavaScript rasterizer is intentionally not used as the production backend.
const OffscreenCanvasRenderingContext2D = native.OffscreenCanvasRenderingContext2D;
const CanvasRenderingContext2D = native.CanvasRenderingContext2D;
const contextBrands = new WeakMap();
for(const Type of [CanvasRenderingContext2D,OffscreenCanvasRenderingContext2D]) {
    Object.defineProperty(Type.prototype,Symbol.toStringTag,{value:Type.name,configurable:true});
}
const imageDataObjects = new WeakSet();
const imageDataNative = new WeakMap();
const imageSources = new WeakSet();
const imageSourceState = new WeakMap();
const contexts = new WeakSet();
const contextInternals = new WeakMap();
// A rendering context's canvas lives beside the object, not on it: Chrome
// exposes `canvas` only as a prototype accessor.
const contextCanvases = new WeakMap();
const adaptedContextTypes = new Set();
// Raw backing-store access used by the host classes and by the Node-only
// tests. A symbol key keeps it out of every string-keyed reflection path.
const canvasPixels = Symbol('canvas backing store');
const patternTransforms = new WeakMap();
class CanvasPattern {
    constructor() { throw new TypeError("Illegal constructor"); }
    get [Symbol.toStringTag]() { return "CanvasPattern"; }
    setTransform(matrix = {}) {
        const apply = patternTransforms.get(this);
        if (!apply) throw new TypeError("Illegal invocation");
        const values = matrixDictionary(matrix);
        // Non-finite components are forwarded, not filtered: Chrome 153 keeps a
        // NaN matrix (the pattern then paints nothing) and only an infinite
        // translation degrades to the identity inside Skia.
        return apply(...values);
    }
}
Object.defineProperty(CanvasPattern.prototype, 'setTransform', {enumerable:true});
Object.defineProperty(CanvasPattern.prototype, Symbol.toStringTag, {value:'CanvasPattern', writable:false, enumerable:false, configurable:true});
// Chrome exposes measureText, createLinearGradient and getImageData results as
// real interfaces: no own data properties, prototype accessors, and a branded
// Symbol.toStringTag. Plain result objects are observably different.
const interfaceKey = Symbol('internal interface construction');
const metricValues = new WeakMap();
const TEXT_METRIC_NAMES = ['width','actualBoundingBoxLeft','actualBoundingBoxRight',
    'actualBoundingBoxAscent','actualBoundingBoxDescent','fontBoundingBoxAscent',
    'fontBoundingBoxDescent','hangingBaseline','alphabeticBaseline','ideographicBaseline'];
class TextMetrics {
    constructor(key, values) {
        if (key !== interfaceKey) throw new TypeError('Illegal constructor');
        metricValues.set(this, values);
    }
}
for (const name of TEXT_METRIC_NAMES) {
    Object.defineProperty(TextMetrics.prototype, name, {
        get() {
            const values = metricValues.get(this);
            if (!values) throw new TypeError('Illegal invocation');
            return values[name];
        }, enumerable: true, configurable: true
    });
}
Object.defineProperty(TextMetrics.prototype, Symbol.toStringTag, {value:'TextMetrics', configurable:true});

const gradientStops = new WeakMap();
class CanvasGradient {
    constructor() { throw new TypeError('Illegal constructor'); }
    addColorStop(offset, color) {
        const add = gradientStops.get(this);
        if (!add) throw new TypeError('Illegal invocation');
        if (arguments.length < 2) throw new TypeError('addColorStop requires two arguments');
        return add(offset, color);
    }
}
Object.defineProperty(CanvasGradient.prototype, 'addColorStop', {enumerable:true});
Object.defineProperty(CanvasGradient.prototype, Symbol.toStringTag, {value:'CanvasGradient', configurable:true});

// The native result keeps the pixels; the wrapper only supplies interface shape.
const imageDataViews = new WeakMap();
function adoptImageData(raw) {
    const view = raw.pixelFormat === 'rgba-float16'
        ? new Float16Array(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength / 2)
        : raw.data;
    const data = new ImageData(interfaceKey, raw, view);
    imageDataObjects.add(data);
    imageDataNative.set(data, raw);
    return data;
}
class ImageData {
    constructor(a, b, c, d) {
        if (a === interfaceKey) {
            imageDataViews.set(this, {width:b.width, height:b.height, data:c,
                colorSpace:b.colorSpace, pixelFormat:b.pixelFormat});
        } else {
            imageDataViews.set(this, constructImageData(arguments.length, a, b, c, d));
        }
        // Chrome materializes the [SameObject] buffer as a read-only own
        // property, so reading `data` never re-enters the accessor.
        Object.defineProperty(this, 'data', {
            value: imageDataViews.get(this).data, enumerable:true, configurable:true, writable:false
        });
    }
}
for (const name of ['width','height','data','colorSpace','pixelFormat']) {
    Object.defineProperty(ImageData.prototype, name, {
        get() {
            const state = imageDataViews.get(this);
            if (!state) throw new TypeError('Illegal invocation');
            return state[name];
        }, enumerable: true, configurable: true
    });
}
Object.defineProperty(ImageData.prototype, Symbol.toStringTag, {value:'ImageData', configurable:true});
// Web IDL constructor arity: the internal creation parameters must not leak
// into Function.prototype.length.
Object.defineProperty(ImageData, 'length', {value:2, configurable:true});
Object.defineProperty(TextMetrics, 'length', {value:0, configurable:true});

function constructImageData(count, a, b, c, d) {
    if (count < 2) throw new TypeError('2 arguments required, but only ' + count + ' present.');
    const buffered = (ArrayBuffer.isView(a) && !(a instanceof DataView)) || a instanceof Float16Array;
    const settings = imageDataSettings(buffered ? d : c);
    const colorSpace = settings.colorSpace || 'srgb';
    const pixelFormat = settings.pixelFormat || 'rgba-unorm8';
    const Storage = pixelFormat === 'rgba-float16' ? Float16Array : Uint8ClampedArray;
    if (buffered) {
        const width = (+b) >>> 0;
        if (a.length % 4 !== 0) throw new DOMException('The input data length is not a multiple of 4.','InvalidStateError');
        if (!width) throw new DOMException('The source width is zero or not a number.','IndexSizeError');
        if (a.length % (4 * width) !== 0) throw new DOMException('The input data length is not a multiple of (4 * width).','IndexSizeError');
        const height = c === undefined ? a.length / (4 * width) : (+c) >>> 0;
        if (a.length !== 4 * width * height) throw new DOMException('The input data length is not equal to (4 * width * height).','IndexSizeError');
        return {width, height, data:a, colorSpace, pixelFormat};
    }
    const width = (+a) >>> 0, height = (+b) >>> 0;
    if (!width) throw new DOMException('The source width is zero or not a number.','IndexSizeError');
    if (!height) throw new DOMException('The source height is zero or not a number.','IndexSizeError');
    return {width, height, data:new Storage(width * height * 4), colorSpace, pixelFormat};
}

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
// DOMMatrix2DInit: the a/b/c/d/e/f members and their m11/m12/m21/m22/m41/m42
// aliases must agree. Used by CanvasPattern.setTransform, ctx.setTransform and
// Path2D.addPath.
function matrixDictionary(matrix) {
    if (matrix != null && !isObject(matrix)) throw new TypeError('Expected a matrix dictionary');
    const fields = Object.create(null);
    for (const key of ['a','b','c','d','e','f','m11','m12','m21','m22','m41','m42']) {
        const value = matrix?.[key];
        fields[key] = value === undefined ? undefined : +value;
    }
    return [['a','m11',1],['b','m12',0],['c','m21',0],['d','m22',1],['e','m41',0],['f','m42',0]]
        .map(([key, alias, fallback]) => {
            const first = fields[key], second = fields[alias];
            if (first !== undefined && second !== undefined && first !== second &&
                !(Number.isNaN(first) && Number.isNaN(second))) {
                throw new TypeError('Conflicting matrix dictionary aliases');
            }
            return first === undefined ? (second === undefined ? fallback : second) : first;
        });
}

// Path2D coordinates go straight to a native SkPath; Blink clamps each one to
// float and drops a command whose points overflow.
const pathHandles = new WeakMap();
const isPath2D = value => pathHandles.has(value);
function pathRadii(radii) {
    const convertPoint = v => {
        if (isObject(v)) { let x = v.x, y = v.y; return {x: x === undefined ? 0 : +x, y: y === undefined ? 0 : +y}; }
        const n = +v; return {x: n, y: n};
    };
    const iterator = isObject(radii) ? radii[Symbol.iterator] : undefined;
    if (iterator != null && typeof iterator !== 'function') throw new TypeError('Invalid radii iterator');
    const points = iterator == null ? [convertPoint(radii)] : convertSequence(radii, iterator, convertPoint);
    if (points.length < 1 || points.length > 4) throw new RangeError('Expected one to four radii');
    for (const point of points) {
        point.x = Math.fround(point.x); point.y = Math.fround(point.y);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        if (point.x < 0 || point.y < 0) throw new RangeError('Negative radius');
    }
    return points;
}
const PATH_ARITIES = {moveTo:2, lineTo:2, quadraticCurveTo:4, bezierCurveTo:6, arcTo:5, arc:5, ellipse:7, rect:4};
class Path2D {
    constructor(source) {
        const handle = source !== undefined && source !== null && isPath2D(source)
            ? new native.Path2D(pathHandles.get(source))
            : new native.Path2D();
        pathHandles.set(this, handle);
        if (source !== undefined && source !== null && !isPath2D(source)) handle._fromSVG(domString(source));
    }
    closePath() { pathNative(this).closePath(); }
    roundRect(x, y, w, h, radii = 0) {
        if (arguments.length < 4) throw new TypeError('roundRect requires four coordinates');
        const handle = pathNative(this);
        const coords = [+x, +y, +w, +h].map(Math.fround);
        const points = pathRadii(radii);
        if (!points || !coords.every(Number.isFinite)) return;
        return handle.roundRect(...coords, points);
    }
    addPath(path, transform) {
        if (arguments.length < 1) throw new TypeError('addPath requires a Path2D');
        const handle = pathNative(this);
        if (!isPath2D(path)) throw new TypeError('Expected a Path2D');
        return handle.addPath(pathHandles.get(path), ...matrixDictionary(transform));
    }
}
function pathNative(path) {
    const handle = pathHandles.get(path);
    if (!handle) throw new TypeError('Illegal invocation');
    return handle;
}
for (const [name, count] of Object.entries(PATH_ARITIES)) {
    Object.defineProperty(Path2D.prototype, name, {
        value: function (...args) {
            const handle = pathNative(this);
            if (args.length < count) throw new TypeError(`${name} requires ${count} arguments`);
            for (let i = 0; i < count; i++) args[i] = +args[i];
            const used = args.slice(0, count);
            if (!used.every(Number.isFinite)) return;
            if (name !== 'rect' && !used.every(value => Number.isFinite(Math.fround(value)))) return;
            return handle[name](...args);
        }, writable: true, enumerable: true, configurable: true
    });
}
for (const name of ['closePath', 'roundRect', 'addPath']) {
    Object.defineProperty(Path2D.prototype, name, {enumerable: true});
}
Object.defineProperty(Path2D.prototype, Symbol.toStringTag, {value: 'Path2D', configurable: true});
Object.defineProperty(Path2D, 'length', {value: 0, configurable: true});
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


function offscreenDimension(value) {
    const n = +value;
    if (!Number.isFinite(n) || Math.trunc(n) < 0) {
        throw new TypeError('Canvas dimension is outside the unsigned integer range');
    }
    if (Math.trunc(n) > 0xffffffff) throw new TypeError("Value is outside the 'unsigned long' value range");
    return Math.trunc(n) || 0;
}

// Convert iterable and dictionary Web IDL arguments in JavaScript, then pass
// normalized numeric data to the native drawing/state implementation.
function adaptContextArguments(context, ContextType = OffscreenCanvasRenderingContext2D) {
    contexts.add(context);
    contextBrands.set(context,ContextType);
    const attributes = context.getContextAttributes();
    contextInternals.set(context, {
        opaque: attributes.alpha === false,
        colorSpace: attributes.colorSpace,
        pixelFormat: attributes.colorType === 'float16' ? 'rgba-float16' : 'rgba-unorm8',
        read: context.getImageData.bind(context),
        resize: context._resize.bind(context),
        clear: context._clearBitmap.bind(context),
        ensureBitmap: context._ensureBitmap.bind(context),
        fillPath: context._fillPath.bind(context),
        strokePath: context._strokePath.bind(context),
        clipPath: context._clipPath.bind(context),
        pointInPath: context._pointInPath.bind(context)
    });
    // Native methods and accessors dispatch on their receiver, so the wrappers
    // harvested from the first context of a host serve every later one.
    if (!adaptedContextTypes.has(ContextType)) {
        adaptedContextTypes.add(ContextType);
        installContextInterface(context, ContextType);
    }
    // Chrome's rendering contexts own no properties at all; the whole interface
    // lives on the prototype. Drop the per-instance natives now that the
    // internals above hold the bindings they need.
    for (const name of Object.getOwnPropertyNames(context)) {
        if (Object.getOwnPropertyDescriptor(context, name).configurable) delete context[name];
    }
}

function installContextInterface(context, ContextType) {
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
            // CanvasPath checks finiteness again after conversion to float.
            // Reject overflowing points before they can poison the retained path.
            if(['rect','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arcTo','arc','ellipse'].includes(name)
                && !args.slice(0,count).every(value=>Number.isFinite(Math.fround(value))))return;
            return method.apply(this,args);
        };
    }
    for(const name of ['fillText','strokeText','measureText']) {
        const method=context[name],count=name==='measureText'?1:3;
        context[name]=function(...args){
            if(args.length<count)throw new TypeError(`${name} requires ${count} arguments`);
            args[0]=domString(args[0]).replace(/[\t\n\v\f\r]/g,' ');
            if(count===3){args[1]=+args[1];args[2]=+args[2];if(args[3]!==undefined)args[3]=+args[3];}
            const result=method.apply(this,args);
            return name==='measureText'?new TextMetrics(interfaceKey,result):result;
        };
    }
    for(const name of ['createLinearGradient','createRadialGradient','createConicGradient']) {
        const method=context[name];
        context[name]=function(...args){
            const gradient=method.apply(this,args);
            if(gradient){
                gradientStops.set(gradient,gradient.addColorStop.bind(gradient));
                delete gradient.addColorStop;
                Object.setPrototypeOf(gradient,CanvasGradient.prototype);
            }
            return gradient;
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
        args[0] = {width:source.width, height:source.height, data:source.data, colorSpace:source.colorSpace || 'srgb', pixelFormat:source.pixelFormat || 'rgba-unorm8', opaque:source.opaque === true,
            shadowOpaque:source.opaque === true && !imageBitmaps.has(args[0])};
        return drawImage.apply(this,args.slice(0,count));
    };
    const createPattern=context.createPattern;
    context.createPattern=function(source,repetition){
        if(arguments.length<2)throw new TypeError('createPattern requires two arguments');
        if(!imageSources.has(source))throw new TypeError('Expected a Canvas image source');
        repetition=repetition===null?'':domString(repetition);
        if(!['','repeat','repeat-x','repeat-y','no-repeat'].includes(repetition))throw new DOMException('Invalid repetition','SyntaxError');
        const state = checkImageSource(source);
        const pattern=createPattern.call(this,{width:state.width,height:state.height,data:state.data,colorSpace:state.colorSpace || 'srgb',pixelFormat:state.pixelFormat || 'rgba-unorm8',opaque:state.opaque===true},repetition||'repeat');
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
            const raw=method.apply(this,args);
            if(!raw)return raw;
            return adoptImageData(raw);
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
        args[0]=imageDataNative.get(args[0]);
        return putImageData.apply(this,args);
    };
    for(const name of ['fill','clip','isPointInPath','isPointInStroke']) {
        const method=context[name],hit=name.startsWith('isPoint');
        const readRule=value=>{
            const rule=value===undefined?'nonzero':domString(value);
            if(!['nonzero','evenodd'].includes(rule))throw new TypeError('Invalid fill rule');
            return rule;
        };
        context[name]=function(...args){
            // The Path2D overload shifts every remaining argument by one.
            if(isPath2D(args[0])){
                const handle=pathHandles.get(args[0]);
                const internal=contextInternals.get(this);
                if(hit){
                    if(args.length<3)throw new TypeError('Expected point coordinates');
                    const x=+args[1],y=+args[2];
                    const evenodd=name==='isPointInPath'&&readRule(args[3])==='evenodd';
                    return internal.pointInPath(handle,x,y,name==='isPointInStroke',evenodd);
                }
                const evenodd=readRule(args[1])==='evenodd';
                return name==='fill'?internal.fillPath(handle,evenodd):internal.clipPath(handle,evenodd);
            }
            if(hit){if(args.length<2)throw new TypeError('Expected point coordinates');args[0]=+args[0];args[1]=+args[1];}
            if(name!=='isPointInStroke'){
                const ruleIndex=hit?2:0;
                args[ruleIndex]=readRule(args[ruleIndex]);
            }
            return method.apply(this,args);
        };
    }
    const nativeMatrix=context.getTransform;
    context.getTransform=function(){
        const m=nativeMatrix.call(this);
        return createMatrix(m.a,m.b,m.c,m.d,m.e,m.f);
    };
    const roundRect=context.roundRect;
    const contextMatrix=nativeMatrix;
    context.roundRect=function(x,y,w,h,radii=0){
        if(arguments.length<4)throw new TypeError('roundRect requires four coordinates');
        const coords=[+x,+y,+w,+h].map(Math.fround);
        const convertPoint=v=>{
            if(isObject(v)){let x=v.x;x=x===undefined?0:+x;let y=v.y;y=y===undefined?0:+y;return {x,y};}
            const n=+v;return {x:n,y:n};
        };
        const iterator=isObject(radii)?radii[Symbol.iterator]:undefined;
        if(iterator!=null&&typeof iterator!=='function')throw new TypeError('Invalid radii iterator');
        const points=iterator==null?[convertPoint(radii)]:convertSequence(radii,iterator,convertPoint);
        if(points.length<1||points.length>4)throw new RangeError('Expected one to four radii');
        const matrix=contextMatrix.call(this);
        if(matrix.a*matrix.d-matrix.b*matrix.c===0||!coords.every(Number.isFinite))return;
        for(const p of points){
            p.x=Math.fround(p.x);p.y=Math.fround(p.y);
            if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
            if(p.x<0||p.y<0)throw new RangeError('Negative radius');
        }
        return roundRect.call(this,...coords,points);
    };
    const stroke=context.stroke;
    context.stroke=function(...args){
        if(!args.length)return stroke.call(this);
        if(!isPath2D(args[0]))throw new TypeError('Expected Path2D');
        return contextInternals.get(this).strokePath(pathHandles.get(args[0]));
    };
    // Validate the receiver before argument conversion, including no-op calls.
    for(const name of Object.keys(context)){
        if(typeof context[name]!=='function')continue;
        const method=context[name];
        context[name]=function(...args){if(contextBrands.get(this)!==ContextType)throw new TypeError('Illegal invocation');return method.apply(this,args);};
        if(!name.startsWith('_')&&!Object.hasOwn(ContextType.prototype,name))
            Object.defineProperty(ContextType.prototype,name,{value:context[name],writable:true,enumerable:true,configurable:true});
    }
    // Each interface exposes its own native accessors with its own receiver tag.
    for(const name of Object.getOwnPropertyNames(context)) {
        const descriptor=Object.getOwnPropertyDescriptor(context,name);
        if(descriptor.get&&!Object.hasOwn(ContextType.prototype,name))
            Object.defineProperty(ContextType.prototype,name,{get:descriptor.get,set:descriptor.set,enumerable:true,configurable:true});
    }
}

const imageBitmaps = new WeakSet();
const bitmapCreationKey = Symbol('ImageBitmap internal creation');
function requireImageBitmap(value) {
    if(!imageBitmaps.has(value))throw new TypeError('Illegal invocation');
}
class ImageBitmap {
    static {
        Object.defineProperty(this.prototype, Symbol.toStringTag, {value:'ImageBitmap', configurable:true});
        Object.defineProperty(this, 'length', {value:0, configurable:true});
    }
    #width; #height; #pixels; #opaque;
    constructor(key, width, height, pixels, opaque=false, colorSpace='srgb', pixelFormat='rgba-unorm8') {
        if(key!==bitmapCreationKey)throw new TypeError('Illegal constructor');
        imageBitmaps.add(this);
        imageSources.add(this);
        const owner = this;
        imageSourceState.set(this, {
            colorSpace, pixelFormat,
            get width() { return owner.#width; },
            get height() { return owner.#height; },
            get data() { return owner.#readPixels(); },
            get opaque() { return owner.#opaque; }
        });
        this.#width = width;
        this.#height = height;
        this.#pixels = new Uint8ClampedArray(pixels);
        this.#opaque = opaque;
    }
    get width() { requireImageBitmap(this); return this.#width; }
    get height() { requireImageBitmap(this); return this.#height; }
    #readPixels() { return this.#pixels; }
    [canvasPixels]() { return this.#readPixels(); }
    close() { requireImageBitmap(this); this.#width = 0; this.#height = 0; this.#pixels = new Uint8ClampedArray(0); }
}

// ImageBitmapRenderingContext: the canvas displays one transferred bitmap and
// owns no drawing state of its own.
const bitmapRendererState = new WeakMap();
const detachImageBitmap = ImageBitmap.prototype.close;
class ImageBitmapRenderingContext {
    constructor(key) {
        if (key !== bitmapCreationKey) throw new TypeError('Illegal constructor');
    }
    transferFromImageBitmap(bitmap) {
        const state = bitmapRendererState.get(this);
        if (!state) throw new TypeError('Illegal invocation');
        if (arguments.length < 1) throw new TypeError('1 argument required, but only 0 present.');
        if (bitmap === null) { state.frame = null; return; }
        if (!imageBitmaps.has(bitmap)) throw new TypeError('Expected an ImageBitmap');
        const source = imageSourceState.get(bitmap);
        const width = source.width, height = source.height;
        // The transfer takes the pixels and neuters the source bitmap.
        const frame = width && height ? {
            width, height, data: new Uint8ClampedArray(source.data),
            colorSpace: source.colorSpace, pixelFormat: source.pixelFormat, opaque: source.opaque === true
        } : null;
        detachImageBitmap.call(bitmap);
        // The canvas keeps its own width and height; only the presented bitmap
        // changes, which is what Chrome reports after a transfer.
        state.frame = frame;
    }
}
Object.defineProperty(ImageBitmapRenderingContext.prototype, 'transferFromImageBitmap', {enumerable: true});
Object.defineProperty(ImageBitmapRenderingContext.prototype, 'canvas', {
    get() {
        if (!bitmapRendererState.has(this)) throw new TypeError('Illegal invocation');
        return contextCanvases.get(this);
    }, enumerable: true, configurable: true
});
Object.defineProperty(ImageBitmapRenderingContext.prototype, Symbol.toStringTag,
    {value: 'ImageBitmapRenderingContext', configurable: true});
Object.defineProperty(ImageBitmapRenderingContext, 'length', {value: 0, configurable: true});

function createBitmapRenderer(canvas) {
    const context = new ImageBitmapRenderingContext(bitmapCreationKey);
    bitmapRendererState.set(context, {frame: null});
    contextCanvases.set(context, canvas);
    return context;
}
// A bitmaprenderer canvas presents its transferred bitmap stretched to the
// canvas dimensions; without one it is transparent black.
function bitmapRendererPixels(context, width, height, preserveFormat) {
    const frame = bitmapRendererState.get(context)?.frame;
    if (!frame) return new Uint8ClampedArray(width * height * 4);
    const scratch = new OffscreenCanvas(width, height);
    const target = scratch.getContext('2d');
    const bitmap = new ImageBitmap(bitmapCreationKey, frame.width, frame.height, frame.data,
        frame.opaque, frame.colorSpace, frame.pixelFormat);
    target.drawImage(bitmap, 0, 0, width, height);
    return scratch[canvasPixels](preserveFormat);
}
function bitmapRendererFrame(context) { return bitmapRendererState.get(context)?.frame ?? null; }

class OffscreenCanvas {
    static { Object.defineProperty(this.prototype, Symbol.toStringTag, {value:'OffscreenCanvas', configurable:true}); }
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
            get data() { return owner.#readPixels(true); },
            get colorSpace() { return contextInternals.get(owner.#contexts.get('2d'))?.colorSpace || 'srgb'; },
            get pixelFormat() { return contextInternals.get(owner.#contexts.get('2d'))?.pixelFormat || 'rgba-unorm8'; },
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

    [canvasPixels](preserveFormat = false) { return this.#readPixels(preserveFormat); }

    #readPixels(preserveFormat = false) {
        if (!this.#width || !this.#height) return new Uint8ClampedArray(0);
        const renderer = this.#contexts.get('bitmaprenderer');
        if (renderer) return bitmapRendererPixels(renderer, this.#width, this.#height, preserveFormat);
        const context = this.#contexts.get("2d");
        if (!context) return new Uint8ClampedArray(this.#width * this.#height * 4);
        const internal=contextInternals.get(context);
        const settings=preserveFormat ? {colorSpace:internal.colorSpace,pixelFormat:internal.pixelFormat} : {colorSpace:'srgb',pixelFormat:'rgba-unorm8'};
        return internal.read(0, 0, this.#width, this.#height, settings).data;
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
            if (kind === '2d' && context) contextCanvases.set(context, this);
            else if (context) Object.defineProperty(context, 'canvas', { value: this, enumerable: true });
            if (context) this.#contexts.set(kind, context);
            return context;
        }
        const renderer = createBitmapRenderer(this);
        this.#contexts.set(kind, renderer);
        return renderer;
    }

    transferToImageBitmap() {
        requireOffscreenCanvas(this);
        const renderer = this.#contexts.get('bitmaprenderer');
        if (renderer) {
            if (!this.#width || !this.#height) throw new DOMException('Canvas has no transferable image', 'UnknownError');
            const frame = bitmapRendererFrame(renderer);
            if (!frame) throw new DOMException('Canvas has no transferable image', 'UnknownError');
            const bitmap = new ImageBitmap(bitmapCreationKey, frame.width, frame.height,
                frame.data, frame.opaque, frame.colorSpace, frame.pixelFormat);
            bitmapRendererState.get(renderer).frame = null;
            return bitmap;
        }
        const context = this.#contexts.get("2d");
        if (!context) throw new DOMException('Canvas has no rendering context', 'InvalidStateError');
        if (!this.#width || !this.#height) throw new DOMException('Canvas has no transferable image', 'UnknownError');
        const internal=contextInternals.get(context);
        if(!internal.ensureBitmap())throw new DOMException('Canvas has no transferable image','UnknownError');
        const bitmap = new ImageBitmap(bitmapCreationKey, this.#width, this.#height, this.#readPixels(true), internal.opaque, internal.colorSpace, internal.pixelFormat);
        contextInternals.get(context).clear();
        return bitmap;
    }

    async convertToBlob(options = {}) {
        requireOffscreenCanvas(this);
        if(options!=null&&!isObject(options))throw new TypeError('Expected ImageEncodeOptions dictionary');
        // Web IDL reads dictionary members alphabetically, before canvas state.
        // Each dictionary member is read and converted exactly once, in the
        // alphabetical order Web IDL requires.
        const quality=options?.quality;
        const requestedQuality=quality===undefined?NaN:+quality; // unrestricted double
        const type=options?.type;
        const requestedType=type===undefined?undefined:domString(type);
        const context=this.#contexts.get('2d');
        const available=context ? contextInternals.get(context).ensureBitmap() : false;
        const renderer=this.#contexts.get('bitmaprenderer');
        if (!this.#width || !this.#height || this.#width>65535 || this.#height>65535 || this.#width*this.#height>268435456)
            throw new DOMException('Canvas has invalid size', 'IndexSizeError');
        if(!this.#contexts.size)throw new DOMException('Canvas has no rendering context','InvalidStateError');
        if(context && !available)throw new DOMException('Canvas image is unavailable','NotReadableError');
        if(renderer && !bitmapRendererFrame(renderer))throw new DOMException('Canvas image is unavailable','NotReadableError');
        let pixels = this.#readPixels();
        const format = encodedImageType(requestedType);
        // Chrome crops the encoder input at the format's dimension limit,
        // preserving the top-left pixels (not scaling the source image).
        const limit = format === 'image/webp' ? 16383 : format === 'image/jpeg' ? 65500 : 65535;
        const width = Math.min(this.#width, limit), height = Math.min(this.#height, limit);
        if (width !== this.#width) {
            const cropped = new Uint8Array(width * height * 4);
            for (let y = 0; y < height; y++) {
                const start = y * this.#width * 4;
                cropped.set(pixels.subarray(start, start + width * 4), y * width * 4);
            }
            pixels = cropped;
        }
        const encoded = native.encodeImage(pixels, width, height, format, requestedQuality);
        if (encoded) return new Blob([encoded], {type: format});
        throw new DOMException('Encoding of the source image has failed.', 'EncodingError');
    }
}

// A DOM canvas owns a native DOM context. OffscreenCanvas is created only by
// transferControlToOffscreen, which changes the host to placeholder mode.
function htmlCanvasDimension(value, fallback) {
    const converted=(+value)>>>0;
    return converted>0x7fffffff?fallback:converted;
}
class HTMLCanvasElement {
    #width; #height; #native; #contexts = new Map(); #offscreen = null;
    constructor(width = 300, height = 150) {
        this.#width=htmlCanvasDimension(width,300);
        this.#height=htmlCanvasDimension(height,150);
        this.#native=new native.HTMLCanvasElement(this.#width,this.#height);
        imageSources.add(this);
        const owner=this;
        imageSourceState.set(this,{
            get width(){return owner.#width;},get height(){return owner.#height;},
            get data(){return owner.#readPixels(true);},
            get colorSpace(){return contextInternals.get(owner.#contexts.get('2d'))?.colorSpace||'srgb';},
            get pixelFormat(){return contextInternals.get(owner.#contexts.get('2d'))?.pixelFormat||'rgba-unorm8';},
            get opaque(){return contextInternals.get(owner.#contexts.get('2d'))?.opaque===true;}
        });
    }
    get width(){return this.#width;}
    set width(value){this.#resize(htmlCanvasDimension(value,300),this.#height);}
    get height(){return this.#height;}
    set height(value){this.#resize(this.#width,htmlCanvasDimension(value,150));}
    #resize(width,height) {
        if(this.#offscreen)throw new DOMException('Canvas is controlled by OffscreenCanvas','InvalidStateError');
        const context=this.#contexts.get('2d');
        if(context)contextInternals.get(context).resize(width,height);
        this.#width=width;this.#height=height;
        this.#native.width=width;this.#native.height=height;
    }
    transferControlToOffscreen() {
        if(this.#offscreen||this.#contexts.size)throw new DOMException('Canvas already has a context or was transferred','InvalidStateError');
        this.#offscreen=new OffscreenCanvas(this.#width,this.#height);
        return this.#offscreen;
    }
    getContext(type, attributes) {
        if(arguments.length===0)throw new TypeError('getContext requires a context id');
        const name=domString(type);
        if(this.#offscreen)throw new DOMException('Canvas is controlled by OffscreenCanvas','InvalidStateError');
        const kind=name==='experimental-webgl'?'webgl':name;
        if(!['2d','webgl','webgl2','bitmaprenderer'].includes(kind))return null;
        attributes=contextOptions(attributes);
        if(this.#contexts.has(kind))return this.#contexts.get(kind);
        if(this.#contexts.size)return null;
        if(kind==='bitmaprenderer') {
            const renderer=createBitmapRenderer(this);
            this.#contexts.set(kind,renderer);
            return renderer;
        }
        const context=this.#native.getContext(kind,attributes);
        if(context) {
            if(kind==='2d') {
                Object.setPrototypeOf(context,CanvasRenderingContext2D.prototype);
                adaptContextArguments(context,CanvasRenderingContext2D);
                contextCanvases.set(context,this);
            } else Object.defineProperty(context,'canvas',{value:this,enumerable:true});
            this.#contexts.set(kind,context);
        }
        return context;
    }
    #readPixels(preserveFormat=false) {
        if(!this.#width||!this.#height)return new Uint8ClampedArray(0);
        if(this.#offscreen)return this.#offscreen[canvasPixels]();
        const renderer=this.#contexts.get('bitmaprenderer');
        if(renderer)return bitmapRendererPixels(renderer,this.#width,this.#height,preserveFormat);
        const context=this.#contexts.get('2d');
        if(!context)return new Uint8ClampedArray(this.#width*this.#height*4);
        const internal=contextInternals.get(context);
        return internal.read(0,0,this.#width,this.#height,preserveFormat?
            {colorSpace:internal.colorSpace,pixelFormat:internal.pixelFormat}:
            {colorSpace:'srgb',pixelFormat:'rgba-unorm8'}).data;
    }
    [canvasPixels](preserveFormat=false){return this.#readPixels(preserveFormat);}
}
// Event handler IDL attributes: per instance, null until set to a callable,
// and null again for any non-callable assignment.
const offscreenEventHandlers = new WeakMap();
for (const name of ['oncontextlost', 'oncontextrestored']) {
    Object.defineProperty(OffscreenCanvas.prototype, name, {
        get() {
            requireOffscreenCanvas(this);
            const handler = offscreenEventHandlers.get(this)?.[name];
            return typeof handler === 'function' ? handler : null;
        },
        set(value) {
            requireOffscreenCanvas(this);
            let handlers = offscreenEventHandlers.get(this);
            if (!handlers) offscreenEventHandlers.set(this, handlers = Object.create(null));
            handlers[name] = value;
        },
        enumerable: true, configurable: true
    });
}
Object.defineProperty(HTMLCanvasElement.prototype,Symbol.toStringTag,{value:'HTMLCanvasElement',configurable:true});

// convertToBlob(): an unsupported or absent type falls back to PNG, and the
// requested type is matched case-insensitively.
const ENCODED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
function encodedImageType(text) {
    if (text === undefined) return 'image/png';
    const lowered = text.toLowerCase();
    return ENCODED_TYPES.includes(lowered) ? lowered : 'image/png';
}

// createImageBitmap(): crop and resize run through drawImage so the sampling
// matches every other image path in this implementation.
function bitmapOptions(value) {
    if (value != null && !isObject(value)) throw new TypeError('Expected an ImageBitmapOptions dictionary');
    const result = Object.create(null);
    for (const [key, allowed] of [
        ['imageOrientation', ['from-image', 'flipY', 'none']],
        ['premultiplyAlpha', ['none', 'premultiply', 'default']],
        ['colorSpaceConversion', ['none', 'default']],
        ['resizeQuality', ['pixelated', 'low', 'medium', 'high']],
    ]) {
        const member = value?.[key];
        if (member !== undefined) result[key] = enumValue(member, allowed);
    }
    for (const key of ['resizeWidth', 'resizeHeight']) {
        const member = value?.[key];
        if (member !== undefined) {
            const n = Math.trunc(+member);
            if (!Number.isFinite(n) || n < 0) throw new TypeError(`${key} is outside the unsigned long range`);
            result[key] = n;
        }
    }
    return result;
}

let createImageBitmap = async function createImageBitmap(source, ...rest) {
    if (arguments.length < 1) throw new TypeError('1 argument required, but only 0 present.');
    const cropped = rest.length >= 4;
    const options = bitmapOptions(cropped ? rest[4] : rest[0]);
    let holder = source, release = null;
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        const bytes = new Uint8Array(await source.arrayBuffer());
        const decoded = bytes.length ? native.decodeImage(bytes) : undefined;
        if (!decoded) throw new DOMException('The source image could not be decoded', 'InvalidStateError');
        holder = new ImageBitmap(bitmapCreationKey, decoded.width, decoded.height, decoded.data);
        release = holder;
    } else if (imageDataObjects.has(source)) {
        const raw = imageDataNative.get(source);
        if (raw.pixelFormat === 'rgba-float16') {
            throw new DOMException('Float16 ImageData is not a bitmap source', 'InvalidStateError');
        }
        holder = new ImageBitmap(bitmapCreationKey, raw.width, raw.height, raw.data, false,
            raw.colorSpace, raw.pixelFormat);
        release = holder;
    } else if (!imageSources.has(source)) {
        throw new TypeError('Expected a Canvas image source');
    }
    const state = checkImageSource(holder);
    const sx = cropped ? signedLong(rest[0]) : 0;
    const sy = cropped ? signedLong(rest[1]) : 0;
    let sw = cropped ? signedLong(rest[2]) : state.width;
    let sh = cropped ? signedLong(rest[3]) : state.height;
    let left = sx, top = sy;
    if (sw < 0) { left += sw; sw = -sw; }
    if (sh < 0) { top += sh; sh = -sh; }
    if (!sw || !sh) throw new RangeError('The crop rectangle is empty');
    const width = options.resizeWidth ?? (options.resizeHeight === undefined ? sw
        : Math.max(1, Math.round(sw * options.resizeHeight / sh)));
    const height = options.resizeHeight ?? (options.resizeWidth === undefined ? sh
        : Math.max(1, Math.round(sh * options.resizeWidth / sw)));
    if (!width || !height) throw new DOMException('The resized bitmap is empty', 'InvalidStateError');
    const output = new OffscreenCanvas(width, height);
    const context = output.getContext('2d');
    context.imageSmoothingEnabled = options.resizeQuality !== 'pixelated';
    if (options.resizeQuality === 'medium' || options.resizeQuality === 'high') {
        context.imageSmoothingQuality = options.resizeQuality;
    }
    const scaleX = width / sw, scaleY = height / sh;
    if (options.imageOrientation === 'flipY') context.setTransform(1, 0, 0, -1, 0, height);
    context.drawImage(holder, -left * scaleX, -top * scaleY, state.width * scaleX, state.height * scaleY);
    const bitmap = output.transferToImageBitmap();
    if (release) detachImageBitmap.call(release);
    return bitmap;
};

function installWebGLGlobals(target = globalThis) {
    native.installWebGLGlobals(target);
    for (const name of ['CanvasPattern', 'CanvasGradient', 'Path2D', 'ImageBitmapRenderingContext',
        'createImageBitmap', 'DOMMatrix', 'DOMMatrixReadOnly', 'DOMPoint', 'DOMPointReadOnly',
        'TextMetrics', 'ImageData', 'ImageBitmap', 'OffscreenCanvas',
        'OffscreenCanvasRenderingContext2D', 'CanvasRenderingContext2D', 'HTMLCanvasElement']) {
        target[name] = hardened[name];
    }
    if (!target.document) {
        target.document = {
            createElement: function (name) {
                if (String(name).toLowerCase() === "canvas") return new hardened.HTMLCanvasElement();
                return {nodeName: String(name).toUpperCase()};
            }
        };
    }
    return target;
}

// Install both interfaces before the first user context exists. Zero-sized
// native hosts supply the method/accessor tables without allocating a bitmap.
for(const [Host,Type] of [[native.HTMLCanvasElement,CanvasRenderingContext2D],[native.OffscreenCanvas,OffscreenCanvasRenderingContext2D]]) {
    adaptContextArguments(new Host(0,0).getContext('2d'),Type);
    Object.defineProperty(Type.prototype,'canvas',{
        get(){
            if(contextBrands.get(this)!==Type)throw new TypeError('Illegal invocation');
            return contextCanvases.get(this);
        },enumerable:true,configurable:true
    });
}

// ---------------------------------------------------------------------------
// Browser built-ins are native functions: fillRect.toString() is
// "function fillRect() { [native code] }", name is "fillRect" and length is the
// Web IDL arity. native.nativeFunction builds a real Node-API function that
// forwards to the JavaScript implementation, so none of this depends on a
// Function.prototype.toString hook. Every arity below was read from Chrome 153.

const CONTEXT_ARITY = {arc:5, arcTo:5, beginPath:0, bezierCurveTo:6, clearRect:4, clip:0,
    closePath:0, createConicGradient:3, createImageData:1, createLinearGradient:4,
    createPattern:2, createRadialGradient:6, drawImage:3, ellipse:7, fill:0, fillRect:4,
    fillText:3, getContextAttributes:0, getImageData:4, getLineDash:0, getTransform:0,
    isContextLost:0, isPointInPath:2, isPointInStroke:2, lineTo:2, measureText:1, moveTo:2,
    putImageData:3, quadraticCurveTo:4, rect:4, reset:0, resetTransform:0, restore:0,
    rotate:1, roundRect:4, save:0, scale:2, setLineDash:1, setTransform:0, stroke:0,
    strokeRect:4, strokeText:3, transform:6, translate:2};
const INTERFACE_ARITY = {
    OffscreenCanvas: {convertToBlob:0, getContext:1, transferToImageBitmap:0},
    HTMLCanvasElement: {getContext:1, transferControlToOffscreen:0},
    Path2D: {addPath:1, arc:5, arcTo:5, bezierCurveTo:6, closePath:0, ellipse:7, lineTo:2,
        moveTo:2, quadraticCurveTo:4, rect:4, roundRect:4},
    DOMMatrix: {setMatrixValue:1},
    DOMMatrixReadOnly: {},
    DOMPointReadOnly: {},
    ImageBitmapRenderingContext: {transferFromImageBitmap:1},
    CanvasGradient: {addColorStop:2},
};
const STATIC_ARITY = {fromFloat32Array:1, fromFloat64Array:1, fromMatrix:0, fromPoint:0};
const CONSTRUCTOR_ARITY = {OffscreenCanvas:2, ImageData:2, HTMLCanvasElement:0};
const FUNCTION_OWN_KEYS = ['length', 'name', 'prototype', 'arguments', 'caller'];

const nativeCallable = (target, name, length, construct = false) =>
    native.nativeFunction(target, name, length, construct);

function hardenPrototype(prototype, arity = {}) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
        if (key === 'constructor') continue;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (!descriptor.configurable) continue;
        if (typeof descriptor.value === 'function') {
            descriptor.value = nativeCallable(descriptor.value, key, arity[key] ?? 0);
        } else if (descriptor.get || descriptor.set) {
            if (descriptor.get) descriptor.get = nativeCallable(descriptor.get, 'get ' + key, 0);
            if (descriptor.set) descriptor.set = nativeCallable(descriptor.set, 'set ' + key, 1);
        } else continue;
        Object.defineProperty(prototype, key, descriptor);
    }
}

function hardenConstructor(Interface, name) {
    const Wrapper = nativeCallable(Interface, name, CONSTRUCTOR_ARITY[name] ?? 0, true);
    // A Node-API function starts with a writable prototype; browsers expose it
    // as a read-only, non-configurable own property.
    Wrapper.prototype = Interface.prototype;
    Object.defineProperty(Wrapper, 'prototype', {writable: false});
    Object.defineProperty(Interface.prototype, 'constructor',
        {value: Wrapper, writable: true, enumerable: false, configurable: true});
    for (const key of Object.getOwnPropertyNames(Interface)) {
        if (FUNCTION_OWN_KEYS.includes(key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(Interface, key);
        if (typeof descriptor.value === 'function') {
            descriptor.value = nativeCallable(descriptor.value, key, STATIC_ARITY[key] ?? 0);
        }
        Object.defineProperty(Wrapper, key, descriptor);
    }
    return Wrapper;
}

for (const Type of [CanvasRenderingContext2D, OffscreenCanvasRenderingContext2D]) {
    hardenPrototype(Type.prototype, CONTEXT_ARITY);
}
hardenPrototype(OffscreenCanvas.prototype, INTERFACE_ARITY.OffscreenCanvas);
hardenPrototype(HTMLCanvasElement.prototype, INTERFACE_ARITY.HTMLCanvasElement);
hardenPrototype(Path2D.prototype, INTERFACE_ARITY.Path2D);
hardenPrototype(DOMMatrix.prototype, INTERFACE_ARITY.DOMMatrix);
hardenPrototype(DOMMatrixReadOnly.prototype);
hardenPrototype(DOMPoint.prototype);
hardenPrototype(DOMPointReadOnly.prototype);
hardenPrototype(ImageData.prototype);
hardenPrototype(ImageBitmap.prototype);
hardenPrototype(CanvasPattern.prototype);
hardenPrototype(CanvasGradient.prototype, INTERFACE_ARITY.CanvasGradient);
hardenPrototype(TextMetrics.prototype);
hardenPrototype(ImageBitmapRenderingContext.prototype, INTERFACE_ARITY.ImageBitmapRenderingContext);

const hardened = {
    OffscreenCanvas: hardenConstructor(OffscreenCanvas, 'OffscreenCanvas'),
    HTMLCanvasElement: hardenConstructor(HTMLCanvasElement, 'HTMLCanvasElement'),
    Path2D: hardenConstructor(Path2D, 'Path2D'),
    DOMMatrixReadOnly: hardenConstructor(DOMMatrixReadOnly, 'DOMMatrixReadOnly'),
    DOMMatrix: hardenConstructor(DOMMatrix, 'DOMMatrix'),
    DOMPointReadOnly: hardenConstructor(DOMPointReadOnly, 'DOMPointReadOnly'),
    DOMPoint: hardenConstructor(DOMPoint, 'DOMPoint'),
    ImageData: hardenConstructor(ImageData, 'ImageData'),
    ImageBitmap: hardenConstructor(ImageBitmap, 'ImageBitmap'),
    CanvasPattern: hardenConstructor(CanvasPattern, 'CanvasPattern'),
    CanvasGradient: hardenConstructor(CanvasGradient, 'CanvasGradient'),
    TextMetrics: hardenConstructor(TextMetrics, 'TextMetrics'),
    ImageBitmapRenderingContext: hardenConstructor(ImageBitmapRenderingContext, 'ImageBitmapRenderingContext'),
    OffscreenCanvasRenderingContext2D,
    CanvasRenderingContext2D,
    createImageBitmap: nativeCallable(createImageBitmap, 'createImageBitmap', 1),
};
// Static inheritance mirrors the interface hierarchy.
Object.setPrototypeOf(hardened.DOMMatrix, hardened.DOMMatrixReadOnly);
Object.setPrototypeOf(hardened.DOMPoint, hardened.DOMPointReadOnly);

module.exports = Object.assign({}, native, hardened, {
    canvasPixels,
    Float16Array,
    installWebGLGlobals
});
// 好，现在我要你做两件事，一是先将现如今的代码上传到 github 进行版本备份，以防你改错后无法找到原先的代码；二 将 png.js 删除后，进行功能测试，对比删除前后的值是否相同，功能是否正常，都正常的话，写一个 md文档，里面只需要写这几件事情，什么情况下会出现调用返回 null, 给出例子，如何避免这种情况，你要说请吃
