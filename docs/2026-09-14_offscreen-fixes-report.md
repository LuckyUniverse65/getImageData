# OffscreenCanvas 第二轮修复与验证

2026-09-14，修复了此前第二轮检测中的全部 25 项差异，并补充 15 项相关边界测试。原有 47 项与第二轮 45 项测试，共 92 项结果全部与用户手动开启的 Chrome 153.0.8010.37 一致。原始 `demo.js` 未修改，9216 个 RGBA 值零差异，渐变强制 GC 检查通过。

## 修复与证据

| 证据（测试名称） | 问题与修复 | 实现路径 |
| --- | --- | --- |
| `emptyClip` | 空路径也提交给 Skia，正确产生空裁剪区。 | [Rust](../src/webgl_native.rs) 的 `clip` |
| `copyFillOutside`、`copyImageOutside`、`copyClippedOutside`、`copyEmptyOperations`、`copyShadow` | copy 在当前裁剪区先清空再绘制；空路径不绘制，零宽 fillRect 按 Chrome 清空，copy 下不保留阴影。 | [C++](../src/skia_backend.cpp) 的 `draw_with_shadow`、`draw_path` 和图像入口 |
| `nineArgumentImageCrop`、`negativeImageCropOrder`、`partialImageSource`、`copyOutsideSource` | 原生回调只接收 8 个参数，导致九参数 drawImage 被误判为五参数形式；改为先查询实际参数数量。源和目标负尺寸归一化，完全越界源在 copy 清空前返回，部分越界按比例裁剪。 | Rust `callback_info`、C++ `skia_canvas_draw_rgba_image` |
| `imageSmoothingDefault`、`imageSmoothingState`、`smoothingOffAndReset` | 默认线性采样；关闭时最近邻。状态支持 save/restore/reset。裁剪边缘保留邻近源像素参与采样：红蓝交界样本为 `[64,0,191,255]`，与 Chrome 相同。 | Rust 绘制状态、C++ 图像采样 |
| `opaqueContext`、`opaqueLifecycle`、`opaquePutImageData` | 实现 alpha:false 不透明 surface；初始化、clearRect、reset、resize 和位图转移后正确回到不透明黑色。报告上下文属性。 | Rust `canvas_2d` / `getContextAttributes`、C++ surface 与清理入口 |
| `setTransformObject`、`setTransformNoArgs`、`matrixAliases` | 支持矩阵字典、别名、一致性校验和无参复位，非有限矩阵不修改状态。 | [JS](../index.js) `adaptContextArguments` |
| `invalidLineDash`、`iterableLineDash`、`lineDashSetAndNaN` | 接受可迭代序列；完整转换并校验后才替换虚线状态，非法值不破坏原状态。 | JS 参数适配、Rust `setLineDash` |
| `numericStringRect`、`numericConversionFailure`、`negativeArcTo`、`missingScaleArgument` | 数字字符串参与绘制；Symbol 转换报错；缺参和负半径按接口返回异常。 | JS 参数适配、Rust 路径入口 |
| `negativeCreateImageData`、`zeroCreateImageData`、`putNegativeDirtySize`、`putFractionalOrigin` | ImageData 负尺寸取绝对值、零尺寸报错；dirty 负尺寸归一化，坐标按 Web IDL 向零截断。 | Rust `createImageData` / `putImageData` |
| `fillTextMaxWidth`、`textWidthPreservesState`、`invalidTextWidth`、`emptyTextBounds`、`invalidFont` | 实现 maxWidth 压缩并恢复变换；undefined 视作省略；空文本实际边界为零；非法字体赋值保留旧状态。 | Rust 文本入口与 font setter |
| `missingCanvasDimensions`、`undefinedCanvasDimension`、`fractionalCanvasDimension` | 构造函数要求两个尺寸，undefined 不再补默认值，小数向零截断且消除负零。 | JS `offscreenDimension` |

绘图修复位于实际 JS → Rust → Skia 调用链，没有把浏览器参考像素写入生产绘制实现。此前误读九参数的风险通过双色图像和不同目标宽高专门验证，避免纯色样本碰巧一致。

## 验证方式与结果

浏览器验证使用用户现有 Chrome/profile 的 9222 CDP，创建后台测试标签页，以 `Runtime.evaluate` 执行同一份测试源码并读取返回值。仅关闭本次创建的标签页，不操作鼠标、键盘、剪贴板或用户现有页面。F12 可以关闭。首次完整复验连接超时，使用已有任务入口重试后成功；最终结果来自成功的新采集。

| 检查 | 最终结果 |
| --- | --- |
| 原有兼容性用例 | 47/47 一致 |
| 第二轮及扩展边界用例 | 45/45 一致 |
| demo RGBA | 9216 个值，0 差异 |
| 渐变共享引用与强制 GC | 通过 |
| release 原生编译 | 成功；保留原有 11 条编译警告 |

最终浏览器采集编号：

- 原有用例：`cc24c634debd4b27a4aa22e410bb8890`。
- 第二轮用例：`c181e70af0b84fa39062df77a98a6741`。
- demo：`efd9e85ace9d42a682bcd6238187348f`。

完整用例返回值、浏览器采集元数据、源码和原生产物 SHA-256 见 [JSON 证据](second-round-fixes.json)。修复前的 [25 项差异证据](additional-review-results.json) 保留作为历史基线。

在已配置本机工具链且现有 Chrome 开启远程调试时复现：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-additional.cjs
```

`node test.js --local` 运行本地断言、demo 输出检查和 GC；`node test.js` 还会重新采集两组浏览器用例和 demo 并比较。独立比较器要求现有采集的测试源码哈希与当前源码相同，发现差异退出 1。原始采集在 `out/cdp-*-browser.json`，主回归结果在 `out/cdp-verification-result.json`。

## 当前范围

这些结果针对当前 Chrome、字体、Skia/Dawn 后端和显卡驱动，以及本轮明确覆盖的行为。字体校验仅支持后端的 px 简写，尚未实现完整 CSS 字体解析；非空文本实际边界仍含近似值。文本 maxWidth 测试验证宽度约束与状态恢复，不等于所有字形像素均已匹配。Canvas 仍受原生 u32 尺寸和实际内存限制。

本轮没有补齐所有图像源、图像阴影、全部合成模式、CanvasPattern 变换、跨线程 transferable 或完整 WebGL。完整支持范围见 [README](../readme.md)。
