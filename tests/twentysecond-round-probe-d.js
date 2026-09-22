(function () {
    // Focused probe: how ctx.filter reacts to the transform, and what the
    // convertToBlob encoders actually emit.
    async function runProbeCases(Canvas) {
        const results = {};
        const add = async (name, fn) => {
            try { results[name] = await fn(); }
            catch (e) { results[name] = {threw: e.name, message: String(e.message).slice(0, 140)}; }
        };
        const fresh = (w, h) => { const c = new Canvas(w, h); return [c, c.getContext('2d')]; };
        const row = (g, y, w) => {
            const data = g.getImageData(0, y, w, 1).data;
            return Array.from({length: w}, (_, x) => data[x * 4 + 3]);
        };

        // A blurred edge profile shows the effective device-space sigma.
        for (const [name, scale] of [['none', 1], ['double', 2], ['half', 0.5]])
            await add('blurProfile_' + name, () => {
                const [, g] = fresh(40, 8);
                g.scale(scale, scale);
                g.filter = 'blur(2px)';
                g.fillStyle = 'red';
                g.fillRect(10 / scale, 0, 20 / scale, 8 / scale);
                return row(g, 4, 40);
            });
        await add('blurProfile_rotated', () => {
            const [, g] = fresh(40, 40);
            g.translate(20, 20); g.rotate(Math.PI / 4); g.translate(-20, -20);
            g.filter = 'blur(2px)';
            g.fillStyle = 'red'; g.fillRect(12, 12, 16, 16);
            return row(g, 20, 40);
        });
        await add('dropShadowUnderScale', () => {
            const [, g] = fresh(40, 40);
            g.scale(2, 2);
            g.filter = 'drop-shadow(4px 0 0 blue)';
            g.fillStyle = 'red'; g.fillRect(2, 2, 6, 6);
            const data = g.getImageData(0, 10, 40, 1).data;
            return Array.from({length: 40}, (_, x) => data[x * 4 + 2]);
        });
        await add('blurUnderTranslate', () => {
            const [, g] = fresh(40, 8);
            g.translate(5, 0);
            g.filter = 'blur(2px)';
            g.fillStyle = 'red'; g.fillRect(5, 0, 20, 8);
            return row(g, 4, 40);
        });

        // Encoder identity: sizes and exact round trips reveal the settings.
        const sample = (w, h, alpha) => {
            const [c, g] = fresh(w, h);
            g.fillStyle = alpha ? 'rgba(255, 0, 0, 0.5)' : '#ff0000';
            g.fillRect(0, 0, w >> 1, h);
            g.fillStyle = alpha ? 'rgba(0, 0, 255, 0.25)' : '#0000ff';
            g.fillRect(w >> 1, 0, w >> 1, h);
            return c;
        };
        for (const type of ['image/jpeg', 'image/webp'])
            for (const quality of [undefined, 0, 0.5, 0.92, 1])
                await add(`size_${type.split('/')[1]}_${quality}`, async () => {
                    const blob = await sample(32, 32, false).convertToBlob(
                        quality === undefined ? {type} : {type, quality});
                    return blob.size;
                });
        await add('webpAlphaRoundTrip', async () => {
            const out = {};
            for (const quality of [undefined, 0.5, 1]) {
                const c = sample(8, 8, true);
                const blob = await c.convertToBlob(quality === undefined
                    ? {type: 'image/webp'} : {type: 'image/webp', quality});
                const bitmap = await createImageBitmap(blob);
                const [, h] = fresh(8, 8);
                h.drawImage(bitmap, 0, 0);
                out[String(quality)] = [Array.from(h.getImageData(1, 1, 1, 1).data),
                                        Array.from(h.getImageData(6, 1, 1, 1).data), blob.size];
            }
            return out;
        });
        await add('webpHeaderFourCC', async () => {
            const blob = await sample(8, 8, true).convertToBlob({type: 'image/webp'});
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return String.fromCharCode(...bytes.slice(8, 16));
        });
        await add('webpOpaqueFourCC', async () => {
            const blob = await sample(8, 8, false).convertToBlob({type: 'image/webp'});
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return String.fromCharCode(...bytes.slice(8, 16));
        });
        await add('jpegOpaqueRoundTrip', async () => {
            const c = sample(8, 8, false);
            const bitmap = await createImageBitmap(await c.convertToBlob({type: 'image/jpeg', quality: 1}));
            const [, h] = fresh(8, 8);
            h.drawImage(bitmap, 0, 0);
            return [Array.from(h.getImageData(1, 1, 1, 1).data), Array.from(h.getImageData(6, 1, 1, 1).data)];
        });

        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runProbeCases;
    else globalThis.__canvasResult = runProbeCases(OffscreenCanvas);
})();
