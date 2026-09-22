# getImageData

在 Windows 上运行的 Node.js 原生 Canvas 项目。使用本机字体、Skia 渲染实现、GPU 和驱动执行 Canvas 2D 绘图，并通过本机 Chrome 的实际输出校验兼容性。

构建后的包支持直接调用：

```js
const { OffscreenCanvas } = require('canvas');
```

支持范围为 **Windows 10/11 x64、Node.js 22 及以上**。暂不支持 Windows Server、旧版 Windows、Linux、macOS、ARM64 或 x86。当前实体机验证环境为 Windows 11、Node 22.13.1、Chrome 153.0.8010.48；Windows 10 和其他电脑仍需独立验证。

**当前目录状态：**示例已移至 `demo/`，可以运行下文的单次示例和 HTTP 服务。完整构建验收、主回归及性能脚本仍有旧路径引用：根目录的 `demo.js`、`data.js` 已不存在。重新执行这些流程前需要修复入口与浏览器采集路径；历史验收结果不代表当前目录已重新通过完整验收。

## 快速使用

以下命令在项目根目录执行，前提是已有本机构建产物并已安装到 `node_modules/canvas`。首次准备和构建见下文。

### 绘制并读取像素

```js
const { OffscreenCanvas } = require('canvas');
const canvas = new OffscreenCanvas(2, 1);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 1, 1);
console.log(Array.from(ctx.getImageData(0, 0, 2, 1).data));
// [255, 0, 0, 255, 0, 0, 0, 0]
```

`getImageData()` 返回 `ImageData`。默认 `data` 是 RGBA 顺序的 `Uint8ClampedArray`，每个像素有红、绿、蓝、透明度四个值。

运行现有的 48 × 48 示例：

```powershell
node demo/demo.js
```

输出 `true` 表示这次绘图的 9216 个 RGBA 值与示例内保存的参考值一致。该参考值来自此前的本机环境，不能用于证明另一台电脑与其 Chrome 一致。

### 启动常驻绘图服务

```powershell
node demo/demo_server.js
```

服务先完整绘制一次以初始化 GPU 和字体，然后开始监听 `GET http://127.0.0.1:3000/draw`。在另一个 PowerShell 窗口调用：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/draw
```

每次请求都会新建画布、执行完整绘图并调用 `getImageData()`。响应设置 `Cache-Control: no-store`。当前接口返回以下字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `width` | number | 画布宽度，当前为 48 |
| `height` | number | 画布高度，当前为 48 |
| `elapsedMs` | number | 新建画布、绘图、读回像素及转换数组的耗时，单位毫秒；不含 HTTP 传输 |

当前服务在内部计算像素数组，但没有将 `data` 放入响应。需要返回像素时，在 [demo/demo_server.js](demo/demo_server.js) 的 `draw()` 返回对象中加入 `data` 即可。

其他路径返回 `404`；对 `/draw` 使用非 GET 方法返回 `405`；绘图异常返回 `500`。接口无需请求参数，查询参数不会改变绘图内容。

修改监听地址和端口：

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
node demo/demo_server.js
```

`HOST` 默认 `127.0.0.1`，`PORT` 默认 `3000`，支持 1～65535。按 `Ctrl+C` 停止服务。绘图处理是同步执行的，多个请求在一个 Node 进程内依次绘制。

## 为什么采用常驻服务

单独运行一次 Node 脚本，需要重新加载模块、建立 GPU 上下文、初始化字体并完成首次 GPU 绘制。此前本机实测，demo 首次运行约 550～580 毫秒，同一进程后续完整重绘约 3.2 毫秒；服务测试的绘图耗时约 2.9～4 毫秒。

这些是本机样本数据，不是固定性能保证，也不包含客户端网络耗时。常驻服务复用进程中的渲染环境，每次请求仍然真实绘图。启动预热将首次初始化开销移到开始接收请求之前。

## 构建属于当前电脑的包

### 首次准备环境

单命令构建依赖已经安装好的工具链与静态库，不会自动安装全部开发环境。

