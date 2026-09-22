(function () {
    // Focused probe: the exact bitmaprenderer presentation and blank-mode model.
    async function runProbeCases(Canvas) {
        const results = {};
        const add = async (name, fn) => {
            try { results[name] = await fn(); }
            catch (e) { results[name] = {threw: e.name, message: String(e.message).slice(0, 140)}; }
        };
        const probePixels = (canvas, w, h) => {
            const out = new Canvas(w, h), g = out.getContext('2d');
            g.drawImage(canvas, 0, 0);
            return {tl: Array.from(g.getImageData(0, 0, 1, 1).data),
                    mid: Array.from(g.getImageData(w >> 1, h >> 1, 1, 1).data),
                    br: Array.from(g.getImageData(w - 1, h - 1, 1, 1).data)};
        };
        const filled = (w, h, colour) => {
            const c = new Canvas(w, h), g = c.getContext('2d');
            g.fillStyle = colour; g.fillRect(0, 0, w, h);
            return c.transferToImageBitmap();
        };

        for (const [name, canvasSize, bitmapSize] of [
            ['same', [8, 8], [8, 8]],
            ['smaller', [16, 16], [4, 4]],
            ['larger', [4, 4], [16, 16]],
            ['wider', [8, 8], [16, 4]],
        ]) await add('present_' + name, () => {
            const target = new Canvas(canvasSize[0], canvasSize[1]);
            target.getContext('bitmaprenderer').transferFromImageBitmap(filled(bitmapSize[0], bitmapSize[1], 'red'));
            return {canvas: [target.width, target.height],
                    probe: probePixels(target, canvasSize[0], canvasSize[1])};
        });

        await add('blank_afterNull', () => {
            const target = new Canvas(8, 8);
            const renderer = target.getContext('bitmaprenderer');
            renderer.transferFromImageBitmap(filled(8, 8, 'red'));
            renderer.transferFromImageBitmap(null);
            return probePixels(target, 8, 8);
        });
        await add('blank_never', () => {
            const target = new Canvas(8, 8);
            target.getContext('bitmaprenderer');
            return probePixels(target, 8, 8);
        });
        await add('blank_afterResize', () => {
            const target = new Canvas(8, 8);
            const renderer = target.getContext('bitmaprenderer');
            renderer.transferFromImageBitmap(filled(8, 8, 'red'));
            target.width = 8;
            return probePixels(target, 8, 8);
        });
        await add('blank_afterResizeDifferent', () => {
            const target = new Canvas(8, 8);
            const renderer = target.getContext('bitmaprenderer');
            renderer.transferFromImageBitmap(filled(8, 8, 'red'));
            target.width = 12;
            return {canvas: [target.width, target.height], probe: probePixels(target, 12, 8)};
        });
        await add('blank_alphaFalse', () => {
            const target = new Canvas(8, 8);
            target.getContext('bitmaprenderer', {alpha: false});
            return probePixels(target, 8, 8);
        });
        await add('blank_transferAlphaFalse', () => {
            const target = new Canvas(8, 8);
            const renderer = target.getContext('bitmaprenderer', {alpha: false});
            renderer.transferFromImageBitmap(filled(8, 8, 'rgba(255, 0, 0, 0.5)'));
            return probePixels(target, 8, 8);
        });
        await add('transferAlphaKept', () => {
            const target = new Canvas(8, 8);
            target.getContext('bitmaprenderer').transferFromImageBitmap(filled(8, 8, 'rgba(255, 0, 0, 0.5)'));
            return probePixels(target, 8, 8);
        });
        await add('blank_readBack', async () => {
            const target = new Canvas(8, 8);
            target.getContext('bitmaprenderer');
            const blob = await target.convertToBlob();
            const bitmap = await createImageBitmap(blob);
            const out = new Canvas(8, 8), g = out.getContext('2d');
            g.drawImage(bitmap, 0, 0);
            return Array.from(g.getImageData(0, 0, 1, 1).data);
        });
        await add('transferThenTransferOut', () => {
            const target = new Canvas(8, 8);
            const renderer = target.getContext('bitmaprenderer');
            renderer.transferFromImageBitmap(filled(4, 4, 'red'));
            const out = target.transferToImageBitmap();
            return {size: [out.width, out.height], after: probePixels(target, 8, 8)};
        });

        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runProbeCases;
    else globalThis.__canvasResult = runProbeCases(OffscreenCanvas);
})();
