# OffscreenCanvas 第五轮修复与验收

2026-09-15，第五轮报告中的 **27 个失败用例已全部修复**。补充 12 项相关边界检查后，第五轮 58 项均与用户现有 Chrome 153.0.8010.37 一致，并已纳入主回归。最终 **274 项全部通过实时对照**，demo 的 9216 个 RGBA 值零差异，渐变强制 GC 检查通过。

## 修复、证据与实现

| 证据 | 修复后的行为 | 代码路径 |
| --- | --- | --- |
| `contextOptionsReadOrder`、重复 getContext 及非法 colorSpace/colorType | 按顺序读取并转换上下文选项；即使返回已存在的上下文，也先执行转换并传播 getter 异常；非法枚举在创建上下文前抛 TypeError。 | [JS contextOptions / getContext](../index.js) |
| ImageData settings 四项原有差异、`imageSettingsBeforeZeroSize`、`imageSettingsAfterCoordinates` | 按坐标数值转换、settings 字典转换、实际调用的顺序执行。非法 colorSpace/pixelFormat 抛 TypeError；即使零尺寸会报错，也先完成 settings 转换。 | JS signedLong / imageDataSettings / ImageData 包装 |
| `gradientConversionOrder_2`、`gradientColorThrowBeforeRange` | 有限 offset 转换后先执行 color 的 DOMString 转换，再检查 offset 范围；颜色转换异常获得正确优先级。非有限 offset 仍在颜色转换前抛 TypeError。 | [Rust gradient_add_stop](../src/webgl_native.rs) |
| getter/setter 无效 receiver，以及新增不同原生对象冒充 receiver | 先检查 Canvas 2D 类型标签，再读取原生状态；无效 getter/setter 抛 TypeError，且不运行参数 toString/valueOf。 | Rust CANVAS_2D_TYPE_TAG / canvas_2d_from / 属性访问器 |
| `numericPropertyReentrantResize`、已有数值属性重入用例 | 字符串和数值转换在持有可变 Canvas 状态之前完成；转换期间 resize 后仍将转换结果应用到当前状态。 | Rust set_canvas_property |
| `shadowColor_*`、`shadowColorInvalidPreserves`、`shadowModernAlpha` | shadowColor 复用 CSS 颜色序列化：不透明 red 返回 `#ff0000`，半透明返回 rgba 短小数，非法赋值保留原状态。保存/恢复行为继续通过。 | Rust get_canvas_property / style_value |
| 六种 `fontMetrics_*`、`metricsSmallFont`、`metricsFractionalFont` | 统一字体盒及基线计算：普通字体按 Chrome 的升降部舍入规则处理，极小字体保留亚像素度量；各字段根据 textBaseline 偏移，并保持相同 float 精度。hanging/ideographic 的实际字形边界同步修正。 | Rust text_font_metrics / text_baseline_offset / measureText |
| 当前 Chrome 缺少的 emHeight 字段 | 不再输出 `emHeightAscent` / `emHeightDescent`，与本轮参照 Chrome 的 API 表面一致。 | Rust measureText |
| RTL start/end、direction save/restore/reset/resize、实际绘制对齐 | direction 进入原生状态；绘制和 measureText 共用对齐计算。RTL 下 start/end 交换方向，save/restore 恢复方向；OffscreenCanvas 的 inherit 在 getter 上解析为 ltr，reset/resize 恢复默认方向。 | Rust Canvas2D / CanvasState / text_align_offset |

字体度量规则核对 Chromium `153.0.8010.37` 的 [FontMetrics::AscentDescentWithHacks](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.37/third_party/blink/renderer/platform/fonts/font_metrics.cc) 及 [TextMetrics](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.37/third_party/blink/renderer/core/html/canvas/text_metrics.cc)。例如 2px Arial 保留 ascent `1.810546875`；小数字号的基线运算按 float 顺序计算，避免将中间结果提升到 double 后产生新的差异。这些规则由字体度量计算，未写死字体名称或样本返回值。

## 验证

| 检查 | 结果 |
| --- | --- |
| 原有主回归 | 216/216 与新采集 Chrome 结果一致 |
| 第五轮原 46 项及新增 12 项 | 58/58 一致，已纳入主回归 |
| 总数 | 274 项 |
| demo.js | 9216 个 RGBA 值，0 差异；源码未修改 |
| 渐变 GC | 通过 |
| release 构建 | 成功，保留原有 11 条编译警告 |
| 完整回归、第四轮及第五轮比较器 | 均退出 0 |

第五轮本地测试在独立 Node 子进程运行，包含原生访问器与重入行为，子进程退出 0。主回归先执行关键语义断言，再将所有测试与新采集的 Chrome 数据逐项精确比较；不使用容差。

所有浏览器验证都复用 `f823af05-4dbf-4e1f-b5f5-31251732a225`。完整回归的六次采集共用一条连接，第四轮和第五轮通过同一次后台页面执行返回独立结果；没有重新启动 Chrome、操作鼠标、键盘或剪贴板。测试完成后保持该连接。

最终第四/第五轮采集编号为 `c97be689be154c658b5ab631c99531d1`。源码、原生产物 SHA-256、全部浏览器返回值和比较结果见 [fifth-round-fixes.json](fifth-round-fixes.json)。[修复前报告](2026-09-15_fifth-round-review-report.md)和 [JSON](fifth-round-review.json)保留原始差异。

## 复现

在项目根目录、构建依赖齐全且用户 Chrome 调试会话有效时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-fourth-round.cjs
node tests/compare-fifth-round.cjs
```

`node test.js --local` 仅运行本地回归；完整 Test 会刷新所有浏览器证据。第四轮入口返回 `{fourthRound, fifthRound}`，主回归及比较器分别验证两组，并核对测试源文件哈希及用例集合。

## 支持范围

本轮完成的是已确认的转换、校验、度量、序列化和方向状态差异。colorSpace/colorType/pixelFormat 的非法值校验通过，不代表 display-p3 或 float16 像素管线已实现；当前原生绘图/读取仍使用既有 sRGB、8 位路径。direction 已作用于对齐和状态，完整双向文字塑形、逐字形字体回退及各字体 BASE 表仍未全面支持或验证。完整 CSS Color、Path2D、CanvasPattern 变换、跨线程 transferable 和完整 WebGL 仍在已验证范围之外。

274 项通过证明这些覆盖行为在当前 Chrome、字体和图形后端下保持一致，不代表完整浏览器 Canvas 实现。
