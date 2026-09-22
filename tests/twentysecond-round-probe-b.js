(function () {
    // Second batch for the six interfaces added in the twenty-second round:
    // deeper edges, interaction with existing state and error ordering.
    async function runProbeCases(Canvas) {
        const results = {};
        const add = async (name, fn) => {
            try { results[name] = await fn(); }
            catch (e) { results[name] = {threw: e.name, message: String(e.message).slice(0, 140)}; }
        };
        const fresh = (w = 16, h = 16) => { const c = new Canvas(w, h); return [c, c.getContext('2d')]; };
        const pixel = (g, x = 0, y = 0) => Array.from(g.getImageData(x, y, 1, 1).data);
        const alpha = (g, w, h) => Array.from(g.getImageData(0, 0, w, h).data).filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0);
        const num = v => Number.isFinite(v) ? v : String(v);
        const err = fn => { try { fn(); return null; } catch (e) { return e.name; } };
        const round = (v, n = 6) => Math.round(v * 10 ** n) / 10 ** n;

        // ---------------- DOMMatrix edges ----------------------------------
        await add('matrixStrings', () => ['none', '', 'translate(1px)', 'scale(2, 3)',
            'rotate(0.25turn)', 'skew(10deg, 20deg)', 'translate3d(1px,2px,3px)',
            'perspective(100px)', 'matrix(1,2,3,4,5,6)', 'rotate(1rad) translate(2px)',
            'translate(1)', 'scale()', 'rotate(10)', 'TRANSLATE(5PX)'].map(text => {
            try { const m = new DOMMatrix(text); return text + ' => ' + m.toString() + ' is2D=' + m.is2D; }
            catch (e) { return text + ' => ' + e.name; }
        }));
        await add('matrixSelfChain', () => {
            const m = new DOMMatrix();
            m.translateSelf(10, 20).scaleSelf(2).rotateSelf(0).skewXSelf(0);
            const before = [m.a, m.d, m.e, m.f];
            const same = m.multiplySelf({a: 1, b: 0, c: 0, d: 1, e: 1, f: 1}) === m;
            return {before, after: [m.e, m.f], returnsSelf: same};
        });
        await add('matrixPreMultiply', () => {
            const m = new DOMMatrix([2, 0, 0, 2, 10, 20]);
            m.preMultiplySelf({a: 1, b: 0, c: 0, d: 1, e: 1, f: 1});
            return [m.a, m.d, m.e, m.f];
        });
        await add('matrixRotate3', () => {
            const m = new DOMMatrix().rotate(10, 20, 30);
            return {is2D: m.is2D, values: [round(m.m11), round(m.m12), round(m.m13)]};
        });
        await add('matrixScaleOrigin3d', () => {
            const m = new DOMMatrix().scale(2, 3, 4, 1, 2, 3);
            return {is2D: m.is2D, values: [m.m11, m.m22, m.m33, m.m41, m.m42, m.m43]};
        });
        await add('matrixFromMatrix', () => {
            const a = DOMMatrix.fromMatrix({a: 2, d: 3, e: 4});
            const b = DOMMatrix.fromFloat32Array(new Float32Array([1, 2, 3, 4, 5, 6]));
            const c = DOMMatrix.fromFloat64Array(new Float64Array(16).fill(0));
            return {a: [a.a, a.d, a.e], b: [b.a, b.b, b.c, b.d, b.e, b.f], cIs2D: c.is2D,
                readOnlyTag: Object.prototype.toString.call(DOMMatrixReadOnly.fromMatrix({}))};
        });
        await add('matrixErrors', () => ({
            conflict: err(() => new DOMMatrix().multiply({a: 1, m11: 2})),
            not2D: err(() => DOMMatrix.fromMatrix({is2D: true, m13: 5})),
            badLength: err(() => new DOMMatrix([1, 2, 3])),
            badArray: err(() => DOMMatrix.fromFloat32Array(new Float64Array(6))),
            nonFiniteString: err(() => new DOMMatrix([NaN, 0, 0, 1, 0, 0]).toString()),
            readOnlySet: (() => { const m = new DOMMatrixReadOnly(); try { m.a = 5; } catch (e) { return e.name; } return m.a; })(),
        }));
        await add('matrixSerialization', () => [
            new DOMMatrix([1e-7, 0, 0, 1, 0, 0]).toString(),
            new DOMMatrix([1e21, 0, 0, 1, 0, 0]).toString(),
            new DOMMatrix([-0, 0, 0, 1, 0, 0]).toString(),
            new DOMMatrix([0.5, 0, 0, 1, 0, 0]).toString(),
        ]);
        await add('matrixPointRoundTrip', () => {
            const m = new DOMMatrix([2, 1, -1, 2, 5, 6]);
            const p = m.transformPoint(new DOMPoint(3, 4));
            const back = m.inverse().transformPoint(p);
            return {forward: [p.x, p.y], back: [round(back.x), round(back.y)],
                json: JSON.stringify(p.toJSON())};
        });
        await add('matrixAsContextTransform', () => {
            const [, g] = fresh();
            g.setTransform(new DOMMatrix('translate(4px, 4px) scale(2)'));
            const m = g.getTransform();
            g.fillStyle = 'red'; g.fillRect(0, 0, 2, 2);
            return {values: [m.a, m.d, m.e, m.f], inside: pixel(g, 5, 5), outside: pixel(g, 1, 1)};
        });

        // ---------------- Path2D edges --------------------------------------
        await add('pathEmptyOps', () => {
            const [, g] = fresh();
            const p = new Path2D();
            p.closePath(); p.lineTo(4, 4); p.closePath();
            g.fillStyle = 'red'; g.fill(p); g.stroke(p);
            return {pixels: alpha(g, 16, 16)};
        });
        await add('pathAddPathSelf', () => {
            const [, g] = fresh();
            const p = new Path2D(); p.rect(0, 0, 4, 4);
            p.addPath(p);
            g.fillStyle = 'red'; g.fill(p);
            return pixel(g, 1, 1);
        });
        await add('pathAddPathNoMatrix', () => {
            const [, g] = fresh();
            const a = new Path2D(); a.rect(0, 0, 4, 4);
            const b = new Path2D(); b.addPath(a);
            g.fillStyle = 'red'; g.fill(b);
            return pixel(g, 1, 1);
        });
        await add('pathAddPathNonFinite', () => {
            const [, g] = fresh();
            const a = new Path2D(); a.rect(0, 0, 4, 4);
            const b = new Path2D();
            b.addPath(a, {a: NaN, b: 0, c: 0, d: 1, e: 0, f: 0});
            g.fillStyle = 'red'; g.fill(b);
            return pixel(g, 1, 1);
        });
        await add('pathNonFiniteCommands', () => {
            const [, g] = fresh();
            const p = new Path2D();
            p.moveTo(0, 0); p.lineTo(Infinity, 4); p.lineTo(8, 8); p.lineTo(0, 8); p.closePath();
            g.fillStyle = 'red'; g.fill(p);
            return {pixels: alpha(g, 16, 16)};
        });
        await add('pathArity', () => {
            const p = new Path2D();
            return {moveTo: err(() => p.moveTo(1)), arc: err(() => p.arc(1, 2, 3, 4)),
                ellipse: err(() => p.ellipse(1, 2, 3, 4, 5, 6)), rect: err(() => p.rect(1, 2, 3)),
                roundRect: err(() => p.roundRect(1, 2, 3)),
                roundRectRadii: err(() => p.roundRect(0, 0, 4, 4, [1, 2, 3, 4, 5]))};
        });
        await add('pathEvenOddClip', () => {
            const [, g] = fresh();
            const p = new Path2D();
            p.rect(0, 0, 12, 12); p.rect(3, 3, 6, 6);
            g.clip(p, 'evenodd');
            g.fillStyle = 'red'; g.fillRect(0, 0, 16, 16);
            return {ring: pixel(g, 1, 1), hole: pixel(g, 6, 6)};
        });
        await add('pathHitTestUnderTransform', () => {
            const [, g] = fresh();
            const p = new Path2D(); p.rect(0, 0, 4, 4);
            g.translate(8, 8);
            return {atPathSpace: g.isPointInPath(p, 2, 2), atDeviceSpace: g.isPointInPath(p, 10, 10)};
        });
        await add('pathStrokeStyleState', () => {
            const [, g] = fresh();
            const p = new Path2D(); p.moveTo(2, 8); p.lineTo(14, 8);
            g.lineWidth = 4; g.strokeStyle = 'red'; g.setLineDash([4, 4]);
            g.stroke(p);
            return {on: pixel(g, 3, 8), off: pixel(g, 8, 8)};
        });
        await add('pathWithShadow', () => {
            const [, g] = fresh(24, 24);
            const p = new Path2D(); p.rect(2, 2, 8, 8);
            g.shadowColor = 'blue'; g.shadowOffsetX = 8; g.shadowOffsetY = 8;
            g.fillStyle = 'red'; g.fill(p);
            return {source: pixel(g, 4, 4), shadow: pixel(g, 14, 14)};
        });
        await add('pathSvgVariants', () => ['M0 0h8v8h-8z', 'M 0 0 C 2 2 6 2 8 0', 'm0 0l8 0l0 8z',
            'M0 0 A 4 4 0 0 1 8 0', ''].map(d => {
            const [, g] = fresh();
            const p = new Path2D(d);
            g.fillStyle = 'red'; g.fill(p);
            return d + ' => ' + alpha(g, 16, 16);
        }));

        // ---------------- filter edges ---------------------------------------
        await add('filterCombined', () => {
            const [, g] = fresh();
            g.filter = 'grayscale(1) opacity(0.5)';
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            return pixel(g, 2, 2);
        });
        await add('filterWithGlobalAlpha', () => {
            const [, g] = fresh();
            g.filter = 'blur(0px)'; g.globalAlpha = 0.5;
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            return pixel(g, 2, 2);
        });
        await add('filterWithShadow', () => {
            const [, g] = fresh(32, 32);
            g.filter = 'grayscale(1)';
            g.shadowColor = 'blue'; g.shadowOffsetX = 10; g.shadowOffsetY = 10;
            g.fillStyle = 'red'; g.fillRect(2, 2, 8, 8);
            return {source: pixel(g, 4, 4), shadow: pixel(g, 14, 14)};
        });
        await add('filterWithComposite', () => {
            const [, g] = fresh();
            g.fillStyle = 'blue'; g.fillRect(0, 0, 16, 16);
            g.filter = 'grayscale(1)'; g.globalCompositeOperation = 'source-atop';
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            return {covered: pixel(g, 2, 2), rest: pixel(g, 12, 12)};
        });
        await add('filterOnImage', () => {
            const [source, sg] = fresh(8, 8);
            sg.fillStyle = 'red'; sg.fillRect(0, 0, 8, 8);
            const [, g] = fresh();
            g.filter = 'grayscale(1)';
            g.drawImage(source, 0, 0);
            return pixel(g, 2, 2);
        });
        await add('filterUnderTransform', () => {
            const [, g] = fresh(32, 32);
            g.scale(2, 2);
            g.filter = 'blur(2px)';
            g.fillStyle = 'red'; g.fillRect(4, 4, 8, 8);
            return {edge: pixel(g, 8, 16), far: pixel(g, 2, 16), total: alpha(g, 32, 32)};
        });
        await add('filterValues', () => {
            const [, g] = fresh();
            const out = {};
            for (const value of ['blur(-1px)', 'brightness(-1)', 'opacity(200%)', 'saturate(300%)',
                'hue-rotate(0.5turn)', 'drop-shadow(1px 2px)', 'drop-shadow(red 1px 2px)',
                'drop-shadow(1px 2px -3px red)', 'contrast()', 'blur()', 'sepia(50%) sepia(50%)']) {
                g.filter = 'none'; g.filter = value; out[value] = g.filter;
            }
            return out;
        });
        await add('filterUrlRendering', () => {
            const [, g] = fresh();
            g.filter = 'url(#missing)';
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            return {value: g.filter, pixel: pixel(g, 2, 2)};
        });

        // ---------------- bitmaprenderer edges --------------------------------
        await add('bitmapRendererSmaller', () => {
            const source = new Canvas(4, 4);
            const sg = source.getContext('2d');
            sg.fillStyle = 'red'; sg.fillRect(0, 0, 4, 4);
            const target = new Canvas(16, 16);
            target.getContext('bitmaprenderer').transferFromImageBitmap(source.transferToImageBitmap());
            const [, probe] = fresh(16, 16);
            probe.drawImage(target, 0, 0);
            return {size: [target.width, target.height], inside: pixel(probe, 1, 1), outside: pixel(probe, 8, 8)};
        });
        await add('bitmapRendererLarger', () => {
            const source = new Canvas(16, 16);
            const sg = source.getContext('2d');
            sg.fillStyle = 'red'; sg.fillRect(0, 0, 16, 16);
            const target = new Canvas(4, 4);
            target.getContext('bitmaprenderer').transferFromImageBitmap(source.transferToImageBitmap());
            const [, probe] = fresh(8, 8);
            probe.drawImage(target, 0, 0);
            return {size: [target.width, target.height], inside: pixel(probe, 1, 1)};
        });
        await add('bitmapRendererClearThenRead', () => {
            const source = new Canvas(8, 8);
            source.getContext('2d').fillRect(0, 0, 8, 8);
            const target = new Canvas(8, 8);
            const renderer = target.getContext('bitmaprenderer');
            renderer.transferFromImageBitmap(source.transferToImageBitmap());
            renderer.transferFromImageBitmap(null);
            const [, probe] = fresh(8, 8);
            probe.drawImage(target, 0, 0);
            return pixel(probe, 2, 2);
        });
        await add('bitmapRendererResizeCanvas', () => {
            const source = new Canvas(8, 8);
            source.getContext('2d').fillRect(0, 0, 8, 8);
            const target = new Canvas(8, 8);
            target.getContext('bitmaprenderer').transferFromImageBitmap(source.transferToImageBitmap());
            target.width = 8;
            const [, probe] = fresh(8, 8);
            probe.drawImage(target, 0, 0);
            return {size: [target.width, target.height], pixel: pixel(probe, 2, 2)};
        });

        // ---------------- createImageBitmap edges -----------------------------
        await add('createBitmapNegativeCrop', async () => {
            const [c, g] = fresh(8, 8);
            g.fillStyle = 'red'; g.fillRect(0, 0, 4, 8);
            g.fillStyle = 'blue'; g.fillRect(4, 0, 4, 8);
            const b = await createImageBitmap(c, 8, 8, -4, -8);
            const [, h] = fresh(8, 8);
            h.drawImage(b, 0, 0);
            return {size: [b.width, b.height], pixel: pixel(h, 1, 1)};
        });
        await add('createBitmapOutside', async () => {
            const [c, g] = fresh(8, 8);
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            const b = await createImageBitmap(c, 4, 4, 8, 8);
            const [, h] = fresh(8, 8);
            h.drawImage(b, 0, 0);
            return {size: [b.width, b.height], inside: pixel(h, 1, 1), beyond: pixel(h, 6, 6)};
        });
        await add('createBitmapResizeOne', async () => {
            const [c, g] = fresh(8, 4);
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 4);
            const wide = await createImageBitmap(c, {resizeWidth: 16});
            const tall = await createImageBitmap(c, {resizeHeight: 8});
            return {wide: [wide.width, wide.height], tall: [tall.width, tall.height]};
        });
        await add('createBitmapFlip', async () => {
            const [c, g] = fresh(4, 4);
            g.fillStyle = 'red'; g.fillRect(0, 0, 4, 2);
            const b = await createImageBitmap(c, {imageOrientation: 'flipY'});
            const [, h] = fresh(4, 4);
            h.drawImage(b, 0, 0);
            return {top: pixel(h, 1, 0), bottom: pixel(h, 1, 3)};
        });
        await add('createBitmapBadOptions', async () => {
            const fail = async fn => { try { await fn(); return null; } catch (e) { return e.name; } };
            const [c] = fresh(4, 4);
            return {
                orientation: await fail(() => createImageBitmap(c, {imageOrientation: 'sideways'})),
                quality: await fail(() => createImageBitmap(c, {resizeQuality: 'ultra'})),
                negativeResize: await fail(() => createImageBitmap(c, {resizeWidth: -1})),
                zeroResize: await fail(() => createImageBitmap(c, {resizeWidth: 0, resizeHeight: 0})),
            };
        });
        await add('createBitmapFromBitmapRenderer', async () => {
            const source = new Canvas(4, 4);
            source.getContext('2d').fillStyle = 'red';
            source.getContext('2d').fillRect(0, 0, 4, 4);
            const target = new Canvas(4, 4);
            target.getContext('bitmaprenderer').transferFromImageBitmap(source.transferToImageBitmap());
            const b = await createImageBitmap(target);
            const [, h] = fresh(4, 4);
            h.drawImage(b, 0, 0);
            return {size: [b.width, b.height], pixel: pixel(h, 1, 1)};
        });

        // ---------------- encoding edges --------------------------------------
        await add('encodeAlpha', async () => {
            const [c, g] = fresh(4, 4);
            g.fillStyle = 'rgba(255, 0, 0, 0.5)'; g.fillRect(0, 0, 4, 4);
            const out = {};
            for (const type of ['image/png', 'image/webp']) {
                const b = await createImageBitmap(await c.convertToBlob({type}));
                const [, h] = fresh(4, 4);
                h.drawImage(b, 0, 0);
                out[type] = pixel(h, 1, 1);
            }
            return out;
        });
        await add('encodeQualityRange', async () => {
            const [c, g] = fresh(16, 16);
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 16);
            g.fillStyle = 'lime'; g.fillRect(8, 0, 8, 16);
            const sizes = {};
            for (const quality of [0, 0.5, 1, -1, 2, NaN]) {
                const b = await c.convertToBlob({type: 'image/jpeg', quality});
                sizes[String(quality)] = b.size > 0;
            }
            return sizes;
        });
        await add('encodeTypeVariants', async () => {
            const [c, g] = fresh(4, 4);
            g.fillStyle = 'red'; g.fillRect(0, 0, 4, 4);
            const out = {};
            for (const type of ['image/png ', ' image/jpeg', 'image/JPEG', 'IMAGE/WEBP', 'png', '']) {
                out[JSON.stringify(type)] = (await c.convertToBlob({type})).type;
            }
            return out;
        });

        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runProbeCases;
    else globalThis.__canvasResult = runProbeCases(OffscreenCanvas);
})();