| 依赖 | 用途 |
| --- | --- |
| Node.js 22+、npm | 生成内嵌代码、执行构建脚本和测试 |
| Rust / Cargo，MSVC x64 工具链 | 编译 Node-API 原生模块 |
| Visual Studio C++ Build Tools、Windows SDK | C++ 头文件、链接库及 Windows 开发环境 |
| Chromium Clang，含 clang-cl / lld-link | 编译 C++ 与 Skia |
| Git、Python、GN、Ninja、CMake | 获取、配置和编译上游依赖 |
| Skia / Dawn 静态库 | 图形渲染与 D3D11 GPU 后端 |
| SkShaper、HarfBuzz、ICU / SkUnicode | 字体整形与文字处理 |
| libpng、libjpeg-turbo、libwebp、Wuffs、zlib 等 | 图像编解码及压缩 |
| 本机 Chrome 与已启用的 CDP | 采集实际浏览器结果进行校验 |

`third_party/` 不随本项目 Git 仓库提交。仅克隆仓库并执行 `npm ci`，不会获得全部原生依赖。完整版本、下载来源、补丁、库构建步骤和路径覆盖变量见 [Windows 本机构建流程](docs/2026-09-22_windows-canvas-build.md)。

### 日常构建命令

环境准备完成，并修复本文开头列出的示例路径引用后，保持目标 Chrome 运行，在项目根目录执行：

```powershell
npm run build:canvas
```

流程依次执行：

1. 采集系统、CPU、GPU、驱动和字体文件信息，读取当前 Chrome 版本。
2. 编译候选模块，对比后端与通用字体样本，生成本机配置。
3. 重新编译最终候选二进制，执行实时 Chrome 对照、Worker、GC 和隔离加载检查。
4. 通过后生成分发包、环境报告，并安装到本项目的 `node_modules/canvas`。

构建尝试匹配实际 Chrome 环境，不会仅凭版本号不同就直接拒绝；但它不会自动修复任意 Chrome 版本的渲染差异。可用配置无法匹配或测试失败时，需要检查报告并适配源码。

检查已有 CDP 会话：

```powershell
node capture-cdp.cjs --session-status
```

测试与构建复用持久 CDP 连接。首次连接可能需要 Chrome 授权；已有会话正常时不要停止、重启或重复建立连接。浏览器关闭、连接失效或授权撤销后，需要用户主动恢复。详见 [CDP 会话说明](docs/cdp-session.md)。运行已编译的 Canvas 包或 demo 服务不需要 Chrome/CDP。

### 产物及安装

```text
dist/
  canvas/
    canvas.node
    package.json
    environment.json
    THIRD_PARTY_NOTICES.txt
  canvas-0.1.0-local.<构建编号>.tgz
```

`canvas.node` 内嵌 JS 接口实现及 Float16Array 兼容实现，分发目录不需要独立 JS 实现文件。它仍依赖 Node 和 Windows 运行环境；内嵌源码不等于源码加密。

构建成功后，本项目通过 `node_modules/canvas` 解析 `require('canvas')`。在同一电脑的其他 Node 项目中，可安装生成的 `.tgz`。以下命令在消费项目目录执行，路径对应本项目当前所在位置：

```powershell
$canvasArchive = Get-ChildItem 'D:\python\getImageData\dist\canvas-*.tgz' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
npm install $canvasArchive.FullName
```

这里的 `canvas` 是本项目生成的本地包。直接执行 `npm install canvas` 会从 npm 获取同名包，不会安装这里的构建产物。

消费项目无需 Rust、Skia 源码或编译工具。字体文件不打包；另一台电脑应根据其自己的字体、驱动和 Chrome 重新构建、校验。环境变化后也应重新验证，复制旧产物不能继承原电脑的像素一致性结论。

### 查看环境与验证信息

成功产物的报告位于 `dist/canvas/environment.json`，每次构建的证据位于 `out/build-<构建编号>/`。失败流程也会保留报告。

| 报告字段 | 内容 |
| --- | --- |
| `windows.os` / `cpu` / `graphics` | 操作系统、CPU、显卡清单及驱动 |
| `windows.fontFiles` | 安装字体路径、大小及 SHA-256 |
| `chrome` | 实际连接的 Chrome 版本、会话与采集信息 |
| `profile` | 编译采用的后端和通用字体映射 |
| `nativeRuns` | 原生模块实际选择的 GPU、表面类型及测试中使用的字体 |
| `tools` / `dependencies` / `sources` | 编译工具、依赖配置及文件哈希 |
| `binarySHA256` / `verification` / `packageSmoke` | 产物哈希、对照结果与隔离加载检查 |

已安装字体清单与测试实际使用的字体清单含义不同；报告中的字体使用记录不代表未来每一次业务绘图都会使用相同字体。

