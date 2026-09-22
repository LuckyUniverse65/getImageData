'use strict';
(function () {
    const generics = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
    function fontSample(Canvas, family) {
        const c = new Canvas(192, 48), g = c.getContext('2d');
        g.font = '16px ' + family;
        g.fillStyle = '#174cb5';
        g.fillText('Canvas 123', 2, 24);
        const result = {width: g.measureText('Canvas 123').width,
            pixels: Array.from(g.getImageData(0, 0, 192, 48).data)};
        c.width = 0;
        return result;
    }
    function shapeSample(Canvas) {
        const c = new Canvas(48, 40), g = c.getContext('2d');
        const gradient = g.createLinearGradient(0, 0, 40, 30);
        gradient.addColorStop(0, '#f43862'); gradient.addColorStop(1, '#1b78e1');
        g.fillStyle = gradient; g.rotate(0.17); g.fillRect(4.1, 3.7, 29.6, 21.2);
        g.filter = 'blur(1px)'; g.fillStyle = 'rgba(27,198,70,.53)';
        g.beginPath(); g.arc(27.2, 19.7, 10.3, 0, 5.7); g.fill();
        const result = Array.from(g.getImageData(0, 0, 48, 40).data);
        c.width = 0;
        return result;
    }
    async function run(Canvas) {
        const fonts = Object.fromEntries(generics.map(name => [name, fontSample(Canvas, name)]));
        let environment;
        if (typeof navigator !== 'undefined') {
            const c = new Canvas(1, 1), gl = c.getContext('webgl');
            const extension = gl?.getExtension('WEBGL_debug_renderer_info');
            environment = {userAgent: navigator.userAgent, language: navigator.language,
                languages: navigator.languages, devicePixelRatio: globalThis.devicePixelRatio,
                webglVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
                webglRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
                note: 'WebGL renderer is not proof of the Canvas 2D backend.',
                userAgentData: await navigator.userAgentData?.getHighEntropyValues(['architecture','bitness','platformVersion','fullVersionList'])};
        }
        return {fonts, shape: shapeSample(Canvas), environment};
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = {run, fontSample, shapeSample, generics};
    else globalThis.__canvasResult = run(OffscreenCanvas);
})();
