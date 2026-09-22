# OffscreenCanvas 第十六轮连续检测与修复

2026-09-16：本轮新增 **225 项全部通过**，完整 **1470 项**与现有 Chrome **153.0.8010.48** 实时一致，demo 的 **9216 个 RGBA 值零差异**。渐变和图案 GC 检查通过。本轮测试范围内没有剩余差异。

已修改 Rust/C++ 实现并重新构建 `webgl.node`，新增用例接入 `test.js`。`demo.js` 和 `index.js` 未改动。修复前的[检查报告](2026-09-16_sixteenth-round-review-report.md)及证据保持为历史记录。

## 修复内容

| Evidence：触发场景 | Finding：最终修复 | Path：实现位置 |
| --- | --- | --- |
| 端点重合的线性渐变、两圆相同的径向渐变，搭配 fill/stroke/fillText、阴影和 copy | 在调用 Skia 前识别 Canvas 不允许绘制的退化渐变，使用空着色器。原本错误出现的实色和阴影消失。 | `src/skia_backend.cpp`：`make_paint` |
| 单色色标、色标不在 0/1 边界、重复色标 | 按 Chromium 显式补齐 0 和 1 处的边界色标，避免 Skia 单色快捷处理造成阴影像素差异；空色标补透明黑。此前“可能是 dither 导致”的猜测没有作为修复依据，dither 设置保留。 | `make_paint` |
| 空路径中的零半径/零扫角 arc、退化 ellipse，随后追加 lineTo | arc 在角度归一化前判断原始 float 是否等角；退化 ellipse 根据起点、四分之一周期极值点、终点构建线段。空路径 lineTo 保留 Chrome 的 MoveTo + 同点 LineTo 状态。 | `skia_canvas_arc`、`skia_canvas_ellipse`、`skia_canvas_line_to` |
| `arc(..., 1e8, 1e8 + Math.PI)` 和 `arc(..., 1e20, 1e20 + Math.PI)` | 与 Chromium 一样，参数转 float 后先判等，再归一化，避免消减误差让等角变成弧线。未以不同的 double 角度规则替代 Chrome 行为。 | `skia_canvas_arc` |
| 半径 .25/.75 的开放圆弧 | 半径小于 1 时使用通用椭圆路径，半径至少 1 的空路径圆弧才使用 drawArc 快捷绘制。 | `skia_canvas_arc` |
| 单条直线、同点线段、曲线退化、copy 模式，及路径创建后改变/恢复矩阵 | 显式记录初始 move、单条 line 和通用路径状态；只有单条 line 的 fill 提前返回。其他路径操作及实际矩阵变化会退出快捷状态，即使随后恢复原矩阵。零包围盒路径的 stroke 提前返回。 | `Canvas::line_builder_state`、`draw_path`、路径与矩阵操作 |
| copy 下的 0×0 矩形，以及 ±1e-46 等非零尺寸 | 在 Rust 的 double 参数阶段判断真正的 0×0，避免清空原画布；不把转 float 后下溢为 0 的非零尺寸误认为原始零尺寸。 | `src/webgl_native.rs`：fillRect/clearRect、strokeRect 分派 |
| 单边为零的负尺寸 strokeRect，搭配 cap/dash、裁剪、阴影和不透明画布 | 规范化矩形方向；一边为零时按 Chromium 绘制闭合线段路径，跳过零长度边。 | `skia_canvas_stroke_rect` |

## 连续检查结果

| 阶段 | 累计新增用例 | 本阶段发现的失败用例 | 修复后剩余差异 |
| --- | ---: | ---: | ---: |
| 修复原检查结果 | 50 | 14 | 0 |
| 扩展小圆弧、色标、负矩形和退化路径 | 133 | 8 | 0 |
| 扩展闭合路径、矩阵状态、裁剪、极小尺寸 | 193 | 6 | 0 |
| 继续检查变换生命周期和极小单边矩形 | 225 | 0 | 0 |

累计修复 28 个不同的失败用例，不等于 28 个独立根因。最终新增 32 项未发现新差异后，运行包含全部旧用例的实时主回归，确认 1470 项全部通过。所有像素按 RGBA 分量严格比较，没有增加容差或使用参考数组回填。

## 验证与复现

在项目根目录、现有 Chrome CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
node test.js
node tests/compare-sixteenth-round.cjs
```

预期主回归 `totalCases=1470`、`browserVerified=true`、`sixteenthRoundFailures=[]`、`demoMismatches=0`，独立比较器 `tested=225`、`matched=225`、`differing=0`，均退出 0。

仅执行本地回归可用 `node test.js --local`；单独重新采集本轮参考可用：

```powershell
node capture-cdp.cjs tests/fourth-round-cases.js cdp-sixteenth-round
node tests/compare-sixteenth-round.cjs
```

验证使用项目原有持久 CDP 会话 `3f3dfe73-4928-4759-ad39-cd214de31a22`，只创建并关闭临时后台测试标签页。没有重启用户浏览器或调试服务。

最终本轮 runId：`e175f02fcdd046d4b01129a1b79dbd58`；demo runId：`f94507e7ecce4af588ad71371a36e710`。构建成功，仍有原有 11 条 Rust 编译警告；`git diff --check` 通过。

## 依据与证据

核对的 Chromium 参考版本为 `153.0.8010.48`：

- [CanvasPath：圆弧、退化椭圆和路径构建状态](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/modules/canvas/canvas2d/canvas_path.cc)。
- [Gradient：退化处理与边界色标补齐](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/platform/graphics/gradient.cc)。
- [Canvas2DRecorderContext：矩形、路径与矩阵变换](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/modules/canvas/canvas2d/canvas_2d_recorder_context.cc)。

这些公开参考源码保存在 `out/chromium-*.cc`。也检查了 PaintOp、PaintFlags、RecordPaintCanvas 与 Chrome 对应 Skia 的 Device 分派，未替换第三方 Skia 库。

[sixteenth-round-fixes.json](sixteenth-round-fixes.json) 保存最终源码/二进制 SHA-256、主回归结果、参考源码哈希及 225 项本地/浏览器结果哈希。完整数组和逐项比较在 `out/cdp-sixteenth-round-{local,browser,diff}.json`；初始 50 项的失败证据保存在 [sixteenth-round-review.json](sixteenth-round-review.json)。

“没有剩余差异”限定于本次覆盖的调用、当前 Windows 字体和图形环境、Chrome 版本；不表示整个 Canvas 标准的所有输入和运行环境均已证明无缺陷。
