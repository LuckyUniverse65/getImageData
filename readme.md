# getImageData

Windows 上的 Node.js `OffscreenCanvas` 兼容层。JavaScript 提供 Canvas 外壳，Rust 通过 Node-API 分派接口，C++ 调用 Skia Graphite / Dawn D3D11 绘制和读取像素。

2026-09-14 验证：47 项兼容性结果与用户手动打开的 Chrome 153.0.8010.37 / F12 一致，`demo.js` 的 9216 个 RGBA 值零差异。此结果覆盖现有用例，不代表完整浏览器 Canvas API。详见[本次修复记录](docs/offscreen-compatibility.md)。

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

## 使用现有 Chrome/F12 验证

所有浏览器验证均使用用户手动打开的 Chrome/F12。提前将 F12 分离为独立窗口，选中 Console，保留一个这样的窗口，然后执行：

```powershell
node test.js
```

脚本会聚焦现有 DevTools、输入测试代码、临时使用并恢复剪贴板，保存本次结果和截图。运行过程中让脚本使用键盘和鼠标。它不会启动、重启或关闭 Chrome，也不会使用其他 profile 或历史数组替代本次浏览器执行结果。

只运行本地回归：

```powershell
node test.js --local
```

单独采集 demo 或诊断已有窗口：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath demo.js -OutputName demo
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Inspect
```

`out/verification-result.json` 保存对比结果；`out/compatibility-browser.json` 和 `out/demo-browser.json` 保存实际浏览器返回值、运行编号、采集时间、进程、Chrome 版本和测试源码 SHA-256。对应的 `*-f12.png` 是窗口截图。脚本只接受本次运行编号的结果，`out/` 不提交到 Git。

`demo.js` 的渐变没有添加色标，填充按语义透明；有色渐变由独立用例检查。字体回退、Chrome 后端、显卡及驱动变化可能改变像素结果。部分越界读取使用同一 Chrome 的 `willReadFrequently: true` 路径作为规范参照，原因见[此前的修复记录](docs/canvas-fixes.md#chrome-越界读取差异)。

## 当前修复与支持范围

- 圆锥渐变支持角度环绕；渐变参数执行数值转换、缺参、有限值和负半径检查。
- `globalAlpha` 忽略越界及非有限值；图像绘制同步当前透明度和已支持的合成模式。
- 描边命中测试使用当前线宽、端点、连接和虚线设置，包含 save/restore 后的状态。
- 同一 OffscreenCanvas 只保留一种上下文模式；非法名称抛 `TypeError`，已选其他模式时返回 `null`。
- 已有修复还覆盖路径变换、渐变共享引用、原位 resize、reset 裁剪清理、PNG 导出、位图转移、圆弧方向和像素读取参数。

`OffscreenCanvas.getContext()` 的名称区分大小写，不接受 `experimental-webgl`；本地 `HTMLCanvasElement` 包装仍支持这一别名。`bitmaprenderer` 是合法名称，但本地尚未实现该上下文，返回 `null`。

Blob 导出支持 PNG；其他 MIME 请求回退为 PNG。位图是本地兼容对象，不是浏览器跨线程 transferable。项目尚未完整覆盖 `CanvasPattern.setTransform`、所有图像源、图像阴影和完整 WebGL pipeline；上下文互斥测试不代表完整 WebGL 绘制能力。

## 代码与记录

| 路径 | 用途 |
| --- | --- |
| [index.js](index.js) | Canvas 外壳、上下文模式、尺寸、位图及 Blob 包装。 |
| [src/webgl_native.rs](src/webgl_native.rs) | Node-API、参数转换、绘制状态和 Skia 调用。 |
| [src/skia_backend.cpp](src/skia_backend.cpp) | Skia 后端、路径、渐变、字体、图像和像素读回。 |
| [src/png.js](src/png.js) | 使用 Node zlib 生成 PNG。 |
| [tests/browser-cases.js](tests/browser-cases.js) | Node 与现有 Chrome/F12 共用的兼容性用例。 |
| [tests/gradient-gc.cjs](tests/gradient-gc.cjs) | 渐变共享引用与强制 GC 检查。 |
| [tests/png-reader.js](tests/png-reader.js) | 本地独立 PNG 解码；浏览器侧使用 createImageBitmap。 |
| [test.js](test.js) | 本地断言、F12 采集、完整结果比较。 |
| [visible-f12-demo.ps1](visible-f12-demo.ps1)、[tests/VisibleDevTools.cs](tests/VisibleDevTools.cs) | 枚举现有窗口，执行 F12 输入、剪贴板采集及截图。 |
| [canvas-task.ps1](canvas-task.ps1) | Build、Test、Capture、Inspect 入口。 |
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
