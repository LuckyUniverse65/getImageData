# OffscreenCanvas 第十二轮修复验收

2026-09-16，第十二轮原有 **17 个失败用例全部修复**；原有 35 项加上 35 项边界验证，**70 项全部与用户现有 Chrome 实时采集一致**。完整 **702 项通过**，demo 的 **9216 个 RGBA 值零差异**，渐变与图案 GC 检查通过。此前因连接中断未完成的空格排版检查已全部完成。

## 修复与证据

| 触发与证据 | 修复后的行为 | 实现位置 |
| --- | --- | --- |
| 字距、词距、字偶距默认值、保存恢复、无效赋值与尺寸重置 | letterSpacing、wordSpacing、fontKerning 为原生状态，先完成字符串转换再更新状态，允许转换过程重入 | webgl_native.rs 的 Canvas2D、CanvasState、属性访问器及 sync_native_text |
| ABC 字距、A B C 词距、AVATAR 禁用 kerning 的测量及像素 | 同一组选项用于测量、字形定位、墨迹边界、填充及描边；35 项原始用例全部一致 | skia_backend.cpp 的 PositionedRunHandler、shape_text_blob 和测量/绘制入口 |
| CSS 长度和字体变化 | 保留单位序列化，解析绝对单位及当前字体的 em/rem/ex/ch，按实测拒绝两端空白及无单位零，使用 16.16 间距精度 | canvas_css.rs 的 spacing，webgl_native.rs 的 sync_native_text |
| 希伯来文及混合文本在 ltr/rtl 下的测量、边界与像素 | 按 Unicode bidi 分段和视觉顺序排布，避免用原始逻辑顺序替换已重排字形；方向与 maxWidth 描边也一致 | skia_backend.cpp 的 PositionedRunHandler::commitLine、has_rtl_text |
| Arial/Tahoma 加微软雅黑、宋体、Noto Sans SC 的斜体回退 | 按请求样式匹配回退字体，独立处理实际斜体、合成斜体和内嵌位图，避免继承基础字体的多余倾斜 | skia_backend.cpp 的 fallback_runs、font_runs_blob |
| imageSmoothingQuality 属性状态 | 支持 low/medium/high、忽略无效值、保存恢复与重置；现有棋盘采样对照一致 | webgl_native.rs 的属性注册与状态 |
| CanvasPattern 原型描述符 | setTransform 可枚举，Symbol.toStringTag 为值为 CanvasPattern 的不可写数据属性 | index.js 的原型属性定义 |
| 同一文本因首次空格出现位置而得到不同宽度 | 补齐 Chrome 已加间距的空格缓存行为，并按字体配置和方向隔离；测量和绘制共用结果 | skia_backend.cpp 的 TextCache、text_layout_options |
| reset、resize 和先缩到零再恢复后的缓存 | 缓存归属于上下文，独立于渲染表面，随上下文释放；保存恢复不会错误地回滚缓存 | webgl_native.rs 的 TextCache 与原生绑定；spacingCacheLifecycle_* 用例 |

代码：[index.js](../index.js)、[webgl_native.rs](../src/webgl_native.rs)、[canvas_css.rs](../src/canvas_css.rs)、[skia_backend.cpp](../src/skia_backend.cpp)。测试入口为 [fourth-round-cases.js](../tests/fourth-round-cases.js) 的 runTwelfthRoundCases，已接入 [test.js](../test.js)。没有修改 demo.js，也没有放宽像素容差。

## 空格顺序差异的根因

17px Arial、letterSpacing=1.5px、wordSpacing=2px 下，首次直接测量 ` A  B `，Chrome 返回 50.5703125；若先测量 `A B`，再测量同一文本，则返回 58.5703125。两者都是真实 Chrome 行为。

Chrome 的 PlainTextNode::SegmentWord 将普通空格分为独立项；Shape 调用 ApplySpacing 并使用原始偏移决定是否添加首字符的词距，再将结果存入以文本和方向为键的缓存。之后相同空格命中缓存时不重新计算偏移。因此首次出现的位置会影响后续词距。PlainTextPainter 按字体配置隔离这些缓存。

依据：[Chrome 153.0.8010.48 PlainTextNode](https://github.com/chromium/chromium/blob/153.0.8010.48/third_party/blink/renderer/platform/fonts/plain_text_node.cc)、[PlainTextPainter](https://github.com/chromium/chromium/blob/153.0.8010.48/third_party/blink/renderer/platform/fonts/plain_text_painter.cc)，以及先前读取的 [153.0.8010.37 ShapeResultSpacing::ComputeSpacing](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/platform/fonts/shaping/shape_result_spacing.cc)。新增 spacingCacheOrder 验证首空格、尾空格、词间空格以及改变/恢复词距的完整序列；另有独立上下文、保存恢复、首次填充/描边、双向文本和尺寸生命周期检查。

## 实时验收

| 检查 | 结果 |
| --- | --- |
| 第十二轮 | 70/70 一致；原 17 项失败及后来发现的空格差异全部消除 |
| 完整回归 | 702 项，browserVerified=true，各轮失败列表为空 |
| demo | 9216 个 RGBA 值，0 差异 |
| 对象生命周期 | gradientGC=true、patternGC=true；图案使用期间保留，reset 后释放 |
| 构建及补丁 | release 构建成功；保留原有 11 条非本轮新增编译警告；git diff --check 通过 |

本次复用用户手动启动的 Chrome **153.0.8010.48**、端口 **9222**，连接 **3f3dfe73-4928-4759-ad39-cd214de31a22**。授权后全部验证使用同一连接，没有操作鼠标、键盘或剪贴板，没有重启 Chrome，也未在验证过程中重新连接。

第十二轮/第四轮共享采集 runId：`fe283fdca6194f6fb92c3d77407e9ac1`；demo runId：`1a6b12b72d6c4209ab31faf81ffd1d68`。完整逐项结果、源码及原生模块哈希、采集元数据和字体排版源码引用哈希见 [twelfth-round-fixes.json](twelfth-round-fixes.json)。[此前进展报告](2026-09-16_twelfth-round-fixes-progress-report.md)、[进展证据](twelfth-round-fixes-progress.json)及[修复前检测报告](2026-09-15_twelfth-round-review-report.md)作为历史记录保留。

已有 Chrome 和持久调试连接可用时，在项目根目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-twelfth-round.cjs
```

预期全部退出 0，主回归 totalCases=702、browserVerified=true，独立比较器 tested=70、matched=70、differing=0。

## 范围

结论针对当前 Windows、安装字体和 Chrome 版本，不代表整个 Canvas 标准测试集已通过。imageSmoothingQuality 本轮补齐并验证状态，未宣称覆盖所有采样算法的质量档位差异。空格缓存最多保留 256 个字体配置；Chrome 在内存压力或缓存淘汰时的具体行为不在本次复现范围内。