## 实现与功能范围

绘图由 Node-API、Rust 和 C++ 接入 Skia。当前本机分发配置使用 **Graphite / Dawn / Direct3D 11**；软件光栅路径用于配置选择及无法建立 GPU 表面时的回退。CPU 与 GPU 结果可能不同，不能以提升速度为由直接切换并假设像素不变。

主要已实现接口包括：

- `OffscreenCanvas`、Canvas 2D 上下文：路径、填充与描边、渐变、图案、变换、裁剪、合成、阴影和滤镜。
- 文字绘制与测量：系统字体选择、字体回退、整形及 `TextMetrics`。
- `ImageData`、`getImageData()`、`putImageData()`：sRGB / display-p3、8 位 / float16 数据处理。
- `Path2D`、`DOMMatrix` / `DOMMatrixReadOnly`、`DOMPoint` / `DOMPointReadOnly`。
- `ImageBitmap`、`createImageBitmap()`、`ImageBitmapRenderingContext` 及位图转移相关接口。
- `convertToBlob()`：PNG、JPEG、WebP 导出，JPEG / WebP 支持质量参数。

`src/png.js` 已删除，编码交给原生 Skia。`libEGL.dll`、`libGLESv2.dll` 及原 Ganesh/ANGLE 诊断路径已移除，当前分发包不依赖这两个 DLL。

编码失败需区分调用层级：C++ 编码函数可能返回 `nullptr`，Node 原生 `encodeImage()` 对可恢复失败返回 `undefined`；`convertToBlob()` 对实际编码失败拒绝 Promise 并抛出 `EncodingError`。无效尺寸、未创建上下文等状态有各自的异常。具体例子、JPEG/WebP 尺寸裁剪及避免方式见 [编码空值说明](docs/2026-09-22_png-encoding-null.md)。

## API 导出与方法

以下清单依据当前已安装的 `require('canvas')` 实际导出和源码核对，共 **41 个顶层导出项**：39 个函数或接口构造器、1 个常量对象、1 个 Symbol。实例上的方法需要先取得对应对象，例如 `ctx.getImageData()`；它们不是 `require('canvas').getImageData()` 这样的顶层函数。

### Canvas、图像与几何对象

| 导出名 | 创建或获取方式 | 用途 |
| --- | --- | --- |
| `OffscreenCanvas` | `new OffscreenCanvas(width, height)` | 创建离屏画布，取得上下文、读取绘图结果及导出 Blob |
| `HTMLCanvasElement` | `new HTMLCanvasElement()` | 本地 Canvas 元素包装，默认 300 × 150；不是真实浏览器 DOM 元素 |
| `OffscreenCanvasRenderingContext2D` | `offscreen.getContext('2d', options)` | 离屏 2D 上下文的接口类型，不能直接 new |
| `CanvasRenderingContext2D` | `element.getContext('2d', options)` | 元素 2D 上下文的接口类型，不能直接 new |
| `ImageData` | `new ImageData(width, height, settings)` 或 `new ImageData(data, width, height, settings)` | 像素数据对象；缓冲区形式可省略 height，由数据长度推导 |
| `ImageBitmap` | `await createImageBitmap(source)` 或 `canvas.transferToImageBitmap()` | 位图类型，不能直接 new；使用后可调用 close |
| `ImageBitmapRenderingContext` | `canvas.getContext('bitmaprenderer')` | 接收 ImageBitmap 的上下文类型，不能直接 new |
| `CanvasGradient` | `ctx.createLinearGradient(...)` 等 | 渐变类型，不能直接 new |
| `CanvasPattern` | `ctx.createPattern(source, repetition)` | 图案类型，不能直接 new |
| `TextMetrics` | `ctx.measureText(text)` | 文字度量类型，不能直接 new |
| `Path2D` | `new Path2D()`、`new Path2D(path)`、`new Path2D(svgPath)` | 可复用路径，支持复制现有路径或解析 SVG 路径字符串 |
| `DOMMatrix` | `new DOMMatrix()` 或传入矩阵数组、CSS transform 字符串 | 可修改的矩阵 |
| `DOMMatrixReadOnly` | `new DOMMatrixReadOnly()` 或传入上述初始化值 | 只读矩阵；运算返回新矩阵 |
| `DOMPoint` | `new DOMPoint(x, y, z, w)` | 可修改的点，默认值为 0、0、0、1 |
| `DOMPointReadOnly` | `new DOMPointReadOnly(x, y, z, w)` | 只读点，默认值同上 |
| `Float16Array` | `new Float16Array(length)` 或传入数组、缓冲区 | 半精度数组；优先使用 Node 自带实现，否则使用内嵌兼容实现 |

