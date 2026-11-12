'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const native = require('canvas');
const { installCanvasBridge } = require('./canvas-bridge.js');
const frameworkRoot = process.argv[2] || path.resolve(__dirname, '../../../5sFramework');
const htmlSource = fs.readFileSync(path.join(frameworkRoot, 'env/htmlElements/HTMLCanvasElement.js'), 'utf8');
let checks = 0;

function realm() {
    const context = vm.createContext({ installCanvasBridge, DOMException });
    // A small framework fixture; only HTMLCanvasElement.js is loaded from the real project.
    // This deliberately does not execute any server, target script or network request.
    vm.runInContext(`
        const storage = Symbol('fixture');
        Object.vm65 = { memory: { SymbolData: storage }, config: { print: false }, toolsFunc: {
            getProtoArr(key) { return this[storage]?.[key]; },
            setProtoArr(key, value) { (this[storage] ||= {})[key] = value; },
            createProxyObj(Type) { return new Type('new_65'); },
            safeProto(Type, name) {
                Object.defineProperty(Type.prototype, 'constructor', {value:Type, configurable:true});
                Object.defineProperty(Type.prototype, Symbol.toStringTag, {value:name, configurable:true});
            },
            defineProperty(object, key, descriptor) { Object.defineProperty(object, key, descriptor); },
            throwError(name, message) { throw new TypeError(message); }
        }};
        class HTMLElement {
            setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
            getAttribute(name) { return this.attributes?.[name] ?? null; }
        }
        globalThis.HTMLElement = HTMLElement;
        for (const name of ['CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'GPUCanvasContext', 'ImageBitmapRenderingContext']) {
            globalThis[name] = class { constructor() { this[storage] = {contextAttributes:{}}; } };
        }
        globalThis.document = {createElement(name) {
            if (name !== 'canvas') throw new Error('Fixture only supports canvas');
            return new HTMLCanvasElement('new_65');
        }};
    `, context);
    vm.runInContext(htmlSource, context, { filename: 'framework/HTMLCanvasElement.js' });
    vm.runInContext('globalThis.previousWebGL = WebGLRenderingContext; installCanvasBridge(globalThis, Object.vm65);', context);
    return context;
}

async function main() {
    const context = realm();
    const result = vm.runInContext(`(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 2; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 1, 1);
        const pixels = ctx.getImageData(0, 0, 2, 1);
        globalThis.testCanvas = canvas;
        globalThis.testContext = ctx;
        return {
            pixels: Array.from(pixels.data), html: canvas instanceof HTMLElement,
            owner: ctx.canvas === canvas, contextType: ctx instanceof CanvasRenderingContext2D,
            imageType: pixels instanceof ImageData, repeated: ctx === canvas.getContext('2d'),
            modeExclusive: canvas.getContext('webgl') === null,
            url: canvas.toDataURL(), foreignArray: pixels.data instanceof Uint8ClampedArray
        };
    })()`, context);
    assert.deepEqual(Array.from(result.pixels), [255, 0, 0, 255, 0, 0, 0, 0]);
    for (const name of ['html','owner','contextType','imageType','repeated','modeExclusive']) assert.equal(result[name], true, name);
    assert.deepEqual(Array.from(native.decodeImage(Buffer.from(result.url.split(',')[1], 'base64')).data), Array.from(result.pixels));
    assert.equal(result.foreignArray, true);
    assert.equal(vm.runInContext(`(() => {
        const image = testContext.getImageData(0,0,1,1);
        image.data[0]=0;image.data[1]=255;
        testContext.putImageData(image,1,0);
        const green=testContext.getImageData(1,0,1,1).data;
        const empty=new ImageData(1,1);
        return green[1]===255 && green[0]===0 && empty instanceof ImageData && empty.data instanceof Uint8ClampedArray;
    })()`,context), true);
    checks += 10;

    const blob = await vm.runInContext('new Promise(resolve => testCanvas.toBlob(resolve))', context);
    assert.equal(blob.type, 'image/png');
    assert.equal(native.decodeImage(new Uint8Array(await blob.arrayBuffer())).width, 2);
    const cropped = await vm.runInContext('createImageBitmap(testCanvas, 0, 0, 1, 1)', context);
    assert.equal(cropped.width, 1); cropped.close(); checks += 3;

    assert.equal(vm.runInContext(`(() => {
        const other = document.createElement('canvas'); other.width=2; other.height=1;
        const otherContext = other.getContext('2d');
        otherContext.drawImage(testCanvas,0,0);
        const direct = otherContext.getImageData(0,0,1,1).data;
        if (direct[0] !== 255 || direct[3] !== 255) return false;
        otherContext.fillStyle = otherContext.createPattern(testCanvas,'repeat');
        otherContext.fillRect(0,0,2,1);
        other.width = 2;
        if (other.getContext('2d') !== otherContext || otherContext.getImageData(0,0,1,1).data[3] !== 0) return false;
        other.setAttribute('height','3');
        return other.height === 3 && testCanvas.width === 2 && testContext.getImageData(0,0,1,1).data[3] === 255;
    })()`, context), true); checks++;

    assert.equal(vm.runInContext(`(() => {
        const canvas = document.createElement('canvas'); canvas.width=3; canvas.height=2;
        const offscreen = canvas.transferControlToOffscreen();
        const ctx = offscreen.getContext('2d');
        if (!(offscreen instanceof OffscreenCanvas) || !(ctx instanceof OffscreenCanvasRenderingContext2D) || ctx.canvas !== offscreen) return false;
        ctx.fillStyle='blue';ctx.fillRect(0,0,3,2);
        const bitmap=offscreen.transferToImageBitmap();
        const dest=document.createElement('canvas');
        const renderer=dest.getContext('bitmaprenderer');
        renderer.transferFromImageBitmap(bitmap);
        let blocked=false;try{canvas.getContext('2d');}catch(e){blocked=e.name==='InvalidStateError';}
        return blocked && renderer.canvas===dest && renderer instanceof ImageBitmapRenderingContext;
    })()`, context), true); checks++;

    assert.equal(vm.runInContext(`(() => {
        const canvas = document.createElement('canvas'); const gl=canvas.getContext('webgl');
        const offscreen=new OffscreenCanvas(2,2);const gpu=offscreen.getContext('webgpu');
        return previousWebGL===WebGLRenderingContext && gl instanceof WebGLRenderingContext &&
            canvas.getContext('2d')===null && gpu instanceof GPUCanvasContext && offscreen.getContext('2d')===null;
    })()`, context), true); checks++;

    const source = fs.readFileSync(path.resolve(__dirname, '../../demo/demo.js'), 'utf8');
    const draw = new Function('require', 'console', source + '\nreturn data;');
    const baseline = draw(() => native, { log() {} });
    const adapted = draw(() => ({ OffscreenCanvas: context.OffscreenCanvas }), { log() {} });
    assert.deepEqual(adapted, baseline); delete globalThis.data; checks++;

    const second = realm();
    assert.notEqual(context.OffscreenCanvas.prototype, second.OffscreenCanvas.prototype);
    assert.equal(vm.runInContext('testContext.canvas === testCanvas', context), true);
    checks += 2;
    console.log(JSON.stringify({checks, demoRGBAValues: baseline.length, demoMismatches:0,
        frameworkFixture:'real HTMLCanvasElement.js with minimal vm65/DOM scaffolding',
        crossRealmTypedArrayInstanceof:result.foreignArray,
        fullFrameworkValidated:false}, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
