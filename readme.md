# getImageData

2026-09-21 第二十三轮修复**函数身份**：此前每个暴露的可调用对象在 `Function.prototype.toString` 下都会泄露 JS 包装器源码（连内部标识符都可读到），对照 Chrome 153 的 **106 个可调用对象中 104 个不一致**。现由 Rust 侧新增的 `nativeFunction` 构造**真正的 Node-API 函数**转发到 JS 实现——`toString` 天然返回 `function name() { [native code] }`，**不依赖任何 toString 钩子、不污染 `Function.prototype`**；arity 全部取自 Chrome 实测。结果：**可调用对象 106/106、原型方法 arity 94/94 一致**，`new method()` 也与 Chrome 一样抛 TypeError。完整 **6108 项**回归通过（`browserVerified: true`），demo 零差异。剩余三处差异（`arguments`/`caller`/`prototype` 自有属性、`OffscreenCanvas` 的原型链）受 Node-API 能力限制，详见[本轮报告](docs/2026-09-21_twentythird-round-function-identity-report.md)和[机器证据](docs/twentythird-round-fixes.json)。

2026-09-21 第二十二轮补齐第二十一轮实测列出的 **6 项缺失接口**：`DOMMatrix`/`DOMMatrixReadOnly`/`DOMPoint`（`getTransform()` 现返回 `DOMMatrix`）、`Path2D`（原生 SkPath，支持复制、SVG 路径串、`addPath` 变换，以及 `fill`/`stroke`/`clip`/命中测试的 Path2D 重载）、`ctx.filter`（10 种 CSS 滤镜函数接入 Skia image filter 链）与 `ctx.lang`、`ImageBitmapRenderingContext`、`createImageBitmap()`（Canvas/ImageBitmap/ImageData/Blob，含裁剪与缩放）、`convertToBlob()` 的 **JPEG / WebP** 编码。为此重新配置编译了 Skia 并启用其内置 libjpeg-turbo / libpng / libwebp 编解码器。第二十一轮 57 项探针对实时 Chrome 的**行为差异由 6 项降为 0**；本轮另新增四批 **128 项**语义对照，实测修正了滤镜的作用空间与阴影着色、Path2D 命中测试的坐标空间、bitmaprenderer 的呈现模型、编码器默认质量等十余处，最终 **128 项中仅 2 项差异**（1 ULP 的 cos 与 libwebp 有损内部差异）。完整 **6108 项**回归通过（`browserVerified: true`），demo **9216 个 RGBA 值零差异**，新增 Path2D 原生存储 GC 检查，编译 0 告警。详见[本轮报告](docs/2026-09-21_twentysecond-round-features-report.md)和[机器证据](docs/twentysecond-round-fixes.json)。

2026-09-21 第二十一轮定向检查与修复完成：新增 **57 项**探针，与当前 Chrome 153.0.8010.48 实时对照。上下文不再把方法/访问器挂在实例上（`Object.getOwnPropertyNames(ctx)` 由 72 降为 **0**，与 Chrome 一致）；`measureText()`、`createLinearGradient()`、`getImageData()` 的返回值改为真正的 `TextMetrics`、`CanvasGradient`、`ImageData` 接口，并补齐这些全局量、`ImageBitmap` 与 `OffscreenCanvas` 的 `Symbol.toStringTag`、`oncontextlost` / `oncontextrestored`、构造函数元数；修复 `setLineDash` 未走 float 转换、`OffscreenCanvas` 尺寸越界错误类型，以及原生每建一个上下文泄漏 25 个 CString；删除约 85 行不可达的旧光栅器与只写不读的 `pixels` / `clip` 状态，编译告警由 12 降为 **0**。依规范判定的 `CanvasPattern.setTransform` 非有限矩阵与 `getImageData` 的 `long` 回绕两项，经实测被 Chrome 否定并已回退。完整 **6108 项**回归通过，demo **9216 个 RGBA 值零差异**。详见[本轮报告](docs/2026-09-21_twentyfirst-round-fixes-report.md)和[机器证据](docs/twentyfirst-round-fixes.json)；结论限定于报告说明的范围。