`getContext('2d', options)` 的配置涉及 `alpha`、`colorSpace`、`colorType`、`willReadFrequently`、`desynchronized`，实际接收结果可通过 `ctx.getContextAttributes()` 查看。ImageData 的 `settings` 使用 `colorSpace`、`pixelFormat`；默认是 `srgb` 与 `rgba-unorm8`，半精度像素使用 `rgba-float16`。

### 顶层函数与辅助导出

| 导出名 / 调用方式 | 返回值 | 说明 |
| --- | --- | --- |
| `createImageBitmap(source, options)` | `Promise<ImageBitmap>` | 从本项目 Canvas、ImageBitmap、ImageData 或可解码 Blob 创建位图 |
| `createImageBitmap(source, sx, sy, sw, sh, options)` | `Promise<ImageBitmap>` | 指定源裁剪区域；options 可设置 resizeWidth、resizeHeight、resizeQuality、imageOrientation、premultiplyAlpha、colorSpaceConversion；支持范围以当前实现为准 |
| `installWebGLGlobals(target = globalThis)` | target | 将 Canvas、矩阵、位图及 WebGL 类型安装到指定对象；没有 document 时补充最小 createElement 包装，会修改目标对象 |
| `createWebGLContext(type = 'webgl')` | WebGL 兼容上下文 | 传入 'webgl2' 选择 WebGL2；不是完整 GPU WebGL 绘制实现 |
| `encodeImage(pixels, width, height, type, quality)` | `Uint8Array` 或 `undefined` | 底层同步编码；传入 RGBA8 的 Uint8Array / Uint8ClampedArray，type 使用 image/png、image/jpeg、image/webp；quality 可省略。错误参数也可能抛异常 |
| `decodeImage(bytes)` | 含 width、height、data 的像素对象，或 `undefined` | 底层同步解码；传入 Uint8Array / Buffer 编码字节，失败可返回 undefined，错误参数也可能抛异常 |
| `getRenderDiagnostics()` | JSON 字符串 | 当前进程的后端、实际适配器、表面计数和字体诊断；使用 JSON.parse 解析 |
| `nativeFunction(target, name, length, isConstructor)` | 函数 | 内部辅助：用 Node-API 函数转发 JS 实现，设置名称、参数数量和构造语义；一般业务无需调用 |
| `constants` | 对象 | 当前含 57 个 WebGL 数值常量，可用 Object.keys(constants) 枚举 |
| `canvasPixels` | Symbol | 内部像素读取入口的键，用于 canvas[canvasPixels]() 等内部调用；业务读取优先使用 getImageData |

`createImageBitmap()` 当前不接受 float16 ImageData 作为源。底层 `encodeImage()` 不包含 `convertToBlob()` 的完整状态检查和超限裁剪，业务导出建议使用后者。`getRenderDiagnostics()` 中实际使用的字体追踪需在启动 Node 前设置 `CANVAS_DIAGNOSTICS=1`，然后执行文字绘制；它不等于构建时的完整环境报告。

### WebGL 兼容类型

其余 16 个顶层导出如下。它们保留 WebGL 接口和对象形状，不能据此推断完整 WebGL 渲染能力。

| 导出名 | 用途 |
| --- | --- |
| `WebGLRenderingContext`、`WebGL2RenderingContext` | WebGL 1 / 2 兼容上下文类型，可通过 createWebGLContext 获取 |
| `WebGLBuffer`、`WebGLFramebuffer`、`WebGLRenderbuffer`、`WebGLTexture` | 缓冲区、帧缓冲、渲染缓冲、纹理的兼容类型名 |
| `WebGLProgram`、`WebGLShader`、`WebGLUniformLocation` | 程序、着色器和 uniform 位置的兼容类型名 |
| `WebGLQuery`、`WebGLSampler`、`WebGLSync` | 查询、采样器和同步对象的兼容类型名 |
| `WebGLTransformFeedback`、`WebGLVertexArrayObject` | 变换反馈和顶点数组对象的兼容类型名 |
| `WebGLActiveInfo`、`WebGLShaderPrecisionFormat` | 活动变量和着色器精度信息的兼容类型名 |

