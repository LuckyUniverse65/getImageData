# Canvas 2D Chrome 153 像素对齐交接

更新日期：2026-09-12

## 最终结果

指定的 `demo.js` 已达到逐值一致：用户从桌面快捷方式启动的普通 Google Chrome 153，在可见 F12 Console 中执行 `demo.js` 得到的 `globalThis.data`，与 Node.js 运行 `data.js` 得到的 9216 个 RGBA 值完全相同。

```text
Chrome: 153.0.8010.37
values: 9216
mismatches: 0
absoluteDifference: 0
alphaDifference: 0
colorDifference: 0
equal: true
pixelBytesSHA256: 67739B2761EDFE2D5B59A0DAC4BD747085702B71F7E46A5642D16203489BA962
```

最终现场证据：

- `out/chrome153-visible-f12.json`：可见 F12 新执行得到的浏览器数组
- `out/chrome153-visible-f12-result.json`：逐值比较结果
- `out/chrome153-visible-f12.png`：执行完成后的可见桌面截图

浏览器和本地是两条独立执行链。浏览器没有读取本地数组，本地也没有读取或回填浏览器数组。

## 正确根因

旧结论“普通 Chrome 153 使用 Skia GaneshGL + ANGLE D3D11”是错的。干净临时 profile 确实使用 Ganesh，所以旧测试可以得到零差异；但用户普通 Chrome 的生产 Variations 实验启用了：

```text
SkiaGraphite/EnabledWithPersistentCache_20260820_WIN_STABLE
SkiaGraphiteWinIntel/Enabled_20260831
```

用户实际 Chrome 后端为：

```text
skiaBackendType: GraphiteDawnD3D11
featureStatus.skia_graphite: enabled_on
```

旧本地后端为 GaneshGL + ANGLE D3D11。虽然两边同为 D3D11，Skia 的 Ganesh 与 Graphite 光栅化和合成结果并不逐像素相同，造成稳定的 3962 个不同值：

```text
mismatches: 3962
absoluteDifference: 101392
alphaDifference: 11845
colorDifference: 89547
```

本地现在默认使用 Skia Graphite + Dawn D3D11，因此与用户普通 Chrome 对齐。此前对空 gradient、ellipse 浮点顺序等行为的兼容修改仍然有效，但它们不是这次 3962 个差异的根因。

## 验收方式

常规自动验收：

```powershell
node test.js
```

`test.js` 默认把当前用户的 Chrome Variations seed 复制到临时 profile，在可见普通窗口的新标签页中执行 `demo.js`，同时由独立 Node 子进程执行 `data.js`，最后逐项比较。临时 Chrome 和 profile 会在测试后关闭、删除。

诊断干净 profile 或文件页时使用：

```powershell
node test.js --clean-profile
node test.js --clean-profile --file-page
```

最终验收仍以用户手工打开的 Chrome/F12 为准。打开 F12 后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\python\getImageData\visible-f12-demo.ps1
```

该脚本会把 `demo.js` 粘贴到当前可见 Console、执行、读取 `globalThis.data`，并保存数组、结果和截图。整个操作在桌面可见。

本地输出可单独查看：

```powershell
node data.js
```

## 关键文件

| 文件 | 用途 |
|---|---|
| `demo.js` | 浏览器与本地共同执行的指定绘制步骤 |
| `data.js` | Node 本地运行入口 |
| `index.js` | Node 侧 Canvas API 包装与导出 |
| `test.js` | 两条独立执行链的逐值自动比较 |
| `test.html` | 文件页诊断入口 |
| `visible-f12-demo.ps1` | 操作用户当前可见 F12 的最终验收脚本 |
| `src/webgl_native.rs` | Node-API 绑定和 JS API 分派 |
| `src/skia_backend.cpp` | Skia Graphite/Dawn D3D11 Canvas 2D 后端；含 Ganesh 诊断回退 |
| `build.rs` | clang-cl 编译及 Skia、Dawn、ANGLE 链接配置 |

## 构建配置

`third_party/skia/out/canvas2d-clang/args.gn` 的关键配置：

```gn
skia_enable_ganesh = true
skia_enable_graphite = true
skia_use_dawn = true
dawn_enable_d3d11 = true
dawn_enable_d3d12 = false
dawn_enable_opengles = false
dawn_enable_vulkan = false
```

项目内 `third_party/skia/third_party/dawn/build_dawn.py` 包含三项 Windows 构建兼容处理：关闭未使用的 C++ modules、仅对子进程信任 Dawn checkout、在 PATH 缺少 `ninja` 时使用项目内 `third_party/depot_tools/ninja.exe`。不要改全局 Git safe.directory。

重新生成并构建 Skia：

```powershell
third_party\gn\out\gn.exe gen third_party\skia\out\canvas2d-clang --script-executable=D:\python\py\python.exe
third_party\depot_tools\ninja.exe -C third_party\skia\out\canvas2d-clang skia skshaper skunicode_bidi skunicode_core
```

重新构建和部署 Node 模块：

```powershell
cargo build --release
Copy-Item target\release\webgl.dll webgl.node -Force
node test.js
```

当前产物：

```text
Node.js: v22.13.1
webgl.node SHA256: F09C34CA8283A4C859A986962890AACDD76BEC7D50BCC6B2569C7F9DFD175A8B
```

## 实现注意事项

- 默认 surface 为 BGRA8888、premultiplied alpha、sRGB，Graphite 内部 MSAA 为 4。
- Graphite 每个 Canvas 持有自己的 Recorder；`getImageData()` 先提交 Recording，再使用 Graphite 异步读回 API 并以 `SyncToCpu::kYes` 等待。
- `CANVAS_USE_GANESH=1` 可切回旧 GaneshGL + ANGLE D3D11 路径，仅用于诊断。
- `CANVAS_RASTER_SURFACE=1` 可切到 CPU raster，仅用于诊断。
- `webgl.node`、`libEGL.dll` 和 `libGLESv2.dll` 保持同目录部署；后两个 DLL 供 Ganesh 回退路径使用。
- Chrome、Skia、Dawn、显卡或驱动版本变化后，必须重新运行可见 F12 验收，不能沿用旧数组作为新版本结论。
- 项目根目录不是 Git 仓库；`third_party/skia` 是独立 checkout，包含本项目需要的构建修改，不要随意还原。

## 未覆盖范围

当前零差异结论只针对指定的 `demo.js`。项目不是完整浏览器实现，尚未完整覆盖 `CanvasPattern.setTransform`、所有浏览器 image source 类型、`arcTo` 的全部边界条件，以及完整 WebGL shader/program/buffer/texture pipeline。