2026-09-17 已分离普通与离屏 2D 上下文：`HTMLCanvasElement` 创建独立的 `CanvasRenderingContext2D`，`OffscreenCanvas` 创建 `OffscreenCanvasRenderingContext2D`。两者的原生宿主、类型标签、原型、接收者校验和生命周期分开，通用 Skia 绘制原语共用。新增 **67 项 Chrome 对照**及 **3 项原生/包装层隔离测试**通过，完整 **6108 项**回归通过。详见[上下文分离说明](docs/2026-09-17_canvas-context-separation.md)。

2026-09-17 第二十轮持续检查与修复完成：新增 **1291 项**、完整 **6041 项**全部通过，当前 Chrome 对照逐值一致；demo 的 **9216 个 RGBA 值零差异**，Worker 并发与 GC 检查通过。修复原生分配失败崩溃、超大画布软件回退及图像分块、上下文丢失与导出错误、F16 初始化/舍入、跨位深色域转换，以及位图转移后的裁剪状态。最后连续两批各 **128 个新用例**没有新的实现问题，随后完整回归通过。已更新 `webgl.node`。详见[本轮修复报告](docs/2026-09-17_twentieth-round-fixes-report.md)和[机器证据](docs/twentieth-round-fixes.json)；结论限定于报告中说明的实现与环境范围。

2026-09-17 第十九轮修复 `demo.js` 审查发现的问题：支持全部 **26 种合成模式**、实际 **display-p3 / float16** 渲染和像素读写，补齐 ImageData 格式属性并使示例支持严格模式。新增 **316 项**、完整 **4750 项**验收通过；其中新增 315 项逐值一致，另 1 项跨色域浮点转换按 `1e-5` 绝对误差验收，8 位像素及原始 demo 仍逐值一致。Node 22 需要先运行 `npm ci` 安装已锁定的 Float16Array 兼容库。详见[修复说明](docs/2026-09-17_nineteenth-round-fixes-report.md)。

2026-09-17 第十八轮持续检查完成：新增 **2792 项**、完整 **4434 项**与现有 Chrome 实时逐值一致；demo 的 9216 个 RGBA 值零差异，Worker 并发与 GC 检查通过。最后连续两批各 128 个全新用例无新发现，随后完整回归通过。修复涉及矩阵与路径状态、数值边界、透明度与图像源、阴影裁剪、渐变渲染批次及并发 GPU 访问。详见[第十八轮修复报告](docs/2026-09-17_eighteenth-round-fixes-report.md)及[机器证据](docs/eighteenth-round-fixes.json)。结论限定于已实现功能和已验证环境。

2026-09-16 第十七轮连续检测与修复完成：新增 **172 项全部通过**，完整 **1642 项**与现机 Chrome 实时一致，demo 的 9216 个 RGBA 值零差异，渐变与图案 GC 通过。本轮修复空路径曲线起点、退化路径闭合及缓存状态、圆角矩形方向与虚线起点，以及 maxWidth 文字缩放的路径状态和着色坐标；共修复 58 个失败用例，最后新增 24 项未发现新差异。详见[第十七轮修复报告](docs/2026-09-16_seventeenth-round-fixes-report.md)。本轮验证范围内没有剩余差异。

Windows 上的 Node.js `OffscreenCanvas` 兼容层。JavaScript 提供 Canvas 外壳，Rust 通过 Node-API 分派接口，C++ 调用 Skia Graphite / Dawn D3D11 绘制和读取像素。

2026-09-16 第十六轮连续检测与修复完成：新增 **225 项全部通过**，完整 **1470 项**与现有 Chrome 实时一致，demo 的 9216 个 RGBA 值零差异，渐变与图案 GC 通过。本轮修复退化渐变、边界色标、退化与小半径圆弧、路径变换状态，以及零尺寸/极小尺寸矩形；分阶段修复 28 个失败用例，最后新增 32 项未发现新差异。详见[第十六轮修复报告](docs/2026-09-16_sixteenth-round-fixes-report.md)。结论限于已验证场景。

