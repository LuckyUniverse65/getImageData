# 5sFramework：直接替换 Canvas 实现

本文只给出手动修改的位置和代码，没有修改 `D:\python\5sFramework`。适用于普通 Node.js 运行；本地 Canvas 包要求 Windows 10/11 x64、Node.js 22 或更高版本。EXE 打包中的原生模块加载不在本文范围内。

你的理解基本正确：`HTMLCanvasElement.getContext()` 中，将 `2d` 分支改为取得真实绘画上下文即可；需要位图上下文时，同样替换 `bitmaprenderer` 分支。WebGL/WebGPU 分支继续使用框架原实现。

但不能只改这一处：宽高 setter、导出方法也必须使用同一张原生画布。否则修改宽高不会清空真实画布，`toDataURL()` 仍会返回原来的固定字符串。

## 1. 哪些需要直接覆盖

| 接口或方法 | 修改方式 |
| --- | --- |
| `OffscreenCanvas` | 将全局构造函数替换为包里的构造函数；它的实例方法随之生效 |
| `CanvasRenderingContext2D`、`OffscreenCanvasRenderingContext2D` | 替换全局接口引用；上下文必须通过真实 Canvas 的 `getContext()` 创建 |
| `ImageData`、`ImageBitmap`、`ImageBitmapRenderingContext` | 替换全局接口引用，配合真实像素/位图对象 |
| `CanvasGradient`、`CanvasPattern`、`TextMetrics`、`Path2D` | 替换全局接口引用 |
| `createImageBitmap` | 可以直接使用包里的函数；传入框架 HTMLCanvasElement 时，先转换为对应的原生画布 |
| `DOMMatrix`、`DOMMatrixReadOnly`、`DOMPoint`、`DOMPointReadOnly`、`Float16Array` | 有相关调用时一并使用包里的类型；这些是共享接口，也应检查框架其他使用方 |
| `HTMLCanvasElement` 构造函数及 DOM 继承 | 保留，继续让 `document.createElement('canvas')` 创建框架元素 |
| `HTMLCanvasElement.getContext` | 替换 `2d`/`bitmaprenderer` 创建路径；保留其他分支和上下文缓存 |
| `HTMLCanvasElement.width/height` setter | 同步原生画布；即使赋相同值也必须执行，以重置画布 |
| `HTMLCanvasElement.toDataURL/toBlob` | 改成编码真实像素；包里的 HTMLCanvasElement 当前没有这两个方法，不能直接赋值复制 |
| `HTMLCanvasElement.transferControlToOffscreen` | 从关联的原生 HTMLCanvasElement 转移；不能再独立创建一张无关联画布 |
| `fillText/fillRect/getImageData/measureText` 等绘画方法 | 不需要逐个改。返回真实上下文后，自然调用包里的实现 |

“覆盖全局接口引用”不等于把原生原型方法复制到框架的假对象上。后者缺少原生内部状态，会导致 `Illegal invocation` 或其他类型错误。

## 2. 先确认修改的是实际加载的文件

2026-10-20 检查到的代码位置：

| 运行方式 | 修改位置 |
| --- | --- |
| `main/main_ck.js` 或 `main/main_tk.js` | 宿主初始化在对应入口；HTML Canvas 实现在 `env/htmlElements/HTMLCanvasElement.js`；全局覆盖放在 `envCode` 之后、`globalVarCode` 之前 |
| 当前服务入口 | `server/server.js` 第 216 行读取 `env_new.js`；HTML Canvas 实现在 `server/env_new.js`，搜索 `HTMLCanvasElement = function`，检查时约第 36441 行 |
| 服务中的宿主包加载 | `server/worker.js` 内，每次创建 `vm65` 对象后、运行 VM 之前 |
| 子 VM | `tools/toolsFunc.js` 的 `new_environment_run()`；服务副本在 `server/env_new.js` 内同名函数 |

当前 `server/env_new.js` 末尾已有 `installCanvasBridge` 定义及调用（检查时约第 43136～43414 行）。选择本文的直接修改方式后，应手动移除那一整段旧桥接安装代码，避免它再次覆盖本文修改。不要同时运行两套方案。当前项目中的 `integration/5sFramework/canvas-bridge.js` 也不需要加载。

以下所有代码块均是给你粘贴到指定位置的片段，不是让你直接执行整个 Markdown 文件。

## 3. 在 Node 宿主准备包和导出工具

如果还没安装，在 5sFramework 目录执行：

```powershell
npm install "D:\python\getImageData\dist\canvas-0.1.0-local.20260922054335927.tgz"
```