这些资源类型的底层构造器当前是对象占位实现；业务主路径为 Canvas 2D。

### 画布和 2D 上下文的全部方法

`OffscreenCanvas` 提供 `getContext(type, options)`、`transferToImageBitmap()`、`convertToBlob(options)`，以及 `width`、`height`、`oncontextlost`、`oncontextrestored` 属性。`convertToBlob({type, quality})` 返回 `Promise<Blob>`。

`HTMLCanvasElement` 提供 `getContext(type, options)`、`transferControlToOffscreen()` 和 `width`、`height` 属性。当前没有 `toDataURL()` 或 `toBlob()`；需要文件编码时使用 OffscreenCanvas 的 `convertToBlob()`。

两种 2D 上下文共有以下 **44 个方法**：

| 类别 | 方法及常用签名 |
| --- | --- |
| 状态 | `save()`、`restore()`、`reset()`、`getContextAttributes()`、`isContextLost()` |
| 变换 | `scale(x, y)`、`rotate(angle)`、`translate(x, y)`、`transform(a, b, c, d, e, f)`、`setTransform(matrix)` / `setTransform(a, b, c, d, e, f)`、`resetTransform()`、`getTransform()` |
| 路径 | `beginPath()`、`closePath()`、`moveTo(x, y)`、`lineTo(x, y)`、`quadraticCurveTo(cpx, cpy, x, y)`、`bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)` |
| 路径形状 | `arc(x, y, radius, startAngle, endAngle, counterclockwise)`、`arcTo(x1, y1, x2, y2, radius)`、`ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise)`、`rect(x, y, width, height)`、`roundRect(x, y, width, height, radii)` |
| 填充、描边、裁剪 | `fill()` / `fill(fillRule)` / `fill(path, fillRule)`、`stroke()` / `stroke(path)`、`clip()` / `clip(fillRule)` / `clip(path, fillRule)` |
| 矩形 | `fillRect(x, y, width, height)`、`strokeRect(x, y, width, height)`、`clearRect(x, y, width, height)` |
| 命中测试 | `isPointInPath(x, y, fillRule)` / `isPointInPath(path, x, y, fillRule)`、`isPointInStroke(x, y)` / `isPointInStroke(path, x, y)` |
| 虚线 | `setLineDash(segments)`、`getLineDash()` |
| 渐变、图案 | `createLinearGradient(x0, y0, x1, y1)`、`createRadialGradient(x0, y0, r0, x1, y1, r1)`、`createConicGradient(startAngle, x, y)`、`createPattern(source, repetition)` |
| 文字 | `fillText(text, x, y, maxWidth)`、`strokeText(text, x, y, maxWidth)`、`measureText(text)` |
| 图像 | `drawImage(source, dx, dy)`、`drawImage(source, dx, dy, dw, dh)`、`drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)` |
| 像素 | `createImageData(width, height, settings)` / `createImageData(imageData)`、`getImageData(sx, sy, sw, sh, settings)`、`putImageData(imageData, dx, dy)` / `putImageData(imageData, dx, dy, dirtyX, dirtyY, dirtyWidth, dirtyHeight)` |

上表的 `options` / `settings`、`counterclockwise`、`radii`、`fillRule`、`maxWidth` 等按对应重载可省略；角度单位为弧度。`fillRule` 使用 `nonzero` 或 `evenodd`。`createPattern` 的 repetition 使用 `repeat`、`repeat-x`、`repeat-y` 或 `no-repeat`。

上下文的全部公开属性：

| 类别 | 属性 |
| --- | --- |
| 所属画布 | `canvas`（只读） |
| 颜色与合成 | `fillStyle`、`strokeStyle`、`globalAlpha`、`globalCompositeOperation` |
| 线条 | `lineWidth`、`lineCap`、`lineJoin`、`miterLimit`、`lineDashOffset` |
| 阴影与滤镜 | `shadowColor`、`shadowBlur`、`shadowOffsetX`、`shadowOffsetY`、`filter` |
| 文字 | `font`、`textAlign`、`textBaseline`、`direction`、`letterSpacing`、`wordSpacing`、`fontKerning`、`fontStretch`、`fontVariantCaps`、`textRendering`、`lang` |
| 图像平滑 | `imageSmoothingEnabled`、`imageSmoothingQuality` |