2026-09-16 第十五轮连续检测与修复完成：新增 **271 项全部通过**，完整 **1245 项**与用户现有 Chrome 实时一致，demo 的 9216 个 RGBA 值零差异，渐变与图案 GC 通过。本轮修复极端字距及字体单位、垂直制表符、图案阴影和文字、copy 重叠合成、不透明画布文字与 alpha 恢复，并补齐 148 个 CSS 命名颜色。详见[第十五轮修复报告](docs/2026-09-16_fifteenth-round-fixes-report.md)。结论限于已验证的场景。

2026-09-16 第十四轮连续检测与修复完成：新增测试从 **100 项扩展到 141 项，再扩展到 180 项**，逐轮发现并修复的差异现已全部消除。最终本轮 **180/180**、完整 **974 项**与现有 Chrome 实时一致，demo 的 9216 个 RGBA 值零差异，渐变与图案 GC 通过。修复涉及按字体和文字脚本选择大小写变体、极端字距与单位、图像源裁剪、透明图像阴影及源透明通道信息。详见[第十四轮修复报告](docs/2026-09-16_fourteenth-round-fixes-report.md)。结论限于已验证的场景。

2026-09-16 第十三轮修复完成：此前 **32 个失败用例全部修复**，原有 57 项加上 35 项边界验证，**92 项全部通过**。完整 **794 项**与用户现有 Chrome 153.0.8010.48 实时对照一致，demo 的 9216 个 RGBA 值零差异，渐变与图案 GC 通过。修复覆盖零尺寸文字测量、跨字体双向布局、特殊字符字距、字体变体及属性联动、字距序列化，以及透明图像缩放和变换后的采样质量。详见[第十三轮修复报告](docs/2026-09-16_thirteenth-round-fixes-report.md)；[修复前检测报告](docs/2026-09-16_thirteenth-round-review-report.md)保留历史证据。

2026-09-16 第十二轮修复完成：原有 **17 个失败用例全部修复**，补充边界验证后第十二轮 **70 项全部通过**。完整 **702 项**与用户现有 Chrome 153.0.8010.48 实时对照一致，demo 的 9216 个 RGBA 值零差异，渐变和图案 GC 通过。修复覆盖文字属性状态、字距/词距/字偶距、双向文字、斜体回退、空格缓存及其尺寸生命周期、采样质量状态和 CanvasPattern 原型描述符。详见[第十二轮修复验收报告](docs/2026-09-16_twelfth-round-fixes-report.md)；[修复前检测报告](docs/2026-09-15_twelfth-round-review-report.md)保留历史证据。

2026-09-15 第十一轮修复完成：此前 **25 个失败用例全部修复**，补充 20 项边界验证后，第十一轮 **54 项全部通过**，完整 **632 项**与现有 Chrome 实时对照一致，demo 的 9216 个 RGBA 值零差异。修复覆盖 CanvasPattern 对象身份、共享矩阵、平滑和透明边缘插值、内部方法隔离，以及字体列表回退。渐变 GC 和新增图案保留/释放 GC 检查均通过。详见[第十一轮修复报告](docs/2026-09-15_eleventh-round-fixes-report.md)；[第十一轮检测报告](docs/2026-09-15_eleventh-round-review-report.md)保留修复前证据。

2026-09-15 第十轮修复完成：此前 **17 个失败用例全部修复**，补充 29 项边界验证后，第十轮 **75 项全部通过**，完整 **578 项**与现有 Chrome 实时对照一致，demo 的 9216 个 RGBA 值零差异，GC 通过。修复覆盖冻结对象的内部状态、图像源属性遮蔽、HSL 阴影/渐变及解析精度、混合脚本和中文字体，并修复扩展测试发现的 Graphite 图案纹理上传问题。详见[第十轮修复报告](docs/2026-09-15_tenth-round-fixes-report.md)；[第十轮检测报告](docs/2026-09-15_tenth-round-review-report.md)保留修复前证据。

