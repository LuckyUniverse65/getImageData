# OffscreenCanvas 第十三轮修复验收

2026-09-16，原有 **32 个失败用例全部修复**。第十三轮从 57 项扩展到 **92 项，全数与用户现有 Chrome 一致**；完整回归 **794 项通过**，原始 demo 的 **9216 个 RGBA 值零差异**，渐变与图案 GC 检查通过。比较使用精确值，没有放宽像素容差。

## 修复与证据

| Evidence：触发用例 | Finding：原因及修复结果 | Path：实现位置 |
| --- | --- | --- |
| `zeroSizeText_*`、`zeroResizeTextMeasurement`、`zeroTextOptions_*` | 宽或高为零时没有栅格表面，旧实现退回近似宽度和空边界。新增不分配栅格表面的文字上下文，复用字体测量和缓存；尺寸恢复、基线和文字属性仍一致 | [webgl_native.rs](../src/webgl_native.rs) 的 `TextCache`、`text_context`；[skia_backend.cpp](../src/skia_backend.cpp) 的 `skia_text_context_create` |
| `bidiFallback_rtl_hebrewHan` | 先按字体切段会丢失整段双向文本顺序。先解析整段 bidi，再在视觉分段内进行字体回退，RTL 分段中的字体子段也反转 | `font_runs_blob` |
| `unicodeSpacing_*` | 零宽控制符和连写文字错误增加字距，部分不可见字形被直接字形路径替换。跳过这些字符的字距，保留塑形结果 | `PositionedRunHandler::spacing`、`make_shaped_text_blob` |
| `textAdditionalState_*`、`fontOptionsReentry_*` | 补齐 `fontStretch`、`fontVariantCaps`、`textRendering` 原生状态、非法值处理、字符串转换重入、save/restore 和 reset；字体选项也进入空格缓存键 | `Canvas2D`、`CanvasState`、原生属性访问器、`SpaceShapeEntry` |
| `variantCapsModes_*`、`renderingModes_*` | 区分小型大写、全小型大写、petite、unicase 和 titling；使用对应 OpenType 特性，缺失时按变体合成或回退。`optimizeSpeed` 关闭普通与上下文连字，保持独立 kerning 选项 | `has_font_feature`、`needs_synthetic_caps`、`synthetic_caps_runs`、`shape_text_blob` |
| `fontOptionsAssignment` | `font` getter 反映当前 small-caps 属性；成功设置新 font 时重置 caps 与 stretch，保留 textRendering | [canvas_css.rs](../src/canvas_css.rs) 的 `serialized_font_caps`；`set_canvas_property` |
| `spacingPrecision_*` | 支持本次 OffscreenCanvas 实测的 `lh`/`rlh`，分离 getter 序列化与内部布局精度，修正负总宽度的测量边界 | `spacing`、`serialized_spacing`、`skia_canvas_text_bounds` |
| `samplingDetail_*`、`samplingOpaque_*`、`samplingNearest` | 上传前进行透明度预乘；轴对齐图像不额外计算矩形边缘抗锯齿，旋转边缘保留抗锯齿 | `skia_canvas_draw_rgba_image` |
| `samplingHighTransform_*` | 高质量采样同时考虑源/目标矩形和当前变换。仅分解后的两个缩放轴都严格大于 1 时使用 Mitchell；验证了缩小、放大、旋转、旋转后放大、90 度旋转、倾斜和反射 | `skia_canvas_draw_rgba_image` |

92 项由原始 57 项和新增 35 项边界测试组成，入口为 [fourth-round-cases.js](../tests/fourth-round-cases.js) 的 `runThirteenthRoundCases`，已接入 [test.js](../test.js)。此前轮次用例及原始 [demo.js](../demo.js) 保持不变。

## 采样规则依据

当前版本 Chromium 的 [PaintOp::MatrixToScalingOperation](https://github.com/chromium/chromium/blob/153.0.8010.48/cc/paint/paint_op.cc#L134) 对完整图像矩阵调用 `decomposeScale`，只有两轴都严格大于 1 才分类为放大。仅旋转与旋转后放大因此可能选择不同采样器。[PaintFlags::FilterQualityToSkSamplingOptions](https://github.com/chromium/chromium/blob/153.0.8010.48/cc/paint/paint_flags.cc#L178) 将 high 放大映射到 Mitchell，其余映射到线性过滤及 mipmap 模式。当前 Canvas 图像上传路径没有 mipmap，使用线性过滤；本轮覆盖的像素结果一致。

文字状态重置参考仓库内 `third_party/chromium_reference/canvas_rendering_context_2d_state.cc` 的 `SetFont`。字体特性支持从本机字体 GSUB 表读取，Arial 与 Tahoma 分别覆盖原生及合成变体路径。

## 验收

| 检查 | 结果 |
| --- | --- |
| 第十三轮精确比较 | 92/92 一致，差异列表为空 |
| 完整实时回归 | 794 项，`browserVerified=true`，所有轮次失败列表为空 |
| 原始 demo | 9216 个 RGBA 值，0 差异 |
| 对象生命周期 | `gradientGC=true`、`patternGC=true` |
| 编译 | release 构建成功；原有 11 条编译警告未增加 |
| 补丁检查 | `git diff --check` 通过 |

使用用户手动启动的 Chrome **153.0.8010.48**、端口 **9222**，全程复用连接 **3f3dfe73-4928-4759-ad39-cd214de31a22**。未操作鼠标、键盘或剪贴板，未启动或重启浏览器及持久 CDP 服务。测试在后台目标中执行。

最终本轮采集 runId：`07374c58299b4680908c95c3f39e150d`；demo runId：`dfb6c46a01db47d4a27a85f6bd314130`。完整逐项值、哈希和采集元数据见 [thirteenth-round-fixes.json](thirteenth-round-fixes.json)。[修复前报告](2026-09-16_thirteenth-round-review-report.md)和对应证据保留原貌。

demo SHA-256：`FEA443544EEFDB59C29593EAEC43BBA59CECADCF104A69B99B189B6206F9300E`。

## 复现

在项目目录、现有 Chrome 与持久 CDP 连接可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-thirteenth-round.cjs
```

预期均退出 0；主回归 `totalCases=794`、`browserVerified=true`，比较器 `tested=92`、`matched=92`、`differing=0`。

结论适用于当前 Windows、已安装字体、Graphite/Dawn 后端及 Chrome 版本。它验证了上述用例及原有回归，不等同于整个 Canvas 标准测试集通过；其他字体的 OpenType 特性组合和带 mipmap 的图像路径未在本轮穷尽验证。
