'use strict';

// Runs unchanged in Node and Chrome. Preserve complete bytes and decoded pixels.
(function () {
    async function run(Canvas, makeBitmap) {
        const results = {};
        async function sample(name, width, height, options, context = '2d', opaque = false) {
            const canvas = new Canvas(width, height);
            try {
                const ctx = context && canvas.getContext(context, {alpha: !opaque});
                if (context === '2d' && width && height) {
                    ctx.fillStyle = '#e43a76';
                    ctx.fillRect(0, 0, width, height);
                    ctx.clearRect(0, 0, 1, 1);
                    ctx.fillStyle = 'rgba(30,180,220,0.5)';
                    ctx.fillRect(1, 0, 2, height);
                }
                const blob = await canvas.convertToBlob(options);
                const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
                // Boundary images need only type/size/header, avoiding huge JSON captures.
                if (width > 100 || height > 100) {
                    const bitmap = await makeBitmap(blob);
                    results[name] = {type: blob.type, size: blob.size, header: bytes.slice(0, 16),
                        width: bitmap.width, height: bitmap.height};
                    bitmap.close();
                } else {
                    const bitmap = await makeBitmap(blob);
                    const output = new Canvas(bitmap.width, bitmap.height);
                    const outputCtx = output.getContext('2d');
                    outputCtx.drawImage(bitmap, 0, 0);
                    results[name] = {type: blob.type, size: blob.size, bytes,
                        width: bitmap.width, height: bitmap.height,
                        pixels: Array.from(outputCtx.getImageData(0, 0, bitmap.width, bitmap.height).data)};
                    bitmap.close();
                    output.width = 0;
                }
            } catch (error) {
                results[name] = {error: error.name};
            } finally {
                canvas.width = 0;
            }
        }
        for (const opaque of [false, true]) {
            const prefix = opaque ? 'opaque-' : 'alpha-';
            for (const type of [undefined, 'image/png', 'image/jpeg', 'image/webp', 'image/unsupported']) {
                for (const quality of [undefined, 0, 0.5, 1, -1, 2]) {
                    await sample(prefix + String(type) + '-' + String(quality), 7, 5, {type, quality}, '2d', opaque);
                }
            }
        }
        for (const [name, width, height, type] of [
            ['webp-limit', 16383, 1, 'image/webp'],
            ['webp-over-width', 16384, 1, 'image/webp'],
            ['webp-over-height', 1, 16384, 'image/webp'],
            ['webp-over-width-rows', 16384, 3, 'image/webp'],
            ['png-same-width', 16384, 1, 'image/png'],
            ['jpeg-limit', 65500, 1, 'image/jpeg'],
            ['jpeg-over-width', 65501, 1, 'image/jpeg'],
            ['jpeg-over-width-rows', 65501, 3, 'image/jpeg'],
            ['jpeg-over-height', 1, 65501, 'image/jpeg'],
            ['png-same-large-width', 65501, 1, 'image/png'],
            ['zero-width', 0, 1, 'image/png']
        ]) await sample(name, width, height, {type});
        await sample('no-context', 1, 1, {}, null);
        await sample('empty-bitmaprenderer', 1, 1, {}, 'bitmaprenderer');
        return results;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = run;
    else globalThis.__canvasResult = run(OffscreenCanvas, createImageBitmap);
})();