2026-09-15 第九轮修复完成：此前 **23 个失败用例全部修复**，补充 15 项相关边界后，第九轮 **70 项全部通过**，完整 **503 项**与现有 Chrome 实时对照一致，demo 的 9216 个 RGBA 值零差异，GC 通过。修复覆盖 ImageBitmap 身份和构造约束、字体换行与转义、相对字重和斜体角度、HSL 浮点绘制，以及缺失字形回退和组合标记分组。详见[第九轮修复报告](docs/2026-09-15_ninth-round-fixes-report.md)；[第九轮检测报告](docs/2026-09-15_ninth-round-review-report.md)保留历史差异。

2026-09-15 第八轮修复完成：此前 **29 个失败用例全部修复**，补充 26 项相关边界后，第八轮 **72 项全部通过**，完整 **433 项**与用户现有 Chrome 实时对照一致，demo 的 9216 个 RGBA 值零差异，GC 通过。修复覆盖 Canvas 接收对象校验、字体转义及序列化、现代颜色注释与 `none`、开头组合重音、合成斜体和变换后的文字基线对齐。详见[第八轮修复报告](docs/2026-09-15_eighth-round-fixes-report.md)；[第八轮检测报告](docs/2026-09-15_eighth-round-review-report.md)保留修复前证据。

2026-09-15 第七轮补齐无 OpenType `smcp` 字体的合成小型大写：新增 **35 项全部通过**，完整 **361 项**与现有 Chrome 实时对照一致，demo 的 9216 个 RGBA 值零差异，GC 通过。已验证 Courier New、Tahoma、Consolas 的混合大小写、Unicode 大写展开、组合重音、填充/描边、变换和阴影。详见[第七轮修复报告](docs/2026-09-15_seventh-round-fixes-report.md)。

2026-09-15 第六轮修复完成：此前 21 个失败用例已修复，补充 16 项相关边界后，第六轮 **52 项全部通过**，已纳入 **326 项主回归**。所有用例与用户手动打开的 Chrome 实时对照一致，demo 的 9216 个 RGBA 值零差异，GC 通过。详见[第六轮修复报告](docs/2026-09-15_sixth-round-fixes-report.md)；[第六轮检测报告](docs/2026-09-15_sixth-round-review-report.md)保留修复前证据。

2026-09-15 完成第五轮修复与实时验收：此前 27 个失败用例已修复，补充 12 项相关边界后，共 **274 项**与用户手动打开的 Chrome 153.0.8010.37 一致；demo 的 9216 个 RGBA 值零差异，渐变 GC 检查通过。所有采集复用同一条持久 CDP 连接。详见[第五轮修复报告](docs/2026-09-15_fifth-round-fixes-report.md)。

[第五轮检测报告](docs/2026-09-15_fifth-round-review-report.md)保留修复前 46 项中 27 项差异的历史证据；[第四轮验收报告](docs/2026-09-15_fourth-round-verification-report.md)保留此前 216 项的实时结果。

[第二轮修复记录](docs/2026-09-14_offscreen-fixes-report.md)和[第三轮修复前检测](docs/2026-09-14_third-round-review-report.md)保留了历史结果及证据。

[第四轮修复前检测](docs/2026-09-14_fourth-round-review-report.md)保留原 46 项中 29 项差异的历史证据；[第三轮修复记录](docs/2026-09-14_third-round-fixes-report.md)保留此前 158 项的浏览器验收。

## 运行

需要 Windows x64、Node.js，以及支持当前 Dawn D3D11 后端的显卡和驱动。本机使用 Node.js v22.13.1。仓库包含编译产物，首次使用先安装依赖：

```powershell
npm ci
node demo.js
```

