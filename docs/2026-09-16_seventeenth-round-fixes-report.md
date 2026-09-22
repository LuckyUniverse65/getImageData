# OffscreenCanvas 第十七轮连续检测与修复

2026-09-16：本轮新增 **172 项全部通过**，完整 **1642 项**与现机 Chrome **153.0.8010.48** 实时对照一致；demo 的 **9216 个 RGBA 值零差异**，渐变与图案 GC 检查通过。本轮验证范围内没有剩余差异。

修复已落实到 Rust/C++ 实现并重新构建 `webgl.node`，新增用例已接入 `test.js`。

| 触发场景与证据 | 原因与修复 | 实现位置 |
| --- | --- | --- |
| 空路径直接调用 quadraticCurveTo、bezierCurveTo 或 arcTo | Skia 的默认起点不符合 Canvas 行为；贝塞尔曲线先移动到第一个控制点，空路径 arcTo 只移动到第一个点 | `src/skia_backend.cpp`：曲线方法 |
| 同点线段 closePath，或命中测试、clip 后再 closePath | 补充路径缓存状态，区分已实体化与未实体化的同点线段，正确清除退化线段或保留起点 | `Canvas::line_path_cached`、`skia_canvas_close_path` |
| 零尺寸 rect、扁平 roundRect 后继续绘制 | 0×0 rect 使用 moveTo；扁平 roundRect 保留原始矩形路径语义 | rect / roundRect 方法 |
| 负尺寸 roundRect 的填充、后续曲线与虚线；不对称圆角 | 按宽高符号确定方向，显式使用 Skia 起始索引 0，并恢复 Canvas 规定的当前点，消除绕向和虚线相位差异 | `skia_canvas_round_rect` |
| 用 maxWidth 压缩文字后继续绘制既有路径 | 公开矩阵方法会使路径优化状态失效；改为 C++ 内部保存和恢复绘制矩阵，并通过 FFI 传递水平缩放 | `src/webgl_native.rs`、`skia_canvas_draw_text` |
| 压缩文字使用渐变、图案、阴影和不同对齐方式 | 平移后缩放导致着色坐标偏移；改为从画布原点水平缩放，并反向调整文字 x 坐标 | `skia_canvas_draw_text` |

连续检查记录如下。失败数表示不同的失败用例数量，不是独立根因数量。

| 累计新增用例 | 本阶段新发现失败 | 修复后剩余差异 |
| ---: | ---: | ---: |
| 66 | 30 | 0 |
| 114 | 10 | 0 |
| 148 | 18 | 0 |
| 172 | 0 | 0 |

共修复 58 个失败用例。最后补充的 24 项覆盖不对称圆角、压缩文字对齐及曲线路径生命周期，没有发现新差异，随后完整回归 1642 项全部通过。像素按 RGBA 分量严格比较，未增加容差。

在项目根目录、现有 Chrome CDP 会话可用时复现：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
node test.js
node tests/compare-seventeenth-round.cjs
```

主回归预期 `totalCases=1642`、`browserVerified=true`、`seventeenthRoundFailures=[]`、`demoMismatches=0`；独立比较器预期 `tested=172`、`matched=172`、`differing=0`。需要单独重新采集本轮参考时执行：

```powershell
node capture-cdp.cjs tests/fourth-round-cases.js cdp-seventeenth-round
node tests/compare-seventeenth-round.cjs
```

最终本轮 runId 为 `33c0a08ebb2d4a05a1a4c664386968f5`，demo runId 为 `05913c1a243047b1a1239ee7b47ba24c`。验证复用持久 CDP 会话 `3f3dfe73-4928-4759-ad39-cd214de31a22`。构建成功，仍有原有 11 条 Rust 编译警告。

修复依据包括 Chromium 153.0.8010.48 的 [CanvasPath](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/modules/canvas/canvas2d/canvas_path.cc)、[PathBuilder](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/platform/geometry/path_builder.cc) 及 [BaseRenderingContext2D](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/modules/canvas/canvas2d/base_rendering_context_2d.cc) 的路径和文字缩放实现。

[最终证据](seventeenth-round-fixes.json) 保存阶段统计、完整回归结果、源码和二进制 SHA-256、参考源码哈希及 172 项本地/浏览器结果哈希。[初始检查证据](seventeenth-round-review.json) 保留最初 66 项中 30 项失败的记录。完整结果数组及差异在 `out/cdp-seventeenth-round-{local,browser,diff}.json`。

结论限定于本轮覆盖的调用、当前 Windows 字体与图形环境及浏览器版本，不代表已证明所有 Canvas 输入和运行环境均无缺陷。
