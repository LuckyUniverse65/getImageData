# OffscreenCanvas 第五轮检测

> 历史检测记录。下述 27 个失败用例已修复，新增 12 项相关边界后，共 274 项通过实时 Chrome 验收；见[第五轮修复报告](2026-09-15_fifth-round-fixes-report.md)。

2026-09-15，针对实现提交 `16fe74b` 继续检查，新增 **46 项**定向用例，**19 项一致、27 项存在差异**。两次采集的第五轮结果完全一致，均来自用户现有 Chrome 153.0.8010.37、同一条 9222 CDP 连接。本轮只修改检测入口、比较器和文档，`index.js`、Rust/C++ 生产源码、`webgl.node` 及 `demo.js` 均未修改。

原有 **216 项仍通过实时回归**，demo 的 9216 个 RGBA 值零差异，渐变 GC 检查通过。27 是失败用例数量，不是独立根因数量或整体错误率；第五轮尚未修复，也未计入主回归的 216 项通过数。

## 确认的差异

| 证据 | 本地与 Chrome 差异 | 实现路径及影响 |
| --- | --- | --- |
| 六个 `fontMetrics_*` 用例 | 12px Arial 的 alphabetic `fontBoundingBoxAscent` 本地为 10.86328125，Chrome 为 11；切换 top 后本地仍为 10.86328125，Chrome 为 1.6875。多个 baseline 返回值固定或符号不一致。 | [Rust measureText](../src/webgl_native.rs#L1228) 对这些字段重复使用原始 Skia 升降部，没有按 textBaseline 调整；字体盒度量精度也不同。依赖字体盒定位的代码会得到错误结果。 |
| `fontMetrics_hanging`、`fontMetrics_ideographic` 中实际边界 | hanging 实际上边界本地约 0.309375，Chrome 约 0.2；ideographic 实际上边界为 11.54296875 与 12。 | [text_baseline_offset](../src/webgl_native.rs#L833) 的这两种基线仍使用原始 Skia 度量。此前 top/middle/bottom 修复并未覆盖这两个分支。 |
| `textRTLStartBounds`、`textRTLEndBounds`、`textDirectionSaveRestore` | direction=rtl 时 start/end 对齐没有交换；例如 start 的 left 本地为 0，Chrome 为 19.9921875。save/restore 后本地保留 ltr，Chrome 恢复 rtl。 | Rust `measureText` 的对齐分支把 start 固定当作 left、end 当作 right；Canvas 状态没有纳入 direction。 |
| 四个 `shadowColor_*` / `shadowColorInvalidPreserves` 用例 | 默认值本地为 `#00000000`，Chrome 为 `rgba(0, 0, 0, 0)`；red 为 `#ff0000ff` 与 `#ff0000`；半透明红为 `#ff000080` 与 `rgba(255, 0, 0, 0.5)`。 | [get_canvas_property](../src/webgl_native.rs#L858) 将 shadowColor 固定输出为八位 hex。这组证据是返回字符串格式差异，不能据此认定阴影像素错误。 |
| `setterInvalidReceiverOrder`、`getterInvalidReceiver` | 无效 receiver 的 fillStyle setter 先调用 toString 一次才抛错，Chrome 在调用前抛 TypeError；getter 本地返回 undefined，Chrome 抛 TypeError。 | [set_canvas_property](../src/webgl_native.rs#L866) 把字符串转换放在 receiver 校验前；getter 对无效对象直接返回。先前方法包装的 receiver 校验没有覆盖原生属性访问器。 |
| `gradientConversionOrder_2`、`gradientColorThrowBeforeRange` | offset=2 时本地没有调用 color.toString；Chrome 先转换 color，再检查范围。若 toString 抛 RangeError，本地返回 IndexSizeError，Chrome 传播 RangeError。 | [gradient_add_stop](../src/webgl_native.rs#L1014) 将范围检查放在颜色参数的 DOMString 转换前，导致副作用及异常优先级不一致。 |
| `contextOptionsReadOrder`、`contextRepeatedOptions`、`contextRepeatedOptionsThrow` | 首次创建只读取 alpha/desynchronized/willReadFrequently，Chrome 读取更多字典成员；已存在的上下文本地直接返回，不读取新 options，吞掉 getter 中本应传播的异常。 | [JS getContext](../index.js#L239) 的缓存提前返回，以及 Rust `context_option` 的部分字典解析，跳过 Web IDL 转换。 |
| `contextInvalid_colorSpace`、`contextInvalid_colorType`、`contextOptionErrorThenRetry` | 无效枚举值被接受并创建上下文，Chrome 抛 TypeError；Chrome 报错后仍可重新用合法选项创建。 | [原生 getContext](../src/webgl_native.rs#L1515) 没有验证对应枚举。拒绝非法值不依赖先实现 display-p3/float16 等完整渲染能力。 |
| `imageDataInvalidColorSpace`、`imageDataInvalidPixelFormat`、`imageDataSettingsReadOrder`、`createImageDataInvalidSettings` | getImageData/createImageData 忽略 settings；非法枚举仍返回像素对象，Chrome 抛 TypeError；settings getter 也没有读取。 | [JS ImageData 包装](../index.js) 与 Rust 图像读取/创建分支未转换和验证 settings 字典。 |

此外，当前 Chrome 没有暴露 `emHeightAscent` / `emHeightDescent`，本地却返回数值。本轮用显式 `<undefined>` 标记比较，避免 JSON 丢弃 undefined 造成误读。这是 API 表面差异，不能解释成 Chrome 的 em 高度数值计算错误。

## 已验证的一致行为

19 项一致包括零字号、fillStyle 的 Symbol/抛异常/重入转换、四个数值属性的对象转换、globalAlpha 重入、非有限渐变 offset 的转换顺序、渐变重入、stroke 显式 undefined/null、转换期间关闭位图、零小数 ImageData 尺寸、roundRect 的 null/非法迭代器，以及无效虚线迭代结果。

第五轮本地检查在独立 Node 子进程运行，退出码为 0；本次没有观察到原生进程崩溃。这些检查不等于全面证明所有重入场景的内存安全。

## 复现与证据

新增函数 `runFifthRoundCases` 位于 [现有测试入口](../tests/fourth-round-cases.js#L70)。该入口在浏览器返回 `{fourthRound, fifthRound}`，主回归明确取 fourthRound，第五轮比较器明确取 fifthRound。这样已有服务读取当前文件即可执行新检查，无须重启连接或扩大运行脚本白名单。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName fifth-round
node tests/compare-fifth-round.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-fourth-round.cjs
```

第五轮比较器当前应退出 **1** 并报告 27 项差异；原回归与第四轮比较器退出 0。第五轮比較前核对采集模式、入口路径、测试源码 SHA-256、用例集合，并逐项精确比较，不使用数值容差。

- 第五轮最终采集：`74e8c4af0cb74b51b9f96ae4a93f8a96`，`2026-09-15T02:43:26.823Z`。
- 复核采集：`46496e08973f41999260e44b5af6ec9d`，第五轮返回值完全一致。
- 共用连接：`f823af05-4dbf-4e1f-b5f5-31251732a225`，未使用鼠标、键盘或剪贴板。
- 完整返回值、差异、主回归和代码/产物哈希：[fifth-round-review.json](fifth-round-review.json)。

后续修复应优先补齐字典/枚举校验及异常顺序，再统一字体度量和 RTL 状态，最后补齐 shadowColor 序列化与访问器 receiver 校验。每组修复都应保留原 216 项，并让本轮对应差异得到真实 Chrome 验证。