输出 `true` 表示该例与内嵌参考数组一致。`node data.js` 先输出该布尔值，再在最后一行输出完整像素 CSV。

```javascript
const { OffscreenCanvas } = require('./');
const canvas = new OffscreenCanvas(48, 48);
const context = canvas.getContext('2d');
context.fillStyle = 'red';
context.fillRect(0, 0, 48, 48);
console.log(Array.from(context.getImageData(0, 0, 1, 1).data));
// [255, 0, 0, 255]
```

`webgl.node`、`libEGL.dll` 和 `libGLESv2.dll` 应放在项目根目录。`require('./')` 通过 `index.js` 加载模块。支持原生 Float16Array 的 Node 优先使用内置类型；Node 22 使用 `@petamoriken/float16`，可通过模块导出的 `Float16Array` 访问兼容构造函数。兼容类型不具备原生 TypedArray 的所有反射特征，也不会自动安装到全局。

读取和写入 P3 半精度像素：

```javascript
const { OffscreenCanvas } = require('./');
const g = new OffscreenCanvas(1, 1).getContext('2d', {
    colorSpace: 'display-p3', colorType: 'float16'
});
const pixels = g.createImageData(1, 1, {
    colorSpace: 'display-p3', pixelFormat: 'rgba-float16'
});
pixels.data.set([1.25, 0.125, 0, 1]);
g.putImageData(pixels, 0, 0);
console.log(Array.from(g.getImageData(0, 0, 1, 1, {
    pixelFormat: 'rgba-float16'
}).data)); // [1.25, 0.125, 0, 1]
```

`getImageData()` 默认返回画布色彩空间的 8 位像素，只有显式请求 `rgba-float16` 才返回浮点数组。`colorSpace` 和 `pixelFormat` 属性只读。Canvas/位图/图案之间的绘制保留源格式；PNG 导出转换为 sRGB 8 位。

## 使用现有 Chrome 的 CDP 验证

在用户手动打开的 Chrome 中开启远程调试，保持浏览器运行，默认端口为 9222。F12 可以关闭，然后执行：

```powershell
node test.js
```

脚本直接通过 CDP 执行 JavaScript 和读取结果，不移动鼠标、不模拟键盘、不使用剪贴板。每次在现有浏览器及 profile 中创建后台测试标签页，结束后只关闭该测试页。不会启动新浏览器、切换 profile 或操作用户已有标签页；你可以继续处理其他任务。

采集命令现在共用一个隐藏的后台进程，持续保持同一条 CDP 连接；测试完成只关闭测试标签页，不断开浏览器连接。Chrome 首次连接可能要求允许一次，同一连接有效期间后续命令无需重新连接。连接失败、被撤销或 Chrome 重启后，服务不会自动重连，以免重复触发授权提示。用 `node capture-cdp.cjs --session-status` 查看状态；主动结束用 `--session-stop`，准备重新授权时再执行 `--session-start`。详见[持久会话说明](docs/cdp-session.md)。

端口可通过 `CHROME_DEBUG_PORT` 设置。优先读取现有 profile 的 `DevToolsActivePort`；非默认 profile 可通过 `CHROME_DEVTOOLS_ACTIVE_PORT_FILE` 指定其文件路径。如果 HTTP `/json/version` 返回 404，仍可通过该文件提供的 WebSocket 连接。

只运行本地回归：

```powershell
node test.js --local
```

单独采集 demo，或重跑第二轮边界检测：

```powershell
node capture-cdp.cjs demo.js cdp-demo
node capture-cdp.cjs tests/additional-cases.js cdp-additional-review
node tests/compare-additional.cjs
```

