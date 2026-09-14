# OffscreenCanvas 第三轮修复与验收

2026-09-14，修复第三轮检测确认的 36 项兼容性差异和非法 Unicode 颜色导致的原生进程崩溃。新增 10 项相关边界回归，最终原有 47 项、第二轮 45 项、第三轮 65 项与 1 项独立防崩溃检查，共 **158 项**全部与用户现有 Chrome 153.0.8010.37 一致。demo 的 9216 个 RGBA 值零差异，渐变强制 GC 检查通过。

## 修复、证据与代码路径

| 检测证据 | 修复后行为 | 代码路径 |
| --- | --- | --- |
| 独立 `unicode-color-case`、`unicodeColorsIgnored` | `#红`、`#😀` 等非法颜色保留原状态；原先退出码 3221226505，修复后子进程退出 0，红色样本与 Chrome 相同。字符串输出按显式 UTF-8 长度处理，避免内部 NUL 导致 CString panic。 | [Rust](../src/webgl_native.rs) 的 `parse_color` / `string` |
| `numericText`、`textObjectConversion`、`textSymbol`、`measureTextMissing`、`textWhitespace`、`textMaxWidthConversionOrder` | 执行 DOMString 转换，Symbol 和缺参抛 TypeError；ASCII 空白归一化为空格；即使文本为空也先转换 maxWidth。 | [JS](../index.js) 的 `adaptContextArguments` |
| `fontPointUnits`、`fontDuplicateStyle`、`fontMalformedFamily`、`fontCanonicalization`、`fontStateRestore`、`fontQuotedFamily` | 绝对单位转换到 px；拒绝重复样式及非法字体族，保留原字体；省略 normal，并保留合法引号字体族及 save/restore 状态。 | [CSS 解析](../src/canvas_css.rs)、Rust font setter |
| `textActualBounds`、`textAlignedBounds`、`textMetricsControl` | 从塑形后的字形位置和 Skia 字形边界计算实际边界，结合 textAlign/baseline；LCD edging 下的字形横向边界与 Chrome 一致。覆盖 M、MM、AV、fi、g 和空文本。 | [C++](../src/skia_backend.cpp) 的 `canvas_shaped_metrics` / `skia_canvas_text_bounds`、Rust `measureText` |
| `numericText`、`textWhitespace` 的精确宽度 | 按字体 advance 的 16.16 截断规则累计，修正 SkShaper 舍入与 Canvas 度量之间的差异，同时保留塑形和字距调整。不是按字符串写死结果。 | C++ `canvas_shaped_metrics` |
| drawImage 缺参/四参数、普通对象、零尺寸源、已关闭位图 | 正确验证重载、对象来源及源状态，分别抛 TypeError 或 InvalidStateError；正常三、五、九参数绘制及自绘重叠继续通过。 | JS 图像入口及模块内部 WeakSet |
| createPattern 非法 repetition / 零尺寸源 | 非法模式抛 SyntaxError，失效源抛 InvalidStateError。 | JS `createPattern` 包装 |
| createImageData / putImageData 缺参和普通对象 | 要求正确重载与由 Canvas 创建的 ImageData；正常克隆、脏矩形和忽略绘制状态的行为继续通过。 | JS ImageData 来源登记与包装 |
| fill / clip / 命中测试非法规则或缺参 | 验证填充规则枚举和点坐标必选参数。 | JS 路径入口 |
| roundRect 的 Set、NaN、字符串半径及点字典 getter | 支持可迭代半径及点字典；非有限半径不添加路径，负数报错；getter 各读取一次。 | JS roundRect 参数规范化 |
| `matrixDictionaryReadOrder`、`setTransformTwoArguments`、`matrixContradictory2D` | 按字典成员顺序读取和转换；处理对象重载额外参数；验证 is2D 与 3D 成员矛盾。 | JS setTransform 参数规范化 |
| `drawImageShadow`、`imageShadowAlpha`、`imageShadowRestore` | 图像接入共享阴影绘制流程，覆盖偏移、半透明和状态恢复；copy 清理与阴影抑制继续通过。 | C++ `skia_canvas_draw_rgba_image` / `draw_with_shadow` |
| `colorModernSyntax`、`colorHsl`、`cssColorSavedState`、`modernColorInvalid` | 支持现代 RGB 分隔与 HSL；保存用于颜色字符串返回的 alpha，像素使用后端量化值；缺少斜杠的四分量现代 RGB 被拒绝。 | CSS 解析模块、Rust `Style::CssColor` |

Canvas 的实际绘图依然由 Rust 调用 Skia 完成。JS 包装负责接口转换和校验，没有注入浏览器参考像素。原始 `demo.js` 未修改。原生 Skia 第三方源码和依赖版本未修改。

## 验证

浏览器连接只使用用户现有 Chrome/profile 的 9222 CDP，以后台标签页执行测试和读取数据。采集结束仅关闭本次创建的标签页，不使用鼠标、键盘或剪贴板；F12 可以关闭。

| 检查 | 结果 |
| --- | --- |
| 原有兼容性测试 | 47/47 一致 |
| 第二轮测试 | 45/45 一致 |
| 第三轮原有及新增边界 | 65/65 一致 |
| 独立 Unicode 颜色回归 | 1/1 一致；子进程退出 0 |
| demo | 9216 个 RGBA 值，0 差异 |
| 渐变 GC | 通过 |
| release 编译 | 成功，原有 11 条编译警告 |

主回归先在可丢弃子进程执行防崩溃检查，再运行同进程用例；发生原生 panic 时可以报告子进程失败。各测试同时包含关键行为的本地断言和新采集的 Chrome 逐项精确比较，不使用容差掩盖本轮差异。

最终采集编号：

- 原有用例：`ca008cf1593742d5bd265d6295608e83`。
- 第二轮：`a0888030550349649995f5d3a8e10ee3`。
- 第三轮：`eaabe7576301404c8c549b35b1302447`。
- Unicode 颜色：`6317aa904cda4cff94e6a9f242e1e33e`。
- demo：`83a59b3e13db488f958aeda2ce62b3d8`。

完整返回值、最终源码/原生产物 SHA-256 与比较结果见 [JSON 证据](third-round-fixes.json)。[修复前报告](2026-09-14_third-round-review-report.md)和 [JSON](third-round-review.json)保留历史差异。

## 复现

配置好本机工具链，并保持用户 Chrome 开启远程调试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-third-round.cjs
node tests/compare-unicode-color.cjs
```

以上命令在最终版本上全部退出 0。`node test.js --local` 只执行本地回归；`node test.js` 还会新采集全部浏览器结果。`out/cdp-verification-result.json` 保存主回归，逐项比较器核对浏览器模式与当前测试源码 SHA-256。源码构建所需的第三方工具链见 [README](../readme.md)。

## 支持范围

本轮闭合了报告中已确认的问题。字体解析仍是支持常见样式及绝对单位的本地实现，尚未覆盖完整 CSS 相对单位、转义和字体回退列表；颜色解析也未覆盖全部 CSS Color 形式和命名色。文本宽度及实际边界与本轮样本一致，复杂文字、全部字体以及其他 TextMetrics 字段仍需进一步验证。图像源和 ImageData 要求项目生成的对象，完整 DOM 图像源、Path2D 重载、CanvasPattern 变换和跨线程 transferable 尚未补齐。

158 项通过仅证明本轮覆盖行为在当前 Chrome、字体和图形后端下保持一致，不代表完整浏览器 Canvas 实现。