### 路径、矩阵及返回对象的方法

| 对象 | 方法 / 属性 |
| --- | --- |
| `Path2D` | `closePath`、`moveTo`、`lineTo`、`quadraticCurveTo`、`bezierCurveTo`、`arcTo`、`arc`、`ellipse`、`rect`、`roundRect`；参数与上下文同名方法一致。另外提供 `addPath(path, transform)`，transform 可省略 |
| `CanvasGradient` | `addColorStop(offset, color)`，添加 0～1 范围内的色标 |
| `CanvasPattern` | `setTransform(matrix)`，设置图案矩阵 |
| `ImageBitmap` | `close()` 释放位图；`width`、`height` 只读 |
| `ImageBitmapRenderingContext` | `transferFromImageBitmap(bitmap)` 接收位图；`canvas` 只读 |
| `ImageData` | `width`、`height`、`data`、`colorSpace`、`pixelFormat` 为只读属性；data 中的像素元素可以修改 |
| `TextMetrics` | 只读度量：`width`、`actualBoundingBoxLeft`、`actualBoundingBoxRight`、`actualBoundingBoxAscent`、`actualBoundingBoxDescent`、`fontBoundingBoxAscent`、`fontBoundingBoxDescent`、`hangingBaseline`、`alphabeticBaseline`、`ideographicBaseline` |

`DOMMatrixReadOnly` 的全部实例方法为 `translate`、`scale`、`scaleNonUniform`、`scale3d`、`rotate`、`rotateFromVector`、`rotateAxisAngle`、`skewX`、`skewY`、`multiply`、`flipX`、`flipY`、`inverse`、`transformPoint`、`toFloat32Array`、`toFloat64Array`、`toJSON`、`toString`。矩阵旋转、倾斜方法的角度单位为度，与 Canvas 上下文不同。

`DOMMatrix` 继承上述方法，另外提供修改自身的 `multiplySelf`、`preMultiplySelf`、`translateSelf`、`scaleSelf`、`scale3dSelf`、`rotateSelf`、`rotateFromVectorSelf`、`rotateAxisAngleSelf`、`skewXSelf`、`skewYSelf`、`invertSelf`、`setMatrixValue`。两个矩阵类型均有静态方法 `fromMatrix`、`fromFloat32Array`、`fromFloat64Array`，以及分量 `m11`～`m44`、二维别名 `a`～`f`、状态 `is2D` / `isIdentity`；DOMMatrix 的分量可写。

`DOMPointReadOnly` 提供静态方法 `fromPoint(point)`、实例方法 `matrixTransform(matrix)` / `toJSON()`，以及 `x`、`y`、`z`、`w` 属性。`DOMPoint` 继承这些方法，分量可写。

### 调用示例与导出自查

```js
const { OffscreenCanvas, createImageBitmap, getRenderDiagnostics } = require('canvas');

(async () => {
    const canvas = new OffscreenCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 64, 0);
    gradient.addColorStop(0, 'red');
    gradient.addColorStop(1, 'blue');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    console.log(blob.type, bitmap.width, bitmap.height);
    bitmap.close();
    console.log(JSON.parse(getRenderDiagnostics()).defaultBackend);
})().catch(console.error);
```

查看当前实际加载包的全部顶层导出：

```js
const canvas = require('canvas');
console.table(Object.keys(canvas).map(name => ({ name, type: typeof canvas[name] })));
```

本项目不提供其他同名 npm 包的 `createCanvas`、`loadImage`、`registerFont` API。使用本 README 中的接口；未来重新构建或修改导出后，应以实际加载包为准。

## 验证与已知限制

2026-09-22 归档的本机构建在 Chrome 153.0.8010.48 下完成了 6108 项对照，demo 的 9216 个 RGBA 值零差异，并通过 Worker、GC 和分发包隔离加载验证。证据见 [构建验证归档](docs/2026-09-22_windows-canvas-build-verification.json)。这些是目录调整前的验收记录。

| 命令 | 用途与当前状态 |
| --- | --- |
| `node demo/demo.js` | 使用已安装的 canvas 包绘图并与内嵌参考值比较 |
| `node demo/demo_server.js` | 启动常驻 HTTP 绘图服务 |
| `node --test tests/*.test.cjs` | 独立接口与并发等测试 |
| `node test.js --local` | 源码开发模块的本地回归；当前缺少其引用的根目录 data.js |
| `node test.js` | 主回归及实时 Chrome 对照；当前还需修复 demo 入口与采集路径 |
| `npm run build:canvas` | 最终候选二进制的编译、校准和验收；同样受旧 demo 路径影响 |

