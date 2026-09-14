# getImageData

Windows 上的 Node.js `OffscreenCanvas` 兼容层。JavaScript 提供 Canvas 外壳，Rust 通过 Node-API 分派接口，C++ 调用 Skia Graphite / Dawn D3D11 绘制和读取像素。

2026-09-14 完成第三轮修复：此前 36 项差异和 Unicode 颜色导致的 Node 进程崩溃均已修复。原有 92 项、扩充后的第三轮 65 项及 1 项独立防崩溃检查，共 **158 项**，全部与用户手动打开的 Chrome 153.0.8010.37 一致；`demo.js` 的 9216 个 RGBA 值零差异，强制 GC 检查通过。详见[第三轮修复记录](docs/2026-09-14_third-round-fixes-report.md)。

[第二轮修复记录](docs/2026-09-14_offscreen-fixes-report.md)和[第三轮修复前检测](docs/2026-09-14_third-round-review-report.md)保留了历史结果及证据。

第四轮继续检测：46 项新增定向用例中发现 29 项差异，涉及 ImageData 生命周期、25% 透明度像素、非法 CSS 校验及转换顺序等，尚未修复。详见[第四轮检测报告](docs/2026-09-14_fourth-round-review-report.md)。此前 158 项通过不代表这些新增边界已被覆盖。

## 运行

需要 Windows x64、Node.js，以及支持当前 Dawn D3D11 后端的显卡和驱动。本机使用 Node.js v22.13.1。仓库包含编译产物，可直接执行：

```powershell
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

`webgl.node`、`libEGL.dll` 和 `libGLESv2.dll` 应放在项目根目录。项目没有 npm 安装步骤；`require('./')` 通过 `index.js` 加载模块。

## 使用现有 Chrome 的 CDP 验证

在用户手动打开的 Chrome 中开启远程调试，保持浏览器运行，默认端口为 9222。F12 可以关闭，然后执行：

```powershell
node test.js
```

脚本直接通过 CDP 执行 JavaScript 和读取结果，不移动鼠标、不模拟键盘、不使用剪贴板。每次在现有浏览器及 profile 中创建后台测试标签页，结束后只关闭该测试页。不会启动新浏览器、切换 profile 或操作用户已有标签页；你可以继续处理其他任务。

Chrome 首次连接可能显示远程调试授权提示，需要用户允许。端口可通过 `CHROME_DEBUG_PORT` 设置。优先读取现有 profile 的 `DevToolsActivePort`；非默认 profile 可通过 `CHROME_DEVTOOLS_ACTIVE_PORT_FILE` 指定其文件路径。如果 HTTP `/json/version` 返回 404，仍可通过该文件提供的 WebSocket 连接。

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

`node test.js` 执行三组测试及独立防崩溃检查，共 158 项，另有 demo 和 GC 检查。`out/cdp-verification-result.json` 保存主回归结果；`out/cdp-*-browser.json` 保存各组实际浏览器返回值、运行编号、时间、Chrome 版本、测试标签页 ID 和源码 SHA-256。运行 `node tests/compare-additional.cjs`、`node tests/compare-third-round.cjs` 或 `node tests/compare-unicode-color.cjs` 可生成对应逐项结果；存在差异时比较器退出码为 1。CDP 输出与历史 F12 输出分别保存，`out/` 不提交到 Git。

`demo.js` 的渐变没有添加色标，填充按语义透明；有色渐变由独立用例检查。字体回退、Chrome 后端、显卡及驱动变化可能改变像素结果。部分越界读取使用同一 Chrome 的 `willReadFrequently: true` 路径作为规范参照，原因见[此前的修复记录](docs/canvas-fixes.md#chrome-越界读取差异)。

## 当前修复与支持范围

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

`OffscreenCanvas.getContext()` 的名称区分大小写，不接受 `experimental-webgl`；本地 `HTMLCanvasElement` 包装仍支持这一别名。`bitmaprenderer` 是合法名称，但本地尚未实现该上下文，返回 `null`。

Blob 导出支持 PNG；其他 MIME 请求回退为 PNG。位图是本地兼容对象，不是浏览器跨线程 transferable。项目尚未完整覆盖 `CanvasPattern.setTransform`、所有图像源和完整 WebGL pipeline；上下文互斥测试不代表完整 WebGL 绘制能力。图像入口接受项目创建的 Canvas/位图；ImageData 入口接受 Canvas 返回的 ImageData，不再把任意带 data 字段的普通对象当作图像。

字体解析支持常见样式、字体族及 px/pt 等绝对单位，尚未实现完整 CSS 语法、相对单位和完整字体回退列表。文字宽度与实际字形边界已与本轮样本一致，全部字体、复杂文字排版和其他 TextMetrics 字段仍未完整验证。颜色解析也不是完整 CSS Color 实现。Canvas 尺寸仍受原生 u32 上限及可用内存限制。158 项通过表示已覆盖行为与当前 Chrome 一致，不代表完整 Canvas 标准实现。

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
