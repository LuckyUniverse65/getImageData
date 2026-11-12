# lucky65_canvas

Windows 和 Linux 上的 Node.js 原生 Canvas 库。`0.3.0` 将本项目原有 Rust、C++/Skia、JS 接口完整编译为 Linux `.node`，两平台提供相同的 41 个顶层导出和 44 个 2D 上下文方法。

作者微信号：`LuckyUniverse65`

## 安装

```bash
npm install lucky65_canvas
```

要求 Node.js 22+。`0.3.2` 起支持 Windows 10/11 x64 和 Linux x64/glibc 2.31+（Debian 11+、Ubuntu 20.04+）；暂不支持 Alpine/musl、ARM64、x86、macOS、旧版 Windows 或 Windows Server。

Debian 11 的 glibc 2.31 可直接使用本版，无需升级系统 glibc。`0.3.0`、`0.3.1` 的 Linux 二进制仍要求 glibc 2.35+，遇到旧版本检查错误时请升级到 `0.3.2` 或更高版本。

两个平台的原生文件直接包含在 npm 包内，JS 接口和 Float16Array 兼容实现已嵌入二进制。没有 npm 运行时依赖，没有安装时编译脚本；不需要 Rust、Skia 源码或 Chrome。

`0.3.1` 起，Linux 包自带 Fontconfig、FreeType 动态依赖及所需的其他非 glibc 运行库，并包含 DejaVu 和 Noto CJK 简体中文兜底字体。无需再执行 apt 安装 `libfontconfig1` 或字体，也无需设置 `LD_LIBRARY_PATH`。Linux 使用 Skia CPU 绘图，不需要桌面、显示服务器或 GPU。

请保留整个 npm 包：`linux-libs/` 和 `fonts/` 是运行所需文件，不能只复制 `.node`。系统仍需满足上述 glibc 和 Node.js 版本要求。

`0.2.0` 的 Linux 版曾使用另一套绘图库，接口不完整；请升级到 `0.3.2`。此次完整移植保留原项目的能力和限制，不代表实现浏览器的所有标准。WebGL 仍是原有兼容接口，不是完整 GPU WebGL 渲染器。Linux 与 Windows/Chrome 不保证像素一致；字体和软件渲染实现会影响结果。

## 使用

```js
const { OffscreenCanvas } = require('lucky65_canvas');
const canvas = new OffscreenCanvas(2, 1);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 1, 1);
console.log(Array.from(ctx.getImageData(0, 0, 2, 1).data));
// [255, 0, 0, 255, 0, 0, 0, 0]
```

已有代码使用 `require('canvas')` 时，安装别名即可，无需改业务代码：

```bash
npm install canvas@npm:lucky65_canvas
```

ESM 使用默认导入：`import canvasAPI from 'lucky65_canvas'`，然后解构所需方法。

导出文件：

```js
const fs = require('node:fs/promises');
const { OffscreenCanvas } = require('lucky65_canvas');
async function main() {
    const canvas = new OffscreenCanvas(320, 100);
    const ctx = canvas.getContext('2d');
    ctx.font = '24px sans-serif';
    ctx.fillText('Hello Canvas', 20, 60);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    await fs.writeFile('canvas.png', Buffer.from(await blob.arrayBuffer()));
}
main().catch(console.error);
```

## 两平台完整 API

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


## 字体和运行诊断

Linux 启动前设置 `CANVAS_DIAGNOSTICS=1`，绘制文字后调用 `JSON.parse(getRenderDiagnostics())`，可查看实际使用字体、字体版本、可用字体和渲染表面计数。Linux 的 `defaultBackend` 为 `raster`，`selectedAdapter` 为 `null`，因为这条渲染路径不使用显卡。

优先使用系统已有的同名字体，缺少时注册包内兜底字体；没有系统字体配置的容器会使用内置基础配置。需要指定字体文件时，可在启动进程前设置 `CANVAS_FONT_FILE=/absolute/path/font.ttf`。新增字体可能改变此前缺字时的绘图结果，实际字体以诊断输出为准。包内 `build-info.json` 提供构建版本、各运行库/字体 SHA-256 和验收摘要。

每个 worker 需独立加载模块；Canvas、上下文和函数不能作为 `workerData` 跨线程克隆。常驻服务中可保留 Canvas 实例，按需要 `ctx.reset()` 后再次绘制。

Linux 版包含 FreeType。Portions of this software are copyright (c) 2026 The FreeType Project (www.freetype.org). All rights reserved. 完整第三方许可见包内 `THIRD_PARTY_NOTICES.txt`。
