# OffscreenCanvas 第四轮修复记录

> 此文保留 2026-09-14 的阶段性记录。2026-09-15 已恢复持久连接，补齐小数字号基线修复，并完成 216 项实时 Chrome 对照；最终结果见[实时验收报告](2026-09-15_fourth-round-verification-report.md)。下文连接超时及待验收状态属于历史状态。

2026-09-14，第四轮报告中的 29 个失败用例已修复：原有 46 项与此前用户 Chrome 153.0.8010.37 的采集结果全部一致。新增 12 项相关边界检查，主回归现包含 216 项，本地断言、demo 及渐变 GC 检查通过。

**本次新采集尚未完成。** 用户 Chrome 仍监听 `127.0.0.1:9222`，但 CDP WebSocket 多次连接超时，完整 `-Action Test` 也在连接阶段失败。因此本记录中的浏览器比较来自此前保存的采集，不能视作本次实时浏览器验收；新增 12 项尚待 Chrome 对照。机器证据将 `browserVerified` 保持为 `false`，详见 [JSON](fourth-round-fixes.json)。

## 修复与证据

| 用例 / 证据 | 修复后的行为 | 实现路径 |
| --- | --- | --- |
| `imageDataReadonlyWidth`、`imageDataReadonlyData`、新增 height / 像素可写检查 | width、height、data 引用只读，像素数组内容保持可写。当前通过自有只读属性实现，尚非完整浏览器原型描述符模型。 | [Rust image_data](../src/webgl_native.rs) |
| `detachedImageData`、新增转换期间分离缓冲区 | putImageData 先完成数值转换，再检查缓冲区是否分离；失效时抛 InvalidStateError，避免用户转换发生在取得原生数据指针之后。 | [JS adaptContextArguments](../index.js) |
| `dashIteratorLookup`、`dashIteratorClose`、roundRect 转换顺序 | 每个迭代值立即转换；iterator 和 next 各获取一次；转换失败不调用 IteratorClose。字符串不当作虚线序列；点字典按 x 读取/转换后再处理 y。 | JS convertSequence / roundRect |
| `roundRectNonfiniteAndNegative`、`roundRectNegativeNonfiniteCoordinate` | 数量检查后先处理非有限坐标和半径，再检查负半径。 | JS roundRect |
| `gradientStopObjectString`、`fillStyleObjectString`、`fontObjectString` | 执行 DOMString 转换，颜色/字体对象的 toString 可以生效；字符串属性转换先于可变状态借用。 | Rust dom_string / set_canvas_property / gradient_add_stop |
| `modernAlphaPercent25`、`legacyAlphaSerialization`、`transparentHexSerialization` | 修正百分比 alpha 的浮点比例和字节量化，25% 得到 64，保留既有 50% 样本行为；legacy/hex alpha 使用可回到原字节的短小数返回。 | [CSS function_color / serialized_alpha](../src/canvas_css.rs)、Rust style_value |
| `legacyMixedPercent`、`legacyNaN`、`legacyInfinity`、`namedColorYellow` | 统一 RGB/HSL 解析入口；拒绝 legacy 混合百分比及非有限分量，补齐常见基础命名色。 | CSS function_color、Rust parse_color |
| 空格分隔行高、非法行高单位、重复 normal、相邻引号字体族、小数 weight | 分词识别斜杠和行高，非法赋值保留原字体；小数权重按 Chrome 样本规范化。 | CSS font |
| `fontFallbackList` | 按完整字体族列表依次匹配已安装字体，首个名称不存在时继续查找后续名称；删除特定缺失字体名称的硬编码。 | Rust font_spec、[C++ resolve_font](../src/skia_backend.cpp) |
| `emptyTextTopBaseline` | 使用 OS/2 typo 升降部比例归一化到字号，并按 1/64 px 取整；top、middle、bottom 共同使用此规则。12px Arial 的 top 偏移由 10.86328125 修正为 9.3125。 | C++ skia_canvas_typo_metrics、Rust text_baseline_offset |
| `strokeInvalidArgument`、`fillMissingReceiver`、新增转换前 receiver 检查 | 非法 stroke 参数和无效上下文接收者抛 TypeError；方法先验证 receiver 再执行用户参数转换。 | JS 上下文方法包装 |

基线算法核对了 Chromium `153.0.8010.37` 的 [TextMetrics::GetFontBaseline](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.37/third_party/blink/renderer/core/html/canvas/text_metrics.cc) 和 [SimpleFontData::TrySetNormalizedTypoAscentAndDescent](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.37/third_party/blink/renderer/platform/fonts/simple_font_data.cc)。字体缺少有效 OS/2 数据时回退到 Skia 升降部度量，没有按示例写死偏移。

## 验证结果与限制

| 检查 | 本次结果 |
| --- | --- |
| release 构建 | 成功，保留原有 11 条警告 |
| 本地回归 | 216 项，含第四轮 58 项；关键语义断言通过 |
| 既有三组与独立 Unicode 检查 | 158/158 与保存的 Chrome 结果一致；各组测试源码 SHA-256 核对通过 |
| 原第四轮 | 46/46 与保存的 Chrome 结果一致；核对原 46 项测试源码未改动，仅追加用例 |
| demo | 9216 个 RGBA 值与保存的 Chrome 结果一致，0 差异；demo.js 未修改 |
| 渐变强制 GC | 通过 |
| 新增 12 项 | 本地运行及相关断言通过，浏览器结果待采集 |
| 本次完整 CDP 验收 | 连接超时，未通过验收 |

新增检查覆盖 ImageData 高度只读、像素可写、数值转换时分离缓冲区，百分比和 legacy alpha 扫描，多项缺失字体和引号中的逗号，Arial / 小数字号 / Times New Roman / Courier New 的三种基线，以及接收者验证和 next 获取次数。`test.js` 已纳入第四轮精确对照，并在连接前写入未验证状态，避免连接失败后残留旧的成功报告。

原第四轮参考采集编号为 `4708a8d9408b4f2291b3ebcfafb42da1`，时间为 `2026-09-14T10:08:23.117Z`。其他参考采集及本次返回值、当前代码和原生产物 SHA-256 完整保存于 JSON。`webgl.node` SHA-256 为 `9265E76EA266AB927C66249E78210827398D1EC02884DE353DF6FB7097BCFCD0`。

## 完成浏览器验收

保持用户手动打开的 Chrome 远程调试可连接；如果 Chrome 显示调试授权提示，需要在浏览器中允许。随后在项目根目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-fourth-round.cjs
```

采集只使用用户现有 Chrome 的 CDP 后台标签页，不使用鼠标、键盘或剪贴板。比较器严格核对当前测试源码 SHA-256；当前仍是旧的 46 项采集时，应拒绝将其作为扩展后 58 项的实时结果。

字体族列表已支持顺序查找，但完整 CSS 转义、相对单位、逐字形回退、复杂排版和全部 TextMetrics 尚未覆盖。完整 CSS Color、Path2D 重载、CanvasPattern 变换、跨线程 transferable 和完整 WebGL 仍不在已验证支持范围内。
