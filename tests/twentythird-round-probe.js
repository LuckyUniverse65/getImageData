(function () {
    // Function identity of every exposed callable: name, length and the source
    // text that Function.prototype.toString reveals.
    async function runProbeCases(Canvas) {
        const results = {};
        const add = async (name, fn) => {
            try { results[name] = await fn(); }
            catch (e) { results[name] = {threw: e.name, message: String(e.message).slice(0, 140)}; }
        };
        const describe = fn => [fn.name, fn.length, String(fn)];

        await add('contextMethods', () => {
            const g = new Canvas(8, 8).getContext('2d');
            const proto = Object.getPrototypeOf(g);
            const out = {};
            for (const key of Object.getOwnPropertyNames(proto).sort()) {
                const d = Object.getOwnPropertyDescriptor(proto, key);
                if (typeof d.value === 'function') out[key] = describe(d.value);
                else if (d.get) out['get ' + key] = describe(d.get);
            }
            return out;
        });
        await add('contextAccessorSetters', () => {
            const g = new Canvas(8, 8).getContext('2d');
            const proto = Object.getPrototypeOf(g);
            const out = {};
            for (const key of ['fillStyle', 'font', 'lineWidth', 'filter', 'lang']) {
                const d = Object.getOwnPropertyDescriptor(proto, key);
                if (d && d.set) out[key] = describe(d.set);
            }
            return out;
        });
        await add('interfaceConstructors', () => {
            const out = {};
            for (const name of ['OffscreenCanvas', 'OffscreenCanvasRenderingContext2D', 'Path2D',
                'DOMMatrix', 'DOMMatrixReadOnly', 'DOMPoint', 'ImageData', 'ImageBitmap',
                'CanvasPattern', 'CanvasGradient', 'TextMetrics', 'ImageBitmapRenderingContext']) {
                const C = globalThis[name];
                out[name] = C === undefined ? 'undefined' : describe(C);
            }
            out.createImageBitmap = describe(globalThis.createImageBitmap);
            return out;
        });
        await add('interfaceMethods', () => {
            const out = {};
            const c = new Canvas(8, 8);
            const g = c.getContext('2d');
            const pairs = [
                ['OffscreenCanvas.getContext', Object.getPrototypeOf(c).getContext],
                ['OffscreenCanvas.convertToBlob', Object.getPrototypeOf(c).convertToBlob],
                ['OffscreenCanvas.transferToImageBitmap', Object.getPrototypeOf(c).transferToImageBitmap],
                ['Path2D.rect', Path2D.prototype.rect],
                ['Path2D.addPath', Path2D.prototype.addPath],
                ['DOMMatrix.translate', DOMMatrix.prototype.translate],
                ['DOMMatrix.toString', DOMMatrix.prototype.toString],
                ['CanvasPattern.setTransform', CanvasPattern.prototype.setTransform],
                ['CanvasGradient.addColorStop', CanvasGradient.prototype.addColorStop],
                ['ImageBitmap.close', ImageBitmap.prototype.close],
                ['ImageBitmapRenderingContext.transferFromImageBitmap',
                    ImageBitmapRenderingContext.prototype.transferFromImageBitmap],
            ];
            for (const [name, fn] of pairs) out[name] = fn ? describe(fn) : 'missing';
            out['get ImageData.data'] = describe(Object.getOwnPropertyDescriptor(ImageData.prototype, 'data').get);
            out['get TextMetrics.width'] = describe(Object.getOwnPropertyDescriptor(TextMetrics.prototype, 'width').get);
            out['get DOMMatrix.a'] = describe(Object.getOwnPropertyDescriptor(DOMMatrixReadOnly.prototype, 'a').get);
            out['get OffscreenCanvas.width'] = describe(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(c), 'width').get);
            void g;
            return out;
        });
        await add('constructorProperties', () => {
            const out = {};
            for (const name of ['OffscreenCanvas', 'Path2D', 'ImageData', 'DOMMatrix']) {
                const C = globalThis[name];
                out[name] = {
                    prototypeDescriptor: (() => {
                        const d = Object.getOwnPropertyDescriptor(C, 'prototype');
                        return d && {writable: d.writable, enumerable: d.enumerable, configurable: d.configurable};
                    })(),
                    ownNames: Object.getOwnPropertyNames(C).sort(),
                    protoConstructorSame: C.prototype.constructor === C,
                    protoOfConstructor: Object.getPrototypeOf(C) === Function.prototype ? 'Function.prototype' : String(Object.getPrototypeOf(C).name),
                    callWithoutNew: (() => { try { C(1, 1); return 'called'; } catch (e) { return e.name; } })(),
                };
            }
            return out;
        });
        await add('functionOwnShape', () => {
            const g = new Canvas(8, 8).getContext('2d');
            const proto = Object.getPrototypeOf(g);
            const method = proto.fillRect;
            const getter = Object.getOwnPropertyDescriptor(proto, 'fillStyle').get;
            const shape = fn => ({
                own: Object.getOwnPropertyNames(fn).sort(),
                hasPrototype: 'prototype' in fn,
                prototypeValue: typeof fn.prototype,
                nameDescriptor: Object.getOwnPropertyDescriptor(fn, 'name'),
                lengthDescriptor: Object.getOwnPropertyDescriptor(fn, 'length'),
                protoOfFn: Object.getPrototypeOf(fn) === Function.prototype ? 'Function.prototype' : 'other',
                isConstructor: (() => { try { new fn(); return true; } catch (e) { return e.name; } })(),
            });
            return {method: shape(method), getter: shape(getter),
                constructorShape: shape(Path2D), boundShape: shape(method.bind(null))};
        });
        // Full arity table for every interface this project exposes.
        await add('arityTable', () => {
            const c = new Canvas(8, 8);
            const g = c.getContext('2d');
            const targets = {
                OffscreenCanvasRenderingContext2D: Object.getPrototypeOf(g),
                OffscreenCanvas: Object.getPrototypeOf(c),
                Path2D: Path2D.prototype,
                DOMMatrix: DOMMatrix.prototype,
                DOMMatrixReadOnly: DOMMatrixReadOnly.prototype,
                DOMPoint: DOMPoint.prototype,
                DOMPointReadOnly: DOMPointReadOnly.prototype,
                ImageData: ImageData.prototype,
                ImageBitmap: ImageBitmap.prototype,
                CanvasPattern: CanvasPattern.prototype,
                CanvasGradient: CanvasGradient.prototype,
                TextMetrics: TextMetrics.prototype,
                ImageBitmapRenderingContext: ImageBitmapRenderingContext.prototype,
            };
            const out = {};
            for (const [label, proto] of Object.entries(targets)) {
                const methods = {}, accessors = [];
                for (const key of Object.getOwnPropertyNames(proto).sort()) {
                    if (key === 'constructor') continue;
                    const d = Object.getOwnPropertyDescriptor(proto, key);
                    if (typeof d.value === 'function') methods[key] = d.value.length;
                    else if (d.get || d.set) accessors.push(key + ':' + (d.get ? 'g' : '') + (d.set ? 's' : ''));
                }
                const C = globalThis[label];
                out[label] = {methods, accessors,
                    statics: C ? Object.getOwnPropertyNames(C).filter(k => !['length','name','prototype'].includes(k))
                        .map(k => k + ':' + (typeof C[k] === 'function' ? C[k].length : '?')) : []};
            }
            return out;
        });
        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runProbeCases;
    else globalThis.__canvasResult = runProbeCases(OffscreenCanvas);
})();
