(function () {
    // Twenty-first round probe: Web IDL numeric conversions, float clamping and
    // the reflective shape of a 2D context. Runs unchanged in Chrome and Node.
    async function runProbeCases(Canvas) {
        const results = {};
        const add = async (name, fn) => {
            try { results[name] = await fn(); }
            catch (e) { results[name] = {threw: e.name, message: String(e.message).slice(0, 120)}; }
        };
        const fresh = (w = 8, h = 8) => { const c = new Canvas(w, h); return [c, c.getContext('2d')]; };
        const pixel = (g, x = 0, y = 0) => Array.from(g.getImageData(x, y, 1, 1).data);
        const num = v => Number.isFinite(v) ? v : String(v);

        // --- plain Web IDL `long` arguments wrap; they do not throw ----------
        for (const [name, sw] of [
            ['wrap', 4294967297], ['infinity', Infinity], ['negativeInfinity', -Infinity],
            ['nan', NaN], ['exact2e32', 4294967296], ['negativeWrap', -4294967295],
            ['fractional', 2.9], ['stringy', '3'],
        ]) await add('readWidth_' + name, () => {
            const [, g] = fresh();
            const d = g.getImageData(0, 0, sw, 1);
            return {width: d.width, height: d.height};
        });
        await add('readOrigin_wrap', () => {
            const [, g] = fresh();
            g.fillStyle = 'red'; g.fillRect(0, 0, 1, 1);
            return Array.from(g.getImageData(4294967296, 0, 1, 1).data);
        });
        await add('createWidth_wrap', () => {
            const [, g] = fresh();
            const d = g.createImageData(4294967298, 1);
            return {width: d.width, height: d.height};
        });
        await add('createWidth_infinity', () => {
            const [, g] = fresh();
            const d = g.createImageData(Infinity, 1);
            return {width: d.width, height: d.height};
        });
        await add('putOrigin_wrap', () => {
            const [, g] = fresh();
            const d = g.createImageData(1, 1);
            d.data[0] = 255; d.data[3] = 255;
            g.putImageData(d, 4294967296, 0);
            return pixel(g);
        });
        await add('putDirty_wrap', () => {
            const [, g] = fresh();
            const d = g.createImageData(2, 2);
            for (let i = 0; i < 16; i += 4) { d.data[i] = 255; d.data[i + 3] = 255; }
            g.putImageData(d, 0, 0, 0, 0, 4294967298, 4294967298);
            return [pixel(g), pixel(g, 1, 1)];
        });

        // --- float clamping of state attributes ------------------------------
        await add('floatState', () => {
            const [, g] = fresh();
            const out = {};
            g.lineWidth = 1e300; out.lineWidth = num(g.lineWidth);
            g.miterLimit = 1e300; out.miterLimit = num(g.miterLimit);
            g.shadowBlur = 1e300; out.shadowBlur = num(g.shadowBlur);
            g.shadowOffsetX = -1e300; out.shadowOffsetX = num(g.shadowOffsetX);
            g.lineDashOffset = 1e300; out.lineDashOffset = num(g.lineDashOffset);
            g.lineWidth = 5e-46; out.lineWidthTiny = num(g.lineWidth);
            g.globalAlpha = 0.5; out.globalAlpha = num(g.globalAlpha);
            return out;
        });
        await add('floatTransform', () => {
            const [, g] = fresh();
            g.setTransform(1e300, 0, 0, 1, 1e300, 0);
            const m = g.getTransform();
            return {a: num(m.a), e: num(m.e)};
        });
        await add('floatDashList', () => {
            const [, g] = fresh();
            g.setLineDash([1e300, 1]);
            return g.getLineDash().map(num);
        });
        // 0.1 is not representable in binary32: a round trip through float is
        // visible in the getter and tells clamping apart from conversion.
        await add('floatPrecision', () => {
            const [, g] = fresh();
            const out = {};
            g.lineWidth = 0.1; out.lineWidth = num(g.lineWidth);
            g.miterLimit = 0.1; out.miterLimit = num(g.miterLimit);
            g.shadowBlur = 0.1; out.shadowBlur = num(g.shadowBlur);
            g.shadowOffsetX = 0.1; out.shadowOffsetX = num(g.shadowOffsetX);
            g.lineDashOffset = 0.1; out.lineDashOffset = num(g.lineDashOffset);
            g.globalAlpha = 0.1; out.globalAlpha = num(g.globalAlpha);
            g.setLineDash([0.1, 0.2, 5e-46]); out.dash = g.getLineDash().map(num);
            g.setTransform(0.1, 0, 0, 1, 0.1, 0);
            const m = g.getTransform(); out.matrixA = num(m.a); out.matrixE = num(m.e);
            g.resetTransform(); g.translate(0.1, 0); out.translated = num(g.getTransform().e);
            g.resetTransform(); g.scale(0.1, 1); out.scaled = num(g.getTransform().a);
            return out;
        });
        await add('floatDashOdd', () => {
            const [, g] = fresh();
            g.setLineDash([1e300, 2e300, 3]);
            return g.getLineDash().map(num);
        });

        // --- finite doubles that overflow float when building a path ---------
        await add('pathFloatOverflow', () => {
            const [, g] = fresh();
            g.fillStyle = 'red';
            g.beginPath(); g.moveTo(0, 0); g.lineTo(1e300, 0); g.lineTo(0, 8); g.closePath(); g.fill();
            return pixel(g);
        });
        await add('rectFloatOverflow', () => {
            const [, g] = fresh();
            g.fillStyle = 'red'; g.fillRect(0, 0, 1e300, 1e300);
            return pixel(g);
        });

        // --- CanvasPattern.setTransform with a non-finite matrix --------------
        await add('patternNonFiniteMatrix', () => {
            const [, g] = fresh();
            const tile = new Canvas(2, 2); const t = tile.getContext('2d');
            t.fillStyle = 'red'; t.fillRect(0, 0, 2, 2);
            const p = g.createPattern(tile, 'repeat');
            let threw = null;
            try { p.setTransform({a: NaN, b: 0, c: 0, d: 1, e: 0, f: 0}); } catch (e) { threw = e.name; }
            g.fillStyle = p; g.fillRect(0, 0, 8, 8);
            return {threw, pixel: pixel(g, 4, 4)};
        });
        await add('patternInfiniteMatrix', () => {
            const [, g] = fresh();
            const tile = new Canvas(2, 2); const t = tile.getContext('2d');
            t.fillStyle = 'red'; t.fillRect(0, 0, 2, 2);
            const p = g.createPattern(tile, 'repeat');
            let threw = null;
            try { p.setTransform({a: 1, b: 0, c: 0, d: 1, e: Infinity, f: 0}); } catch (e) { threw = e.name; }
            g.fillStyle = p; g.fillRect(0, 0, 8, 8);
            return {threw, pixel: pixel(g, 4, 4)};
        });

        // --- reflective shape ------------------------------------------------
        await add('contextShape', () => {
            const [c, g] = fresh();
            return {
                ownNames: Object.getOwnPropertyNames(g).length,
                ownKeys: Object.keys(g).length,
                canvasOnPrototype: Object.getOwnPropertyDescriptor(Object.getPrototypeOf(g), 'canvas') !== undefined,
                canvasOwn: Object.hasOwn(g, 'canvas'),
                canvasMatches: g.canvas === c,
                tag: Object.prototype.toString.call(g),
            };
        });
        await add('hostShape', () => {
            const c = new Canvas(2, 2);
            return {
                tag: Object.prototype.toString.call(c),
                prototypeNames: Object.getOwnPropertyNames(Object.getPrototypeOf(c)).sort(),
            };
        });
        await add('contextLostHandlers', () => {
            const c = new Canvas(2, 2);
            const proto = Object.getPrototypeOf(c);
            const d = Object.getOwnPropertyDescriptor(proto, 'oncontextlost');
            const handler = () => {};
            const out = {
                descriptor: d && {enumerable: d.enumerable, configurable: d.configurable,
                    hasGet: typeof d.get === 'function', hasSet: typeof d.set === 'function'},
                initial: c.oncontextlost,
            };
            c.oncontextlost = handler; out.afterFunction = c.oncontextlost === handler;
            c.oncontextlost = 42; out.afterNumber = c.oncontextlost;
            c.oncontextlost = null; out.afterNull = c.oncontextlost;
            c.oncontextrestored = handler; out.restored = c.oncontextrestored === handler;
            out.crossInstance = new Canvas(2, 2).oncontextlost;
            out.getterOnPlainObject = (() => { try { return d.get.call({}); } catch (e) { return e.name; } })();
            return out;
        });
        await add('bitmapShape', () => {
            const [c, g] = fresh(2, 2);
            g.fillStyle = 'red'; g.fillRect(0, 0, 2, 2);
            const b = c.transferToImageBitmap();
            const shape = {
                tag: Object.prototype.toString.call(b),
                prototypeNames: Object.getOwnPropertyNames(Object.getPrototypeOf(b)).sort(),
                size: [b.width, b.height],
            };
            b.close();
            return shape;
        });
        await add('patternShape', () => {
            const [, g] = fresh();
            const p = g.createPattern(new Canvas(2, 2), 'repeat');
            return {
                tag: Object.prototype.toString.call(p),
                prototypeNames: Object.getOwnPropertyNames(Object.getPrototypeOf(p)).sort(),
                ownNames: Object.getOwnPropertyNames(p).length,
            };
        });

        // --- OffscreenCanvas dimensions are [EnforceRange] unsigned long long -
        for (const [name, width] of [
            ['wrap32', 4294967298], ['big', 1099511627776], ['negative', -1],
            ['fractional', 3.7], ['nan', NaN], ['infinity', Infinity],
        ]) await add('dimension_' + name, () => {
            const c = new Canvas(width, 1);
            return {width: num(c.width), height: num(c.height)};
        });
        await add('dimension_assign', () => {
            const c = new Canvas(2, 1);
            c.width = 4294967298;
            return num(c.width);
        });

        // --- full interface member lists -------------------------------------
        await add('contextMembers', () => {
            const [, g] = fresh();
            return Object.getOwnPropertyNames(Object.getPrototypeOf(g)).sort();
        });
        await add('textMetricsMembers', () => {
            const [, g] = fresh();
            const m = g.measureText('Mg');
            const own = Object.getOwnPropertyNames(m);
            const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(m));
            return {own: own.sort(), proto: proto.sort(), tag: Object.prototype.toString.call(m)};
        });
        await add('imageDataMembers', () => {
            const [, g] = fresh();
            const d = g.createImageData(1, 1);
            return {
                own: Object.getOwnPropertyNames(d).sort(),
                proto: Object.getOwnPropertyNames(Object.getPrototypeOf(d)).sort(),
                tag: Object.prototype.toString.call(d),
            };
        });
        await add('gradientMembers', () => {
            const [, g] = fresh();
            const gr = g.createLinearGradient(0, 0, 1, 0);
            return {
                own: Object.getOwnPropertyNames(gr).sort(),
                proto: Object.getOwnPropertyNames(Object.getPrototypeOf(gr)).sort(),
                tag: Object.prototype.toString.call(gr),
            };
        });
        await add('transformMembers', () => {
            const [, g] = fresh();
            const m = g.getTransform();
            return {tag: Object.prototype.toString.call(m), keys: Object.keys(m).sort()};
        });
        await add('globals', () => ['Path2D', 'ImageData', 'ImageBitmap', 'CanvasPattern',
            'CanvasGradient', 'TextMetrics', 'DOMMatrix', 'createImageBitmap', 'OffscreenCanvas',
            'OffscreenCanvasRenderingContext2D', 'ImageBitmapRenderingContext']
            .map(n => n + ':' + typeof globalThis[n]));
        await add('bitmapRenderer', () => {
            const c = new Canvas(2, 2);
            const r = c.getContext('bitmaprenderer');
            return r === null ? null : {tag: Object.prototype.toString.call(r),
                proto: Object.getOwnPropertyNames(Object.getPrototypeOf(r)).sort()};
        });
        for (const type of ['image/jpeg', 'image/webp', 'image/avif'])
            await add('blobType_' + type.replace('/', '_'), async () => {
                const [c, g] = fresh(2, 2);
                g.fillStyle = 'red'; g.fillRect(0, 0, 2, 2);
                const blob = await c.convertToBlob({type});
                const bytes = new Uint8Array((await blob.arrayBuffer()).slice(0, 4));
                return {type: blob.type, header: Array.from(bytes)};
            });

        // --- descriptors and constructors of the value interfaces ------------
        const describe = (object, key) => {
            const d = Object.getOwnPropertyDescriptor(object, key);
            return d && {enumerable: d.enumerable, configurable: d.configurable,
                writable: d.writable, accessor: typeof d.get === 'function'};
        };
        await add('valueDescriptors', () => {
            const [, g] = fresh();
            const d = g.createImageData(1, 1), m = g.measureText('Mg');
            const gr = g.createLinearGradient(0, 0, 1, 0);
            return {
                imageDataOwnData: describe(d, 'data'),
                imageDataProtoData: describe(Object.getPrototypeOf(d), 'data'),
                imageDataProtoWidth: describe(Object.getPrototypeOf(d), 'width'),
                metricsProtoWidth: describe(Object.getPrototypeOf(m), 'width'),
                gradientProtoStop: describe(Object.getPrototypeOf(gr), 'addColorStop'),
                dataConstructor: d.data.constructor.name,
            };
        });
        await add('valueConstructors', () => {
            const out = {};
            for (const n of ['ImageData', 'TextMetrics', 'CanvasGradient', 'CanvasPattern', 'ImageBitmap']) {
                const C = globalThis[n];
                out[n] = C === undefined ? 'undefined'
                    : {name: C.name, length: C.length,
                       direct: (() => { try { new C(); return 'constructed'; } catch (e) { return e.name; } })()};
            }
            return out;
        });
        for (const [name, make] of [
            ['dims', () => new ImageData(2, 3)],
            ['dimsSettings', () => new ImageData(2, 2, {colorSpace: 'display-p3', pixelFormat: 'rgba-float16'})],
            ['buffer2', () => new ImageData(new Uint8ClampedArray(16), 2)],
            ['buffer22', () => new ImageData(new Uint8ClampedArray(16), 2, 2)],
            ['zeroWidth', () => new ImageData(0, 2)],
            ['oneArg', () => new ImageData(2)],
            ['noArgs', () => new ImageData()],
            ['ragged', () => new ImageData(new Uint8ClampedArray(15), 2)],
            ['mismatch', () => new ImageData(new Uint8ClampedArray(16), 3)],
            ['heightMismatch', () => new ImageData(new Uint8ClampedArray(16), 2, 3)],
            ['plainArray', () => new ImageData([0, 0, 0, 0], 1)],
        ]) await add('imageDataNew_' + name, () => {
            const d = make();
            return {width: d.width, height: d.height, colorSpace: d.colorSpace,
                pixelFormat: d.pixelFormat, length: d.data.length, kind: d.data.constructor.name,
                tag: Object.prototype.toString.call(d)};
        });

        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runProbeCases;
    else globalThis.__canvasResult = runProbeCases(OffscreenCanvas);
})();