`node test.js` 执行十九组兼容性测试及独立防崩溃检查，共 4750 项，另有 demo、Worker 并发和 GC 检查。第四至第十九轮共用浏览器采集入口；第五至第十九轮的本地检查在子进程运行。`out/cdp-verification-result.json` 保存主回归结果，连接前写入未验证状态；`out/cdp-*-browser.json` 保存实际浏览器结果、运行编号、时间、浏览器版本和测试源码 SHA-256。`node tests/compare-nineteenth-round.cjs` 可生成本轮逐项差异；半精度颜色通道允许 `1e-5` 绝对误差，alpha 和 8 位像素仍严格比较，超出阈值时退出码为 1。其他轮次保留各自比较器。`out/` 不提交到 Git。

`demo.js` 的渐变没有添加色标，填充按语义透明；有色渐变由独立用例检查。字体回退、Chrome 后端、显卡及驱动变化可能改变像素结果。部分越界读取使用同一 Chrome 的 `willReadFrequently: true` 路径作为规范参照，原因见[此前的修复记录](docs/canvas-fixes.md#chrome-越界读取差异)。

## 当前修复与支持范围

- 第九轮阻止公开构造 ImageBitmap，并验证 getter/close 的接收对象；规范字体换行和转义、相对字重与斜体角度；HSL 绘制保留浮点颜色；缺失字形通过系统字体回退，并与组合标记分组、原生及合成 small-caps 共用测量/绘制布局。
- 第八轮在参数转换前校验 OffscreenCanvas 实例身份；补齐字体转义、保留字及多词序列化、现代 RGB/HSL 的注释和 `none`；修复开头组合重音的分段、合成斜体倾斜与变换后的基线像素对齐。
- 第七轮为缺少 `smcp` 的字体合成小型大写，测量和绘制共用分段字形布局；保留原有大写字母、数字和空格大小，并处理本轮覆盖的大小写展开与组合重音。
- 第六轮补齐尺寸转换重入、选项原型访问器、Blob 字典及状态检查、CSS 数字/注释/字体族处理和 alpha 序列化。文字支持 1～1000 的字重传递、字体自带的 OpenType `smcp` 特性，并修复空格后字母的字距。
- 第五轮补齐上下文及 ImageData 字典/枚举校验、异常转换顺序、访问器原生类型校验、shadowColor 序列化、字体盒/基线度量及 RTL 对齐与状态保存。
- 第四轮补齐 ImageData 只读属性与分离缓冲区检查、可迭代参数转换顺序、颜色及字体字符串转换、alpha 量化/序列化、字体列表选择和 em 基线计算。
- 非法 Unicode 颜色安全返回；现代 RGB/HSL 颜色、绝对单位字体简写、文本字符串转换及字形实际边界已补齐本轮覆盖行为。
- 图像绘制支持阴影；图像和 ImageData 入口校验对象身份、重载参数及源状态；矩阵字典与 roundRect 支持本轮验证的转换和异常规则。
- 空路径裁剪、`copy` 清理范围及空绘制处理、`alpha:false` 生命周期、图像平滑状态均已修复。
- `drawImage` 完整接收九个参数，支持负尺寸规范化、越界源处理和平滑采样；裁剪边缘保留 Chrome 的邻近像素采样行为。
- 补齐矩阵字典、可迭代虚线、常用绘制参数转换、像素脏矩形和尺寸规则；文字支持 `maxWidth`，非法字体赋值保留原状态。
- 圆锥渐变支持角度环绕；渐变参数执行数值转换、缺参、有限值和负半径检查。
- `globalAlpha` 忽略越界及非有限值；图像绘制同步当前透明度和已支持的合成模式。
- 描边命中测试使用当前线宽、端点、连接和虚线设置，包含 save/restore 后的状态。
- 同一 OffscreenCanvas 只保留一种上下文模式；非法名称抛 `TypeError`，已选其他模式时返回 `null`。
- 已有修复还覆盖路径变换、渐变共享引用、原位 resize、reset 裁剪清理、PNG 导出、位图转移、圆弧方向和像素读取参数。

`OffscreenCanvas.getContext()` 的名称区分大小写，不接受 `experimental-webgl`；本地 `HTMLCanvasElement` 包装仍支持这一别名。`bitmaprenderer` 现已实现，返回 `ImageBitmapRenderingContext`。

上述 6 项已于第二十二轮全部实现。`ctx.lang` 目前只实现属性语义，尚未接入按语言选择字体与整形；滤镜作用空间、序列化文本与 `DOMMatrix.multiply` 的乘序均已实测对齐；已知偏差为 `rotate(1rad)` 的 1 ULP 与 WebP 有损编码的 2/255。错误**文案**与 Chrome 不同属既有约定，历次对照只比较 error name。

Blob 导出支持 PNG、JPEG 和 WebP（`quality` 生效）；其他 MIME 请求回退为 PNG。位图是本地兼容对象，不是浏览器跨线程 transferable。项目尚未完整覆盖 `CanvasPattern.setTransform`、所有图像源和完整 WebGL pipeline；上下文互斥测试不代表完整 WebGL 绘制能力。图像入口接受项目创建的 Canvas/位图；ImageData 入口接受 Canvas 返回的 ImageData，不再把任意带 data 字段的普通对象当作图像。

字体解析支持常见样式、字体族及 px/pt 等绝对单位，已支持按字体族列表顺序查找已安装字体；尚未实现完整 CSS 语法、相对单位及逐字形回退。文字宽度、实际字形边界、字体盒和基线已与已测样本一致。`small-caps` 支持字体自带 `smcp`，缺少该特性时使用合成路径；已验证 Arial、Courier New、Tahoma、Consolas 的覆盖样本，尚未完整覆盖所有文字系统及按脚本选择的 OpenType 特性。RTL 修复覆盖对齐和状态，完整双向文字塑形、全部字体及 BASE 表未全面验证。已支持 sRGB / display-p3 和 8 位 / float16 原生画布及像素转换，但颜色解析仍未覆盖完整 CSS Color 语法。Canvas 尺寸仍受原生 u32 上限及可用内存限制。当前 4750 项与现有 Chrome 对照通过（浮点颜色使用上述精度阈值），不代表完整 Canvas 标准实现。

## 代码与记录

| 路径 | 用途 |
| --- | --- |
| [index.js](index.js) | Canvas 外壳、上下文模式、尺寸、位图及 Blob 包装。 |
| [src/webgl_native.rs](src/webgl_native.rs) | Node-API、参数转换、绘制状态和 Skia 调用。 |
| [src/canvas_css.rs](src/canvas_css.rs) | 本地字体简写及 RGB/HSL 颜色解析。 |
| [src/skia_backend.cpp](src/skia_backend.cpp) | Skia 后端、路径、渐变、字体、图像和像素读回。 |
| [src/png.js](src/png.js) | 使用 Node zlib 生成 PNG。 |
| [tests/browser-cases.js](tests/browser-cases.js) | Node 与现有 Chrome 共用的 47 项兼容性用例。 |
| [tests/additional-cases.js](tests/additional-cases.js)、[tests/compare-additional.cjs](tests/compare-additional.cjs) | 第二轮 45 项边界用例及差异比较，已纳入主回归。 |
| [docs/2026-09-14_offscreen-fixes-report.md](docs/2026-09-14_offscreen-fixes-report.md) | 第二轮修复、92 项验证及产物哈希。 |
| [docs/2026-09-14_third-round-review-report.md](docs/2026-09-14_third-round-review-report.md) | 第三轮新增差异、独立崩溃复现和对应诊断入口。 |
| [tests/third-round-cases.js](tests/third-round-cases.js)、[tests/unicode-color-case.js](tests/unicode-color-case.js) | 第三轮 65 项及独立防崩溃检查，均纳入主回归。 |
| [docs/2026-09-14_third-round-fixes-report.md](docs/2026-09-14_third-round-fixes-report.md) | 第三轮修复、158 项验收及最终产物哈希。 |
| [tests/gradient-gc.cjs](tests/gradient-gc.cjs) | 渐变共享引用与强制 GC 检查。 |
| [tests/png-reader.js](tests/png-reader.js) | 本地独立 PNG 解码；浏览器侧使用 createImageBitmap。 |
| [test.js](test.js)、[capture-cdp.cjs](capture-cdp.cjs) | 本地断言、现有 Chrome CDP 采集与比较。 |
| [tests/fourth-round-cases.js](tests/fourth-round-cases.js)、[docs/2026-09-15_fourth-round-verification-report.md](docs/2026-09-15_fourth-round-verification-report.md) | 第四轮 58 项、修复及 216 项最终实时验收。 |
| [tests/compare-fifth-round.cjs](tests/compare-fifth-round.cjs)、[docs/2026-09-15_fifth-round-fixes-report.md](docs/2026-09-15_fifth-round-fixes-report.md) | 第五轮 58 项，已纳入 274 项主回归；修复及最终实测证据。 |
| [tests/compare-sixth-round.cjs](tests/compare-sixth-round.cjs)、[docs/sixth-round-fixes.json](docs/sixth-round-fixes.json) | 第六轮 52 项已纳入 326 项主回归；逐项浏览器结果和最终源码/产物哈希。 |
| [tests/compare-seventh-round.cjs](tests/compare-seventh-round.cjs)、[docs/seventh-round-fixes.json](docs/seventh-round-fixes.json) | 第七轮 35 项、361 项验收结果、字体特性及源码/产物哈希。 |
| [tests/compare-eighth-round.cjs](tests/compare-eighth-round.cjs)、[docs/eighth-round-review.json](docs/eighth-round-review.json) | 第八轮 46 项独立诊断、29 项待修复差异及重复采集证据；未计入 361 项主回归。 |
| [visible-f12-demo.ps1](visible-f12-demo.ps1)、[tests/VisibleDevTools.cs](tests/VisibleDevTools.cs) | 历史桌面 F12 采集工具，默认验证不再调用。 |
| [canvas-task.ps1](canvas-task.ps1) | Build、Test、CDP Capture，以及历史窗口 Inspect 入口。 |
| [docs/offscreen-compatibility.md](docs/offscreen-compatibility.md) | 本次六类问题的修复与证据。 |
| [docs/canvas-fixes.md](docs/canvas-fixes.md) | 此前修复及 34 项验收记录。 |
| [HANDOFF.md](HANDOFF.md) | 历史 Chrome 后端分析与交接资料。 |
| [snapshot/manifest.json](snapshot/manifest.json) | 初始基线哈希和第三方版本；不代表当前源码及二进制哈希。 |

## 从源码构建

`build.rs` 使用本机 Visual Studio 18 BuildTools、Windows SDK、`third_party/chrome153-clang`、Skia 和 Dawn 静态库。大型第三方工具链与构建产物不随 GitHub 仓库下载；完整重建需要恢复这些依赖，并调整本机路径。

Skia 上游为 `https://skia.googlesource.com/skia.git`，记录的提交为 `4f574af2444846ceca4d277a8095c5d4229d175f`。依赖版本见 `snapshot/manifest.json`，GN 配置见 `snapshot/skia-args.gn`。恢复相应 checkout 后应用项目补丁：

```powershell
git -C third_party/skia apply ../../snapshot/skia-local.patch
```

恢复工具链及依赖、调整 `args.gn` 后，本机 Skia 构建命令为：

```powershell
third_party\gn\out\gn.exe gen third_party\skia\out\canvas2d-clang --script-executable=D:\python\py\python.exe
third_party\depot_tools\ninja.exe -C third_party\skia\out\canvas2d-clang skia skshaper skunicode_bidi skunicode_core
```

在已配齐依赖的本机环境中构建并部署 Node 模块：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
node test.js
```

默认 surface 为 BGRA8888、预乘 alpha、sRGB；读回为非预乘 RGBA。`CANVAS_USE_GANESH=1` 和 `CANVAS_RASTER_SURFACE=1` 分别选择 Ganesh 与 CPU 诊断路径，其像素不保证与默认后端一致。