`scripts/benchmark-demo.cjs` 也仍指向根目录 `demo.js`，需同步后才能再次使用。当前 `demo/demo.js` 是直接 `require('canvas')` 的 Node 示例，不能原样作为浏览器脚本执行；恢复 CDP 采集时还需保留浏览器入口逻辑。修改采集路径应考虑现有服务的白名单，避免为更新路径反复建立 CDP 连接。

一般接口值和 8 位像素采用精确比较；已有部分 float16 跨色域用例仅 RGB 允许 `1e-5` 绝对误差，alpha 不放宽。异常主要比较类型，不保证 Chrome 的完整错误文案一致。

兼容性边界：

- 对齐依据是目标电脑 Chrome 的实测结果，不保证所有 Chrome 版本、全部 Canvas 用法和所有文字系统完全一致。
- 额外字体样本 `16px Noto Serif SC`、文本 `Canvas 123` 的像素一致，但宽度测量本地为 `85.69526672363281`、Chrome 为 `84.67127990722656`。该样本不在 6108 项通过计数内。
- 历史专项检查记录过矩阵旋转的 1 ULP 差异、WebP 有损解码像素的 2/255 差异，以及受 Node-API 限制的函数自有属性与部分原型链差异。
- `ctx.lang` 当前有属性语义，尚未接入按语言选择字体和整形。CSS 语法、图像源、字体和文字系统的覆盖仍有限。
- 本地 `ImageBitmap` 兼容对象不等于浏览器的跨线程 transferable；项目也不提供完整浏览器 DOM 或完整 WebGL 绘制流水线。

## 开发入口与目录

源码开发入口是根目录 `index.js` 加 `webgl.node`；分发入口是 `node_modules/canvas/canvas.node`。修改源码不会自动更新已经安装的分发包。

只重建源码开发模块：

```powershell
cargo build --release
Copy-Item target/release/webgl.dll webgl.node -Force
```

该命令不更新 `require('canvas')` 使用的分发包，也不执行本机 Chrome 校验。分发更新使用完整构建流程。

| 路径 | 用途 |
| --- | --- |
| [index.js](index.js) | 接口包装、参数语义、图像与位图对象 |
| [src/webgl_native.rs](src/webgl_native.rs) | Node-API 绑定、原生函数与内嵌接口加载 |
| [src/skia_backend.cpp](src/skia_backend.cpp) | 绘图、字体、GPU / CPU 后端与像素读取 |
| [src/canvas_css.rs](src/canvas_css.rs) | 颜色与字体解析 |
| [src/dommatrix.js](src/dommatrix.js) | 矩阵与点接口 |
| [src/render_diagnostics.h](src/render_diagnostics.h) | 渲染后端与字体诊断记录 |
| [build.rs](build.rs) | 原生编译、链接与内嵌资源准备 |
| [scripts/build-canvas.cjs](scripts/build-canvas.cjs) | 本机校准、构建、验收、打包与安装 |
| [demo/](demo/) | 单次绘图与 HTTP 服务示例 |
| [tests/](tests/) | 回归用例、浏览器探针与比较器 |
| [snapshot/](snapshot/) | 上游补丁与构建配置快照 |
| [docs/](docs/) | 构建流程、专项报告与历史交接记录 |
| `third_party/` | 本地上游源码、工具链和静态库，不提交到 Git |
| `dist/`、`out/`、`target/` | 分发包、验证证据和编译中间产物，不提交到 Git |

详细资料：

- [Windows 本机构建、校验与分发](docs/2026-09-22_windows-canvas-build.md)
- [PNG 编码空值与异常说明](docs/2026-09-22_png-encoding-null.md)
- [持久 CDP 会话](docs/cdp-session.md)
- [第二十二轮接口补全及偏差记录](docs/2026-09-21_twentysecond-round-features-report.md)
- [第二十三轮函数身份与原型差异](docs/2026-09-21_twentythird-round-function-identity-report.md)
- [历史会话交接](docs/2026-09-22_session-handoff.md)（记录当时状态；已删除文件及旧路径以当前代码为准）
