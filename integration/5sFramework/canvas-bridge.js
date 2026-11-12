const installed = new WeakMap();
const htmlRecords = new WeakMap();
const htmlOwners = new WeakMap();

function installCanvasBridge(target, vm65) {
    if (installed.has(target)) return installed.get(target);
    if (!target.HTMLCanvasElement || !vm65?.toolsFunc) {
        throw new Error('Install the bridge after the framework HTMLCanvasElement and vm65 tools.');
    }
    const native = vm65.memory.canvasBackend;
    const tools = vm65.toolsFunc;
    const htmlPrototype = target.HTMLCanvasElement.prototype;
    const oldHTML = Object.getOwnPropertyDescriptors(htmlPrototype);
    const nativeOffscreen = Object.getOwnPropertyDescriptors(native.OffscreenCanvas.prototype);
    const offscreenModes = new WeakMap();
    const contextPrototypes = new Map();
    const inheritedSetAttribute = htmlPrototype.setAttribute;
    const legacyTypes = {
        webgl: target.WebGLRenderingContext,
        webgl2: target.WebGL2RenderingContext,
        webgpu: target.GPUCanvasContext,
    };
    const callable = (fn, name, arity) => native.nativeFunction(fn, name, arity, false);
    const exception = (message, name) => new (target.DOMException || DOMException)(message, name);

    function htmlRecord(canvas) {
        if (!htmlPrototype.isPrototypeOf(canvas)) throw new TypeError('Illegal invocation');
        let record = htmlRecords.get(canvas);
        if (!record) {
            record = {
                canvas: new native.HTMLCanvasElement(
                    oldHTML.width.get.call(canvas), oldHTML.height.get.call(canvas)),
                mode: null,
                legacy: null,
                transferred: false,
            };
            htmlRecords.set(canvas, record);
            htmlOwners.set(record.canvas, canvas);
        }
        return record;
    }

    function imageSource(source) {
        if (source && htmlRecords.has(source)) return htmlRecords.get(source).canvas;
        if (source && htmlPrototype.isPrototypeOf(source)) return htmlRecord(source).canvas;
        return source;
    }

    function adaptContext(ctx) {
        if (!ctx) return ctx;
        for (const [Type, prototype] of contextPrototypes) {
            if (ctx instanceof Type) {
                Object.setPrototypeOf(ctx, prototype);
                break;
            }
        }
        return ctx;
    }

    const imageDataPrototype = Object.create(native.ImageData.prototype);
    function adaptImageData(image) {
        Object.setPrototypeOf(image, imageDataPrototype);
        const pixels = image.data;
        if (image.pixelFormat === 'rgba-unorm8' && !(pixels instanceof target.Uint8ClampedArray)) {
            // Keep the original storage, but expose a view from this VM's realm.
            Object.defineProperty(image, 'data', {
                value: new target.Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length),
                configurable: true, enumerable: true, writable: false,
            });
        }
        return image;
    }
    const ImageData = native.nativeFunction(function (...args) {
        return adaptImageData(new native.ImageData(...args));
    }, 'ImageData', 2, true);
    ImageData.prototype = imageDataPrototype;
    Object.defineProperty(imageDataPrototype, 'constructor', { value: ImageData, writable: true, configurable: true });

    // Per-VM prototypes: do not modify the native package's shared prototypes.
    for (const name of ['CanvasRenderingContext2D', 'OffscreenCanvasRenderingContext2D', 'ImageBitmapRenderingContext']) {
        const Type = native[name];
        const prototype = Object.create(Type.prototype);
        const Constructor = native.nativeFunction(function () {
            throw new TypeError('Illegal constructor');
        }, name, 0, true);
        Constructor.prototype = prototype;
        Object.defineProperty(prototype, 'constructor', { value: Constructor, writable: true, configurable: true });
        const canvasGetter = Object.getOwnPropertyDescriptor(Type.prototype, 'canvas').get;
        Object.defineProperty(prototype, 'canvas', {
            get: callable(function () {
                const canvas = canvasGetter.call(this);
                return htmlOwners.get(canvas) || canvas;
            }, 'get canvas', 0), enumerable: true, configurable: true,
        });
        for (const method of ['drawImage', 'createPattern']) {
            const original = Type.prototype[method];
            if (typeof original !== 'function') continue;
            Object.defineProperty(prototype, method, {
                value: callable(function (...args) {
                    if (args.length) args[0] = imageSource(args[0]);
                    return Reflect.apply(original, this, args);
                }, method, original.length), writable: true, enumerable: true, configurable: true,
            });
        }
        for (const method of ['getImageData', 'createImageData']) {
            const original = Type.prototype[method];
            if (typeof original !== 'function') continue;
            Object.defineProperty(prototype, method, {
                value: callable(function (...args) {
                    return adaptImageData(Reflect.apply(original, this, args));
                }, method, original.length), writable: true, enumerable: true, configurable: true,
            });
        }
        contextPrototypes.set(Type, prototype);
        Object.defineProperty(target, name, { value: Constructor, writable: true, configurable: true });
    }

    function legacyOffscreenContext(canvas, type, options) {
        const Type = legacyTypes[type];
        if (typeof Type !== 'function') return null;
        const context = tools.createProxyObj(Type, 'context_' + type);
        if (!context) throw new Error('Framework could not create ' + type + ' context');
        if (type !== 'webgpu') {
            tools.setProtoArr.call(context, 'contextAttributes', Object.assign(
                {}, tools.getProtoArr.call(context, 'contextAttributes'), options));
        }
        tools.setProtoArr.call(context, 'canvas', canvas);
        return context;
    }

    const offscreenPrototype = Object.create(native.OffscreenCanvas.prototype);
    function prepareOffscreen(canvas) {
        Object.setPrototypeOf(canvas, offscreenPrototype);
        return canvas;
    }
    const OffscreenCanvas = native.nativeFunction(function (width, height) {
        if (arguments.length < 2) throw new TypeError('OffscreenCanvas requires width and height');
        return prepareOffscreen(new native.OffscreenCanvas(width, height));
    }, 'OffscreenCanvas', 2, true);
    OffscreenCanvas.prototype = offscreenPrototype;
    Object.defineProperty(offscreenPrototype, 'constructor', { value: OffscreenCanvas, configurable: true, writable: true });
    Object.defineProperty(offscreenPrototype, 'getContext', {
        value: callable(function (type, options) {
            // Validate the native receiver before any framework lookup.
            nativeOffscreen.width.get.call(this);
            if (!arguments.length) throw new TypeError('getContext requires a context id');
            if (typeof type === 'symbol') throw new TypeError('Cannot convert a Symbol to a string');
            type = String(type);
            const current = offscreenModes.get(this);
            if (current) return current.type === type ? current.context : null;
            const legacy = Object.hasOwn(legacyTypes, type);
            const context = legacy ? legacyOffscreenContext(this, type, options)
                : adaptContext(nativeOffscreen.getContext.value.call(this, type, options));
            if (context) offscreenModes.set(this, { type, context, legacy });
            return context;
        }, 'getContext', 1), configurable: true, enumerable: true, writable: true,
    });
    for (const method of ['convertToBlob', 'transferToImageBitmap']) {
        const original = nativeOffscreen[method].value;
        Object.defineProperty(offscreenPrototype, method, {
            value: callable(function (...args) {
                nativeOffscreen.width.get.call(this);
                if (offscreenModes.get(this)?.legacy) {
                    const error = exception('Export from a legacy WebGL/WebGPU context is not implemented by this bridge', 'NotSupportedError');
                    if (method === 'convertToBlob') return Promise.reject(error);
                    throw error;
                }
                return Reflect.apply(original, this, args);
            }, method, original.length), configurable: true, enumerable: true, writable: true,
        });
    }
    Object.defineProperty(target, 'OffscreenCanvas', { value: OffscreenCanvas, writable: true, configurable: true });

    Object.defineProperty(target, 'ImageData', { value: ImageData, writable: true, configurable: true });
    for (const name of ['ImageBitmap', 'CanvasGradient', 'CanvasPattern', 'TextMetrics',
        'Path2D', 'DOMMatrix', 'DOMMatrixReadOnly', 'DOMPoint', 'DOMPointReadOnly', 'Float16Array']) {
        Object.defineProperty(target, name, { value: native[name], writable: true, configurable: true });
    }
    Object.defineProperty(target, 'createImageBitmap', {
        value: callable(function (...args) {
            if (args.length) args[0] = imageSource(args[0]);
            return native.createImageBitmap(...args);
        }, 'createImageBitmap', 1), writable: true, configurable: true,
    });

    function defineHTML(name, fn, arity) {
        Object.defineProperty(htmlPrototype, name, {
            value: callable(fn, name, arity), writable: true, enumerable: true, configurable: true,
        });
    }
    for (const dimension of ['width', 'height']) {
        Object.defineProperty(htmlPrototype, dimension, {
            get: callable(function () { return htmlRecord(this).canvas[dimension]; }, 'get ' + dimension, 0),
            set: callable(function (value) {
                const record = htmlRecord(this);
                record.canvas[dimension] = value;
                oldHTML[dimension].set.call(this, record.canvas[dimension]);
            }, 'set ' + dimension, 1), configurable: true, enumerable: true,
        });
    }
    // Handle the framework's ordinary setAttribute(width/height) path as well.
    if (typeof inheritedSetAttribute === 'function') {
        defineHTML('setAttribute', function (name, value, ...rest) {
            if (typeof name === 'symbol' || typeof value === 'symbol') throw new TypeError('Cannot convert a Symbol to a string');
            name = String(name); value = String(value);
            const key = name.toLowerCase();
            if (key === 'width' || key === 'height') {
                const match = /^[\t\n\f\r ]*\+?(\d+)/.exec(value);
                const parsed = match ? Number(match[1]) : NaN;
                this[key] = Number.isFinite(parsed) && parsed <= 2147483647 ? parsed : key === 'width' ? 300 : 150;
            }
            return Reflect.apply(inheritedSetAttribute, this, [name, value, ...rest]);
        }, 2);
    }

    defineHTML('getContext', function (type, options) {
        if (!arguments.length) throw new TypeError('getContext requires a context id');
        if (typeof type === 'symbol') throw new TypeError('Cannot convert a Symbol to a string');
        type = String(type);
        const record = htmlRecord(this);
        if (record.transferred) throw exception('Canvas control was transferred', 'InvalidStateError');
        if (record.mode && record.mode !== type) return null;
        if (record.legacy) return record.legacy;
        let context;
        if (type === '2d' || type === 'bitmaprenderer') {
            context = adaptContext(record.canvas.getContext(type, options));
        } else {
            context = oldHTML.getContext.value.call(this, type, options);
            if (context) record.legacy = context;
        }
        if (context) record.mode = type;
        return context;
    }, 1);

    defineHTML('transferControlToOffscreen', function () {
        const record = htmlRecord(this);
        if (record.mode || record.transferred) throw exception('Canvas already has a context or was transferred', 'InvalidStateError');
        const canvas = prepareOffscreen(record.canvas.transferControlToOffscreen());
        record.transferred = true;
        return canvas;
    }, 0);

    function encodeHTML(canvas, type, quality) {
        const record = htmlRecord(canvas);
        if (record.legacy) throw exception('Encoding legacy WebGL/WebGPU surfaces is not implemented', 'NotSupportedError');
        const width = record.canvas.width, height = record.canvas.height;
        if (!width || !height) return null;
        if (width > 65535 || height > 65535 || width * height > 268435456) {
            throw exception('Canvas dimensions exceed the native backing-store limit', 'IndexSizeError');
        }
        if (typeof type === 'symbol') throw new TypeError('Cannot convert a Symbol to a string');
        type = type === undefined ? 'image/png' : String(type).toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) type = 'image/png';
        const limit = type === 'image/webp' ? 16383 : type === 'image/jpeg' ? 65500 : 65535;
        const outputWidth = Math.min(width, limit), outputHeight = Math.min(height, limit);
        let pixels = record.canvas[native.canvasPixels]();
        if (outputWidth !== width || outputHeight !== height) {
            const cropped = new Uint8Array(outputWidth * outputHeight * 4);
            for (let y = 0; y < outputHeight; y++) {
                cropped.set(pixels.subarray(y * width * 4, (y * width + outputWidth) * 4), y * outputWidth * 4);
            }
            pixels = cropped;
        }
        const bytes = native.encodeImage(pixels, outputWidth, outputHeight, type,
            typeof quality === 'number' && quality >= 0 && quality <= 1 ? quality : undefined);
        return bytes ? { bytes, type } : null;
    }
    defineHTML('toDataURL', function (type, quality) {
        const encoded = encodeHTML(this, type, quality);
        return encoded ? `data:${encoded.type};base64,${Buffer.from(encoded.bytes).toString('base64')}` : 'data:,';
    }, 0);
    defineHTML('toBlob', function (callback, type, quality) {
        if (typeof callback !== 'function') throw new TypeError('toBlob requires a callback');
        const encoded = encodeHTML(this, type, quality);
        const blob = encoded ? new Blob([encoded.bytes], { type: encoded.type }) : null;
        setImmediate(() => callback(blob));
    }, 1);

    const result = Object.freeze({ backend: 'native-canvas', version: 1 });
    installed.set(target, result);
    return result;
}

module.exports = { installCanvasBridge };