在实际使用的入口中，紧接 `vm65` 对象创建完成之后加入以下代码。服务模式放到 `server/worker.js`，不是只放在 `server/server.js`。已有 `canvasBackend` 加载时复用，不重复添加。

<!-- snippet: host -->
```js
vm65.memory.canvasBackend = require('canvas');
vm65.memory.canvasHost = {
    encode(canvas, type, quality) {
        if (!canvas.width || !canvas.height) return null;
        if (typeof type === 'symbol') throw new TypeError('Invalid image type');
        type = type === undefined ? 'image/png' : String(type).toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) type = 'image/png';
        const backend = vm65.memory.canvasBackend;
        const bytes = backend.encodeImage(
            canvas[backend.canvasPixels](), canvas.width, canvas.height, type,
            typeof quality === 'number' && quality >= 0 && quality <= 1 ? quality : undefined
        );
        return bytes ? { bytes, type } : null;
    },
    toDataURL(canvas, type, quality) {
        const result = this.encode(canvas, type, quality);
        return result
            ? `data:${result.type};base64,${Buffer.from(result.bytes).toString('base64')}`
            : 'data:,';
    },
    toBlob(canvas, callback, type, quality) {
        if (typeof callback !== 'function') throw new TypeError('Callback must be a function');
        const result = this.encode(canvas, type, quality);
        const { Blob } = require('node:buffer');
        const blob = result ? new Blob([result.bytes], { type: result.type }) : null;
        setImmediate(() => callback(blob));
    }
};
```

以上工具支持普通尺寸的 PNG/JPEG/WebP 导出。底层编码异常会向上抛出；零尺寸或编码返回空值时，分别得到 `data:,` 或回调参数 `null`。它没有实现浏览器的全部超大尺寸裁剪规则和来源污染检查。

如果会创建子 VM，在创建好 `vm65_` 后、执行子 VM 脚本前，增加：

```js
vm65_.memory.canvasBackend = vm65.memory.canvasBackend;
vm65_.memory.canvasHost = vm65.memory.canvasHost;
```

服务 `env_new.js` 中已存在第一行时，只补缺少的第二行。

## 4. 覆盖全局 Canvas 接口

下面片段必须在 **VM 内、所有原环境接口定义完成后、业务代码运行前** 执行一次。不能在 Node 主进程中覆盖 `globalThis` 后就认为 VM 也已覆盖。

对于服务，可放在 `server/env_new.js` 的末尾，替代旧桥接安装段。对于 main 入口，把这段代码作为字符串插入 `${envCode}` 与 `${globalVarCode}` 之间。

<!-- snippet: globals -->
```js
(() => {
    const backend = Object.vm65.memory.canvasBackend;
    for (const name of [
        'OffscreenCanvas', 'CanvasRenderingContext2D',
        'OffscreenCanvasRenderingContext2D', 'ImageBitmapRenderingContext',
        'ImageData', 'ImageBitmap', 'CanvasGradient', 'CanvasPattern', 'TextMetrics',
        'Path2D', 'DOMMatrix', 'DOMMatrixReadOnly', 'DOMPoint', 'DOMPointReadOnly',
        'Float16Array'
    ]) {
        globalThis[name] = backend[name];
    }
    globalThis.createImageBitmap = function (...args) {
        if (args.length && args[0] instanceof HTMLCanvasElement) {
            args[0] = Object.vm65.toolsFunc.getNativeCanvas(args[0]);
        }
        return backend.createImageBitmap(...args);
    };
})();
```

注意：直接替换 `OffscreenCanvas` 后，它的 WebGL 行为也会使用包内实现，不再使用框架旧的 Offscreen WebGL 分支。如果你还依赖旧的 **OffscreenCanvas WebGL/WebGPU**，不要整类覆盖 OffscreenCanvas，需要另外保留这些分支。本文保留的是 HTMLCanvasElement 的 WebGL/WebGPU 分支。

## 5. 在 HTMLCanvasElement 文件里增加一个关联函数

找到原文件内的 `let vm65 = Object.vm65;`，紧接着加入以下代码，放在 `HTMLCanvasElement.prototype = { ... }` 之前。

