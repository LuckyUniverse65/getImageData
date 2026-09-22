(function () {
    // Twenty-second round probe: the contracts of the six interfaces that the
    // twenty-first round measured as missing. Runs unchanged in Chrome and Node.
    async function runProbeCases(Canvas) {
        const results = {};
        const add = async (name, fn) => {
            try { results[name] = await fn(); }
            catch (e) { results[name] = {threw: e.name, message: String(e.message).slice(0, 140)}; }
        };
        const fresh = (w = 16, h = 16) => { const c = new Canvas(w, h); return [c, c.getContext('2d')]; };
        const pixel = (g, x = 0, y = 0) => Array.from(g.getImageData(x, y, 1, 1).data);
        const num = v => Number.isFinite(v) ? v : String(v);
        const names = o => Object.getOwnPropertyNames(o).sort();

        // ---------------- DOMMatrix ----------------------------------------
        await add('matrixShape', () => {
            const m = new DOMMatrix();
            return {tag: Object.prototype.toString.call(m), own: names(m),
                proto: names(Object.getPrototypeOf(m)),
                parentProto: names(Object.getPrototypeOf(Object.getPrototypeOf(m))),
                ctorName: DOMMatrix.name, ctorLength: DOMMatrix.length,
                readOnly: typeof DOMMatrixReadOnly};
        });
        await add('matrixIdentity', () => {
            const m = new DOMMatrix();
            return {a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f, is2D: m.is2D,
                isIdentity: m.isIdentity, m11: m.m11, m33: m.m33, m44: m.m44,
                string: m.toString()};
        });
        await add('matrixFromArray', () => {
            const m = new DOMMatrix([1, 2, 3, 4, 5, 6]);
            return {values: [m.a, m.b, m.c, m.d, m.e, m.f], is2D: m.is2D, string: m.toString()};
        });
        await add('matrixFrom16', () => {
            const m = new DOMMatrix(Array.from({length: 16}, (_, i) => i + 1));
            return {is2D: m.is2D, m13: m.m13, m44: m.m44, string: m.toString()};
        });
        await add('matrixFromString', () => {
            const m = new DOMMatrix('translate(10px, 20px) scale(2)');
            return {values: [m.a, m.b, m.c, m.d, m.e, m.f], is2D: m.is2D};
        });
        await add('matrixBadString', () => new DOMMatrix('not a transform').toString());
        await add('matrixOps', () => {
            const m = new DOMMatrix([2, 0, 0, 2, 10, 20]);
            const t = m.translate(5, 5), s = m.scale(3), r = new DOMMatrix().rotate(90);
            const inv = m.inverse(), mul = m.multiply(new DOMMatrix([1, 0, 0, 1, 1, 1]));
            const p = m.transformPoint({x: 1, y: 1});
            return {
                translate: [t.a, t.d, t.e, t.f], scale: [s.a, s.d, s.e, s.f],
                rotate: [Math.round(r.a * 1e6) / 1e6, Math.round(r.b * 1e6) / 1e6],
                inverse: [inv.a, inv.d, inv.e, inv.f],
                multiply: [mul.a, mul.e, mul.f],
                point: [p.x, p.y, p.z, p.w], pointTag: Object.prototype.toString.call(p),
                unchanged: [m.a, m.e], flip: new DOMMatrix().flipX().a,
                skew: Math.round(new DOMMatrix().skewX(45).c * 1e6) / 1e6,
                float32: Array.from(m.toFloat32Array()).slice(0, 6),
                float64: Array.from(m.toFloat64Array()).length,
                json: JSON.stringify(m.toJSON()),
            };
        });
        await add('matrixSelfOps', () => {
            const m = new DOMMatrix();
            m.translateSelf(3, 4); m.scaleSelf(2); m.rotateSelf(0);
            const before = [m.a, m.e, m.f];
            m.invertSelf();
            return {before, after: [m.a, Math.round(m.e * 1e6) / 1e6], is2D: m.is2D};
        });
        await add('matrixNonInvertible', () => {
            const m = new DOMMatrix([0, 0, 0, 0, 0, 0]);
            const inv = m.inverse();
            return {a: num(inv.a), is2D: inv.is2D, string: inv.toString()};
        });
        await add('matrixSetters', () => {
            const m = new DOMMatrix();
            m.a = 5; m.m12 = 7; m.f = 9;
            return {a: m.a, m11: m.m11, b: m.b, m12: m.m12, f: m.f, m42: m.m42};
        });
        await add('matrix3DFlag', () => {
            const m = new DOMMatrix();
            m.m43 = 5;
            return {is2D: m.is2D, m43: m.m43};
        });
        await add('contextGetTransform', () => {
            const [, g] = fresh();
            g.setTransform(2, 0, 0, 3, 4, 5);
            const m = g.getTransform();
            return {tag: Object.prototype.toString.call(m), values: [m.a, m.b, m.c, m.d, m.e, m.f],
                is2D: m.is2D, live: (g.translate(100, 100), m.e)};
        });
        await add('contextSetTransformMatrix', () => {
            const [, g] = fresh();
            g.setTransform(new DOMMatrix([2, 0, 0, 2, 3, 4]));
            const m = g.getTransform();
            return [m.a, m.d, m.e, m.f];
        });

        // ---------------- Path2D -------------------------------------------
        await add('pathShape', () => {
            const p = new Path2D();
            return {tag: Object.prototype.toString.call(p), own: names(p),
                proto: names(Object.getPrototypeOf(p)),
                ctorName: Path2D.name, ctorLength: Path2D.length};
        });
        await add('pathFill', () => {
            const [, g] = fresh();
            const p = new Path2D();
            p.rect(0, 0, 8, 8);
            g.fillStyle = 'red'; g.fill(p);
            return {inside: pixel(g, 2, 2), outside: pixel(g, 10, 10)};
        });
        await add('pathDoesNotDisturbCurrentPath', () => {
            const [, g] = fresh();
            g.beginPath(); g.rect(8, 8, 8, 8);
            const p = new Path2D(); p.rect(0, 0, 4, 4);
            g.fillStyle = 'red'; g.fill(p);
            g.fillStyle = 'blue'; g.fill();
            return {fromPath: pixel(g, 1, 1), fromCurrent: pixel(g, 10, 10)};
        });
        await add('pathStrokeAndClip', () => {
            const [, g] = fresh();
            const p = new Path2D(); p.rect(2, 2, 6, 6);
            g.lineWidth = 2; g.strokeStyle = 'red'; g.stroke(p);
            const edge = pixel(g, 2, 2);
            const [, h] = fresh();
            const q = new Path2D(); q.rect(0, 0, 4, 4);
            h.clip(q); h.fillStyle = 'red'; h.fillRect(0, 0, 16, 16);
            return {edge, clipped: [pixel(h, 1, 1), pixel(h, 8, 8)]};
        });
        await add('pathHitTest', () => {
            const [, g] = fresh();
            const p = new Path2D(); p.rect(0, 0, 8, 8);
            g.lineWidth = 4;
            return {in: g.isPointInPath(p, 4, 4), out: g.isPointInPath(p, 12, 12),
                stroke: g.isPointInStroke(p, 0, 4), rule: g.isPointInPath(p, 4, 4, 'evenodd')};
        });
        await add('pathCopyAndAdd', () => {
            const [, g] = fresh();
            const a = new Path2D(); a.rect(0, 0, 4, 4);
            const b = new Path2D(a); b.rect(8, 8, 4, 4);
            const c = new Path2D(); c.addPath(a, new DOMMatrix([1, 0, 0, 1, 8, 0]));
            g.fillStyle = 'red'; g.fill(b); g.fill(c);
            return {first: pixel(g, 1, 1), second: pixel(g, 9, 9), shifted: pixel(g, 9, 1),
                originalUntouched: (() => { const [, h] = fresh(); h.fillStyle = 'red'; h.fill(a); return pixel(h, 9, 9); })()};
        });
        await add('pathFromSVG', () => {
            const [, g] = fresh();
            const p = new Path2D('M0 0 L8 0 L8 8 L0 8 Z');
            g.fillStyle = 'red'; g.fill(p);
            return {inside: pixel(g, 2, 2), outside: pixel(g, 12, 12)};
        });
        await add('pathBadSVG', () => {
            const [, g] = fresh();
            const p = new Path2D('total nonsense');
            g.fillStyle = 'red'; g.fill(p);
            return pixel(g, 2, 2);
        });
        await add('pathCommands', () => {
            const [, g] = fresh(24, 24);
            const p = new Path2D();
            p.moveTo(2, 2); p.lineTo(20, 2); p.quadraticCurveTo(22, 10, 20, 20);
            p.bezierCurveTo(14, 24, 8, 24, 2, 20); p.closePath();
            p.moveTo(12, 12); p.arc(12, 12, 3, 0, Math.PI * 2);
            const q = new Path2D();
            q.ellipse(12, 12, 6, 4, 0.5, 0, Math.PI * 2);
            q.roundRect(1, 1, 6, 6, 2);
            q.arcTo(0, 0, 10, 10, 3);
            g.fillStyle = 'red'; g.fill(p, 'evenodd');
            g.fillStyle = 'blue'; g.fill(q);
            return Array.from(g.getImageData(0, 0, 24, 24).data).filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0);
        });
        await add('pathTransformed', () => {
            const [, g] = fresh();
            const p = new Path2D(); p.rect(0, 0, 4, 4);
            g.translate(8, 8); g.fillStyle = 'red'; g.fill(p);
            return {moved: pixel(g, 9, 9), origin: pixel(g, 1, 1)};
        });
        await add('pathErrors', () => {
            const [, g] = fresh();
            const p = new Path2D();
            const err = fn => { try { fn(); return null; } catch (e) { return e.name; } };
            return {
                fillPlain: err(() => g.fill({})),
                strokePlain: err(() => g.stroke({})),
                addPlain: err(() => p.addPath({})),
                negativeArc: err(() => p.arc(0, 0, -1, 0, 1)),
                negativeArcTo: err(() => p.arcTo(0, 0, 1, 1, -1)),
                negativeRound: err(() => p.roundRect(0, 0, 4, 4, -1)),
                construct: err(() => Path2D()),
            };
        });

        // ---------------- filter / lang -------------------------------------
        await add('filterDefault', () => {
            const [, g] = fresh();
            return {initial: g.filter, lang: g.lang, typeofLang: typeof g.lang};
        });
        await add('filterRoundTrip', () => {
            const [, g] = fresh();
            const out = {};
            for (const value of ['none', 'blur(4px)', 'BLUR(4PX)', 'grayscale(50%)',
                'drop-shadow(2px 2px 3px red)', 'opacity(0.5)', 'invert(1) blur(1px)',
                'not-a-filter', '', 'url(#x)']) {
                g.filter = value; out[value || '(empty)'] = g.filter;
            }
            g.filter = 'blur(2px)'; g.save(); g.filter = 'none'; g.restore();
            out.restored = g.filter;
            g.reset(); out.afterReset = g.filter;
            return out;
        });
        await add('filterBlurPixels', () => {
            const [, g] = fresh(32, 32);
            g.filter = 'blur(3px)';
            g.fillStyle = 'red'; g.fillRect(8, 8, 16, 16);
            return {center: pixel(g, 16, 16), edge: pixel(g, 8, 8), outside: pixel(g, 4, 16)};
        });
        await add('filterGrayscalePixels', () => {
            const [, g] = fresh();
            g.filter = 'grayscale(1)';
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            return pixel(g, 2, 2);
        });
        await add('filterOpacityPixels', () => {
            const [, g] = fresh();
            g.filter = 'opacity(0.5)';
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            return pixel(g, 2, 2);
        });
        await add('filterDropShadowPixels', () => {
            const [, g] = fresh(32, 32);
            g.filter = 'drop-shadow(6px 6px 0 blue)';
            g.fillStyle = 'red'; g.fillRect(4, 4, 8, 8);
            return {source: pixel(g, 6, 6), shadow: pixel(g, 14, 14)};
        });
        await add('filterOnText', () => {
            const [, g] = fresh(48, 24);
            g.filter = 'blur(1px)';
            g.fillStyle = 'red'; g.font = '16px Arial'; g.fillText('M', 4, 18);
            return Array.from(g.getImageData(0, 0, 48, 24).data).filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0);
        });
        await add('langRoundTrip', () => {
            const [, g] = fresh();
            const out = {initial: g.lang};
            g.lang = 'ja'; out.set = g.lang;
            g.lang = 'inherit'; out.inherit = g.lang;
            g.save(); g.lang = 'de'; g.restore(); out.restored = g.lang;
            g.reset(); out.afterReset = g.lang;
            return out;
        });

        // ---------------- ImageBitmapRenderingContext -----------------------
        await add('bitmapRendererShape', () => {
            const c = new Canvas(8, 8);
            const r = c.getContext('bitmaprenderer');
            return {tag: Object.prototype.toString.call(r), own: names(r),
                proto: names(Object.getPrototypeOf(r)), canvas: r.canvas === c,
                cached: c.getContext('bitmaprenderer') === r,
                second: c.getContext('2d'),
                global: typeof globalThis.ImageBitmapRenderingContext};
        });
        await add('bitmapRendererTransfer', async () => {
            const source = new Canvas(8, 8);
            const sg = source.getContext('2d');
            sg.fillStyle = 'red'; sg.fillRect(0, 0, 4, 8);
            const bitmap = source.transferToImageBitmap();
            const target = new Canvas(8, 8);
            const r = target.getContext('bitmaprenderer');
            r.transferFromImageBitmap(bitmap);
            const blob = await target.convertToBlob();
            return {bitmapAfter: [bitmap.width, bitmap.height], blobType: blob.type,
                blobSize: blob.size > 0};
        });
        await add('bitmapRendererClear', () => {
            const target = new Canvas(8, 8);
            const r = target.getContext('bitmaprenderer');
            const err = (() => { try { r.transferFromImageBitmap(null); return null; } catch (e) { return e.name; } })();
            const bad = (() => { try { r.transferFromImageBitmap({}); return null; } catch (e) { return e.name; } })();
            const none = (() => { try { r.transferFromImageBitmap(); return null; } catch (e) { return e.name; } })();
            return {nullArg: err, plainObject: bad, noArg: none,
                size: [target.width, target.height]};
        });
        await add('bitmapRendererResize', () => {
            const source = new Canvas(4, 6);
            source.getContext('2d').fillRect(0, 0, 1, 1);
            const bitmap = source.transferToImageBitmap();
            const target = new Canvas(16, 16);
            target.getContext('bitmaprenderer').transferFromImageBitmap(bitmap);
            return {size: [target.width, target.height], detached: [bitmap.width, bitmap.height]};
        });

        // ---------------- createImageBitmap ---------------------------------
        await add('createBitmapShape', () => typeof createImageBitmap);
        await add('createBitmapFromCanvas', async () => {
            const [c, g] = fresh(8, 8);
            g.fillStyle = 'red'; g.fillRect(0, 0, 4, 8);
            const b = await createImageBitmap(c);
            const [, h] = fresh(8, 8);
            h.drawImage(b, 0, 0);
            return {size: [b.width, b.height], tag: Object.prototype.toString.call(b),
                left: pixel(h, 1, 1), right: pixel(h, 6, 1)};
        });
        await add('createBitmapFromImageData', async () => {
            const [, g] = fresh(4, 4);
            const d = g.createImageData(2, 2);
            d.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
            const b = await createImageBitmap(d);
            const [, h] = fresh(4, 4);
            h.drawImage(b, 0, 0);
            return {size: [b.width, b.height], first: pixel(h, 0, 0), second: pixel(h, 1, 0)};
        });
        await add('createBitmapFromBitmap', async () => {
            const [c, g] = fresh(4, 4);
            g.fillStyle = 'red'; g.fillRect(0, 0, 4, 4);
            const first = c.transferToImageBitmap();
            const b = await createImageBitmap(first);
            return {size: [b.width, b.height], sourceStillOpen: [first.width, first.height]};
        });
        await add('createBitmapCropped', async () => {
            const [c, g] = fresh(8, 8);
            g.fillStyle = 'red'; g.fillRect(0, 0, 4, 4);
            g.fillStyle = 'blue'; g.fillRect(4, 0, 4, 4);
            const b = await createImageBitmap(c, 4, 0, 4, 4);
            const [, h] = fresh(8, 8);
            h.drawImage(b, 0, 0);
            return {size: [b.width, b.height], pixel: pixel(h, 1, 1)};
        });
        await add('createBitmapOptions', async () => {
            const [c, g] = fresh(8, 8);
            g.fillStyle = 'red'; g.fillRect(0, 0, 8, 8);
            const b = await createImageBitmap(c, {resizeWidth: 4, resizeHeight: 2});
            return [b.width, b.height];
        });
        await add('createBitmapFromBlob', async () => {
            const [c, g] = fresh(4, 4);
            g.fillStyle = 'red'; g.fillRect(0, 0, 2, 4);
            const blob = await c.convertToBlob();
            const b = await createImageBitmap(blob);
            const [, h] = fresh(4, 4);
            h.drawImage(b, 0, 0);
            return {size: [b.width, b.height], left: pixel(h, 0, 0), right: pixel(h, 3, 0)};
        });
        await add('createBitmapErrors', async () => {
            const fail = async fn => { try { await fn(); return null; } catch (e) { return e.name; } };
            return {
                plain: await fail(() => createImageBitmap({})),
                none: await fail(() => createImageBitmap()),
                zeroCrop: await fail(() => createImageBitmap(new Canvas(4, 4), 0, 0, 0, 0)),
                closed: await fail(async () => {
                    const [c, g] = fresh(4, 4); g.fillRect(0, 0, 1, 1);
                    const b = c.transferToImageBitmap(); b.close();
                    return createImageBitmap(b);
                }),
                emptyBlob: await fail(() => createImageBitmap(new Blob([new Uint8Array([1, 2, 3])], {type: 'image/png'}))),
            };
        });

        // ---------------- convertToBlob encodings ---------------------------
        for (const [name, options] of [
            ['png', undefined], ['jpeg', {type: 'image/jpeg'}],
            ['jpegQuality', {type: 'image/jpeg', quality: 0.2}],
            ['webp', {type: 'image/webp'}],
            ['webpQuality', {type: 'image/webp', quality: 0.3}],
            ['upperCase', {type: 'IMAGE/JPEG'}],
            ['unsupported', {type: 'image/tiff'}],
            ['badQuality', {type: 'image/jpeg', quality: 5}],
        ]) await add('encode_' + name, async () => {
            const [c, g] = fresh(8, 8);
            g.fillStyle = 'red'; g.fillRect(0, 0, 4, 8);
            g.fillStyle = 'rgba(0,0,255,0.5)'; g.fillRect(4, 0, 4, 8);
            const blob = await c.convertToBlob(options);
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return {type: blob.type, header: Array.from(bytes.slice(0, 4)), nonEmpty: bytes.length > 16};
        });
        await add('encodeRoundTrip', async () => {
            const [c, g] = fresh(8, 8);
            g.fillStyle = '#ff0000'; g.fillRect(0, 0, 8, 8);
            const out = {};
            for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
                const b = await createImageBitmap(await c.convertToBlob({type, quality: 1}));
                const [, h] = fresh(8, 8);
                h.drawImage(b, 0, 0);
                const p = pixel(h, 4, 4);
                out[type] = {size: [b.width, b.height], red: p[0] > 200, green: p[1] < 60, alpha: p[3]};
            }
            return out;
        });

        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runProbeCases;
    else globalThis.__canvasResult = runProbeCases(OffscreenCanvas);
})();
