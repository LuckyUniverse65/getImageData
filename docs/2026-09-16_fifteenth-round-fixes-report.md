# OffscreenCanvas 第十五轮连续检测与修复

2026-09-16，本轮新增 **271 项全部通过**，完整 **1245 项**与用户现有 Chrome **153.0.8010.48** 实时对照一致。原始 demo 的 **9216 个 RGBA 值零差异**，渐变和图案 GC 检查通过。已验证场景内没有剩余差异。

## 检查与修复

首批 59 项发现 14 个失败用例。修复后继续增加图案文字、极端字距、字体单位、合成模式及颜色检查，逐次修复新增差异，最终收敛到 271 项全部一致。其中 148 项覆盖 CSS 命名颜色。失败用例数不等于独立根因数。

| Evidence：触发场景 | Finding：原因与修复 | Path：实现位置 |
| --- | --- | --- |
| `spacingParsing_*`、`saturatedWords_*` | 接受有效数字语法中的溢出值，按 float 上限与 16.16 字距范围饱和；按词及普通空格分段累加宽度；负字距的空白段不扩展墨迹边界 | `src/canvas_css.rs` 的 `parsed_number`、`spacing`；`src/skia_backend.cpp` 的 `PositionedRunHandler::spacing`、`skia_canvas_text_bounds` |
| `rootUnitFontChange_*` | 补齐 rex/rch/rcap/ric；区分直接设置字距与字体变化触发的重新计算，保存并恢复该状态 | `src/webgl_native.rs` 的 `sync_native_text`、属性 setter、CanvasState |
| `overflowOtherProperties` | 字号溢出应限制为 10000px；其他属性继续使用各自的有效值规则 | `src/canvas_css.rs` 的 `font` |
| `unicodeBoundary_"a\\u000bb"_*` | 垂直制表符应按空格参与文字绘制和测量 | `index.js` 的文字参数转换 |
| `styleShadow_pattern_*`、`patternShadowBoundary_*` | 普通图案绘制的阴影应作用于渲染后的透明度；复用设备坐标下的离屏图层和 DropShadow 滤镜 | `src/skia_backend.cpp` 的 `draw_with_filtered_shadow`、`draw_with_shadow` |
| `textPaintIsolation_*`、`patternTextBoundary_*` | 图案文字的字形缓存生成与最终图案着色使用不同的画笔状态。使用黑色回退画笔准备 Slug，再以真实图案绘制；非 GPU 路径保留直接文字绘制回退 | `skia_canvas_draw_text` |
| `patternTextBoundary_strokeText_copy`、`copyTextOverlap_*` | copy 清除后仍需以 Src 绘制，否则重叠字形会多次叠加；不透明画布需要在完成绘制后以黑色 DstOver 恢复 alpha | `draw_with_shadow` |
| `copyTextOverlap_*_true_*` | 不透明画布的文字需要 RGB 水平子像素几何；内部保留预乘 alpha，避免 Skia 依据“不透明”标记错误省略 alpha 恢复 | `skia_canvas_create` |
| `namedColor_*`，以及使用 orange 背景的裁剪测试 | 原来只识别少量命名颜色；补齐 148 个标准名称、grey 别名及 rebeccapurple | `src/canvas_css.rs` 的 `named_color`；`src/webgl_native.rs` 的 `parse_color` |

新增用例位于 [fourth-round-cases.js](../tests/fourth-round-cases.js) 的 `runFifteenthRoundCases`，已接入 [test.js](../test.js)。比较器 [compare-fifteenth-round.cjs](../tests/compare-fifteenth-round.cjs) 校验脚本哈希、浏览器模式、用例集合并严格比较结果，未增加像素容差。

扩展检查曾触发 Node 断言生成大量数组差异文本、耗尽堆内存。第十五轮逐项比较改用 `isDeepStrictEqual` 收集失败名称，完整差异由独立比较器写入文件；比较精度不变。

## 依据与验收

对照 Chromium 153.0.8010.48 的 `Canvas2DRecorderContext::DrawInternal` / `ResetAlphaIfNeeded`、`PaintShader::GetSkShader`、`DrawTextBlobOp::RasterWithFlags`、`DrawSlugOp::RasterWithFlags`，以及 `PlainTextNode` 的文字分段和度量。命名颜色标准值使用项目所带 Skia 颜色表核对，并补齐 grey 别名及 rebeccapurple，全部与 Chrome getter 和实际像素独立对照。

| 验收项目 | 结果 |
| --- | --- |
| 新增用例 | tested=271，matched=271，differing=0 |
| 完整实时回归 | totalCases=1245，browserVerified=true，各轮失败列表为空 |
| 原始 demo | 9216 个 RGBA 值，0 差异，文件未修改 |
| 生命周期 | gradientGC=true，patternGC=true |
| 构建 | release 构建通过，仍有原有 11 条 Rust 警告 |
| 补丁格式 | `git diff --check` 通过 |

本轮最终采集 runId：`8584fe7516c54c9fb216d0abec383366`；demo runId：`cdf512d4a2e540b1b72e4e6cae6b3535`。

浏览器验证始终复用用户手动启动的 Chrome、CDP 端口 **9222**、连接 **3f3dfe73-4928-4759-ad39-cd214de31a22**。没有鼠标、键盘或剪贴板操作，没有重启浏览器和持久调试服务。

源码、二进制、测试、参考文件的 SHA-256，首次失败证据及最终逐项结果摘要见 [fifteenth-round-fixes.json](fifteenth-round-fixes.json)。逐项哈希针对紧凑 UTF-8 JSON 结果生成；完整实时输出在 `out/cdp-fifteenth-round-{browser,local,diff}.json`。历史报告保持不变。

demo SHA-256：`FEA443544EEFDB59C29593EAEC43BBA59CECADCF104A69B99B189B6206F9300E`。

## 复现

在项目目录且现有 Chrome 持久调试会话可用时运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-fifteenth-round.cjs
```

预期均退出 0，主回归报告 1245 项通过，本轮比较器报告 271 项一致、0 差异。结论限于当前 Windows、字体、Graphite/Dawn 后端、Chrome 版本和所列测试场景，不代表完整 Canvas 标准的所有行为均已验证。