<!-- snippet: helpers -->
```js
const backend = vm65.memory.canvasBackend;
const nativeCanvases = new WeakMap();
const transferred = new WeakSet();

function getNativeCanvas(element) {
    if (!HTMLCanvasElement.prototype.isPrototypeOf(element)) {
        throw new TypeError('Illegal invocation');
    }
    let canvas = nativeCanvases.get(element);
    if (!canvas) {
        canvas = new backend.HTMLCanvasElement(element.width, element.height);
        nativeCanvases.set(element, canvas);
    }
    return canvas;
}
vm65.toolsFunc.getNativeCanvas = getNativeCanvas;

function requireUntransferred(element) {
    if (transferred.has(element)) {
        throw new DOMException('Canvas control was transferred', 'InvalidStateError');
    }
}

function requireExportable(element) {
    const type = vm65.toolsFunc.getProtoArr.call(element, 'contextType');
    if (type && type !== '2d' && type !== 'bitmaprenderer') {
        throw new DOMException('Export of framework WebGL/WebGPU is not implemented', 'NotSupportedError');
    }
    return getNativeCanvas(element);
}
```

这张 WeakMap 只是保证每个框架元素对应一张真实画布。不能在每次 `getContext()` 时新建画布，否则之前的绘画会丢失。

## 6. 替换 getContext 方法

用以下方法替换原来的 `getContext(type, contextAttributes) { ... }`。放在原来的 prototype 对象字面量内，保留末尾逗号。

<!-- snippet: getContext -->
```js
getContext(type, contextAttributes) {
    if (!HTMLCanvasElement.prototype.isPrototypeOf(this)) throw new TypeError('Illegal invocation');
    if (!arguments.length) throw new TypeError('getContext requires a context id');
    if (typeof type === 'symbol') throw new TypeError('Invalid context type');
    requireUntransferred(this);
    type = String(type);
    const current = vm65.toolsFunc.getProtoArr.call(this, 'context');
    if (current) {
        return vm65.toolsFunc.getProtoArr.call(this, 'contextType') === type ? current : null;
    }

    let context;
    const realCanvasContext = type === '2d' || type === 'bitmaprenderer';
    if (realCanvasContext) {
        context = getNativeCanvas(this).getContext(type, contextAttributes);
        if (!context) return null;
        const element = this;
        Object.defineProperty(context, 'canvas', {
            get() { return element; }, configurable: true
        });
        // Convert framework canvas sources for drawImage/createPattern.
        for (const name of ['drawImage', 'createPattern']) {
            const original = context[name];
            if (typeof original !== 'function') continue;
            Object.defineProperty(context, name, {
                value: function (...args) {
                    if (args.length && args[0] instanceof HTMLCanvasElement) {
                        args[0] = getNativeCanvas(args[0]);
                    }
                    return Reflect.apply(original, this, args);
                }, writable: true, configurable: true
            });
        }
    } else {
        switch (type) {
            case 'webgl':
                context = vm65.toolsFunc.createProxyObj(WebGLRenderingContext, 'context_webgl');
                break;
            case 'webgl2':
                context = vm65.toolsFunc.createProxyObj(WebGL2RenderingContext, 'context_webgl2');
                break;
            case 'webgpu':
                context = vm65.toolsFunc.createProxyObj(GPUCanvasContext, 'context_webgpu');
                break;
            default:
                return null;
        }
        if (type !== 'webgpu') {
            vm65.toolsFunc.setProtoArr.call(context, 'contextAttributes', Object.assign(
                {}, vm65.toolsFunc.getProtoArr.call(context, 'contextAttributes'), contextAttributes
            ));
        }
        vm65.toolsFunc.setProtoArr.call(context, 'canvas', this);
    }
    vm65.toolsFunc.setProtoArr.call(this, 'context', context);
    vm65.toolsFunc.setProtoArr.call(this, 'contextType', type);
    return context;
},
```

重点：原来的 `setProtoArr.call(context, 'contextAttributes', ...)` 和 `'canvas'` 赋值只能留在框架上下文分支。真实 2D 上下文的参数已传给原生 `getContext`，不能继续依赖框架的 SymbolData 来配置它。

这份简化代码把 `canvas` 和两个来源转换方法定义在上下文实例上，保证普通调用可用；属性归属、函数外观等反射结果不完全等同浏览器。若要求这些细节，也就需要之前桥接层中的额外适配。

## 7. 修改两个宽高 setter

原来的 `get width()`、`get height()` 保留。只替换 setter：

<!-- snippet: dimensions -->
```js
set width(value) {
    if (!HTMLCanvasElement.prototype.isPrototypeOf(this)) throw new TypeError('Illegal invocation');
    requireUntransferred(this);
    value = Number(value) >>> 0;
    value = value > 2147483647 ? 300 : value;
    const canvas = nativeCanvases.get(this);
    if (canvas) canvas.width = value;
    vm65.toolsFunc.setProtoArr.call(this, 'width', value);
},
set height(value) {
    if (!HTMLCanvasElement.prototype.isPrototypeOf(this)) throw new TypeError('Illegal invocation');
    requireUntransferred(this);
    value = Number(value) >>> 0;
    value = value > 2147483647 ? 150 : value;
    const canvas = nativeCanvases.get(this);
    if (canvas) canvas.height = value;
    vm65.toolsFunc.setProtoArr.call(this, 'height', value);
},
```

不要加“值没有变化就跳过”的判断：`canvas.width = canvas.width` 也应清空内容、重置绘画状态。

如果代码通过 `setAttribute('width', ...)`、HTML 字符串或属性节点修改尺寸，还要让这些 DOM 路径最终同步到上述 setter，并按 HTML 属性规则解析尺寸。本文片段只接通直接赋值 `canvas.width/height` 的路径，不把完整 DOM 属性同步混入 Canvas 接入。

## 8. 替换导出和转移方法

在同一个 prototype 对象字面量内替换这三个方法：

<!-- snippet: exports -->
```js
toDataURL(type, quality) {
    return vm65.memory.canvasHost.toDataURL(requireExportable(this), type, quality);
},
toBlob(callback, type, quality) {
    vm65.memory.canvasHost.toBlob(requireExportable(this), callback, type, quality);
},
transferControlToOffscreen() {
    const canvas = getNativeCanvas(this);
    requireUntransferred(this);
    if (vm65.toolsFunc.getProtoArr.call(this, 'context')) {
        throw new DOMException('Canvas already has a context', 'InvalidStateError');
    }
    const result = canvas.transferControlToOffscreen();
    transferred.add(this);
    return result;
},
```

`toDataURL()` 不再读 `vm65.memory.canvas_base64`。绘画、像素读取、图片导出都来自同一张真实画布。

`captureStream()` 不属于当前包支持范围，不用假装替换后已经实现。

## 9. 修改后在 VM 中检查

在环境定义、全局覆盖均执行完成后，运行：

<!-- snippet: smoke -->
```js
(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 1, 1);
    console.log(Array.from(ctx.getImageData(0, 0, 2, 1).data));
    // [255, 0, 0, 255, 0, 0, 0, 0]
    console.log(ctx.canvas === canvas);                    // true
    console.log(ctx instanceof CanvasRenderingContext2D);  // true
    console.log(ctx === canvas.getContext('2d'));          // true
    console.log(canvas.getContext('webgl'));               // null
    console.log(canvas.toDataURL().startsWith('data:image/png;base64,')); // true
    canvas.width = canvas.width;
    console.log(Array.from(ctx.getImageData(0, 0, 1, 1).data)); // [0, 0, 0, 0]
})();
```

## 10. 这份简化方案的范围

- 普通文字/形状绘画、像素读写、直接宽高赋值和常规图片导出，是本文接通的路径。
- 原 `document.createElement('canvas')` 分支和 HTMLElement 继承保留，不需要把整个 DOM Canvas 类型替换掉。
- 不要再用 `createProxyObj(CanvasRenderingContext2D)` 创建 2D 上下文；原生接口是非法构造器，必须通过真实 Canvas 获取。
- 框架 HTMLImageElement、HTMLVideoElement 作为图像源还需要转换；本文只转换 HTMLCanvasElement 来源。原生 Offscreen 上下文接收框架 Canvas 时，也需显式调用 `getNativeCanvas(source)`。
- VM 与宿主的 Uint8ClampedArray、Blob 等不是同一套构造函数，`instanceof` 检查可能不同。本文没有做跨 realm 类型适配；需要时可用像素值验证，不应据此宣称全部浏览器类型行为一致。
- 包内 OffscreenCanvas 不会因为覆盖全局名字就自动获得框架 EventTarget 的全部行为。

依据：框架原 `getContext` 使用 `createProxyObj` 创建占位上下文，`toDataURL` 返回固定的 `memory.canvas_base64`；本项目 `readme.md` 的 API 清单与 `index.js` 表明包里的 HTMLCanvasElement 有真实绘画及转移能力，但无 `toDataURL/toBlob`。所以修改路径是替换创建来源、同步尺寸、真实编码，而不是逐个重写绘画方法。

验证记录：已提取本文代码块，在内存中替换框架真实 `HTMLCanvasElement.js` 的对应实现，并用最小 DOM/vm65 支撑环境执行。像素读写、PNG 编解码、toBlob、尺寸重置、上下文缓存与互斥、ctx.canvas、保留 HTML WebGL 分支、Offscreen 转移、Canvas 图像源转换均通过。测试未写入 5sFramework，也没有运行完整框架、业务脚本或 EXE；这不是完整框架验收结论。
