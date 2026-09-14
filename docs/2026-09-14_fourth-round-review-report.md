# OffscreenCanvas 第四轮检测

2026-09-14，继续检查第三轮修复提交 `4c005ca`。46 项新增定向用例在用户现有 Chrome 153.0.8010.37 / 9222 CDP 上完成对照：**17 项一致，29 项存在差异**。本轮只增加检测脚本和证据，生产源码与 `webgl.node` 未修改。29 项是失败用例数量，不是独立根因数量，也不能当作整体错误率。

原有 **158 项已重新通过同一 Chrome 的 CDP 对照**，demo 的 9216 个 RGBA 值零差异，GC 检查通过。新增差异来自此前尚未覆盖的边界，未修改旧测试的验收标准。

## 应优先处理的差异

| 证据 / 触发 | 本地 | Chrome | 实现路径与原因 |
| --- | --- | --- | --- | --- |
| `imageDataReadonlyWidth` / `imageDataReadonlyData` | Reflect.set 返回 true，可改变 width 或替换 data 引用 | 返回 false，保留原值 | [Rust image_data](../src/webgl_native.rs#L550) 创建普通对象并设置可写属性，未实现 ImageData 的只读属性。像素数组内容仍应可写，不能把整个数组冻结。 |
| `detachedImageData`：转移 ImageData 的 ArrayBuffer 后调用 putImageData | 静默返回 undefined | InvalidStateError | [putImageData](../src/webgl_native.rs#L1289) 发现原生数据指针为空时直接返回，缺少已脱离缓冲区的异常处理。 |
| `modernAlphaPercent25`：`rgb(255 0 0 / 25%)` | 像素 `[255,0,0,63]` | `[255,0,0,64]` | [CSS 颜色解析](../src/canvas_css.rs#L81) 对现代百分比 alpha 统一 floor，范围过宽；此前 50% 样本通过不能证明其他比例正确。 |
| `legacyMixedPercent`、`legacyNaN`、`legacyInfinity` | 接受非法的混合单位、NaN/inf RGB，覆盖现有颜色 | 忽略非法颜色并保留原值 | [Rust parse_color](../src/webgl_native.rs#L559) 旧逗号语法允许逐通道独立单位，并未先排除非有限值。 |
| `fontInvalidLineHeightUnit`、`fontRepeatedNormal`、`fontFamilyTwoQuotedNames` | 接受 `12px/2garbage Arial`、过多 normal 和无逗号相邻引号字体族 | 拒绝并保留原字体 | [font parser](../src/canvas_css.rs#L9) 去掉任意字母后缀来校验行高，未完整限制前缀数量及字体族词法。 |

本轮没有复现新的进程崩溃。这里报告的是实际返回值、状态或像素差异；ImageData 属性可改写不能单独据此认定存在内存安全漏洞。

## 参数转换和可观察顺序

| 用例 | 本地 | Chrome | 路径 |
| --- | --- | --- | --- |
| `dashIteratorLookup` | Symbol.iterator getter 读取 2 次 | 1 次 | [JS setLineDash](../index.js#L38) 先检查，再用 Array.from 再次获取迭代器。 |
| `dashStringSequence` | 将 `'12'` 接受为 `[1,2]` | TypeError | 同上，字符串可被 Array.from 迭代，但不满足此接口的序列对象转换规则。 |
| `dashIteratorClose` | 元素转换抛错时执行生成器 finally，closed=true | 同样 TypeError，但 closed=false | 同上，Array.from 的迭代关闭行为与本次 Chrome 的 Web IDL 序列转换不同。 |
| `roundRectIteratorConversionOrder` | 先读取全部元素，再读取各点 x/y | 每读取一个元素立即转换该点，再取下一元素 | [JS roundRect](../index.js#L135) 用 Array.from 收集，再 map 转换，改变有副作用对象的访问顺序。 |
| `roundRectPointConversionOrder` | getX → getY → convertX | getX → convertX → getY | 同上，同时读取 x/y，未在读取 y 前完成 x 的数值转换。 |
| `roundRectNonfiniteAndNegative` | 半径 `[NaN,-1]` 抛 RangeError | 无异常，不添加路径 | 同上，负数检查与非有限值检查顺序不同。 |
| `roundRectNegativeNonfiniteCoordinate` | x=NaN 且半径 -1，抛 RangeError | 无异常，返回 undefined | 同上，路径数值无效时的提前返回顺序不同。 |
| `gradientStopObjectString` | 颜色对象抛 SyntaxError，未调用 toString | 调用一次，正常加入红色色标 | [Rust addColorStop](../src/webgl_native.rs#L1016) 直接读取字符串，缺 DOMString 转换。 |
| `fillStyleObjectString`、`fontObjectString` | 忽略对象，未调用 toString | 各调用一次，设置红色 / 12px Arial | [Rust 属性 setter](../src/webgl_native.rs#L870) 的字符串转换不完整。 |
| `strokeInvalidArgument` | stroke(3) 静默返回 | TypeError | stroke 入口未验证参数；目前只有其他部分路径接口有包装校验。 |
| `fillMissingReceiver` | fillRect.call({},...) 静默返回 | TypeError | 原生上下文解包失败直接返回，缺失接收者身份错误。 |

这些转换差异在普通纯数值输入下不一定影响像素，但 getter、valueOf、生成器带有副作用时会改变程序行为。修复时应按接口的转换流程处理，不能只针对用例返回值补分支。

## 序列化、字体和颜色支持范围

| 用例 | 本地 | Chrome |
| --- | --- | --- |
| `legacyAlphaSerialization`、`transparentHexSerialization` | alpha 字符串为 `0.5019607843137255` | `0.5`；两边像素 alpha 都为 128 |
| `namedColorYellow` | 不识别 yellow，保留之前的蓝色 | 黄色像素 `[255,255,0,255]` |
| `fontSeparatedLineHeight` | 不接受合法的 `12px / 2 Arial`，保留 14px | 规范化为 `12px Arial` |
| `fontDecimalWeight` | 不接受 `450.5 12px Arial` | 本次 Chrome 规范化为 `450 12px Arial` |
| `fontFallbackList` | 首字体不存在时直接走默认回退，MMMM 宽约 38.976 | 使用列表中的 Arial，宽 39.984375 |
| `emptyTextTopBaseline` | 空文本 top 基线的 ascent/descent 约 -10.8633/10.8633 | -9.3125/9.3125 |

序列化来自 [style_value](../src/webgl_native.rs#L766) 将 8 位 alpha 直接除以 255；字体列表解析只选第一项，见 [font_spec](../src/webgl_native.rs#L815)。top 基线使用 ascent 偏移，见 [text_baseline_offset](../src/webgl_native.rs#L837)，本轮证据表明它与 Chrome 的基线度量不同。空文本在非 alphabetic 基线下不应简单假设实际边界一定为零。

命名色覆盖、完整 CSS 字体语法、字体回退列表和其他文本度量在上一轮已注明未完整实现；本轮提供具体样本，不把这些已知范围限制当作新回归。百分比 25% 的量化误差和非法 CSS 被接受则是已实现路径中的具体缺陷。

## 对照中一致的行为

17 项通过，包括：已脱离缓冲区的 ImageData 尺寸克隆；像素接口的超范围、NaN、undefined 参数异常；putImageData 转换顺序；位图重复 close 和 resize 后继续可用；无上下文画布的位图转移错误；现代十进制 alpha、HSL 负角度及 turn 单位；字体单位大小写；空格边界；制表符和空格实际绘制一致；非有限值命中测试。

尤其是超范围坐标、包装尺寸、NaN 和 undefined，本次 Chrome 与本地都抛 TypeError。没有依据通常的整数回绕直觉，把这些一致结果误列为缺陷。

## 复现及证据

使用用户现有 Chrome/profile 的后台测试标签页，以 Runtime.evaluate 读取实际返回值；结束仅关闭该测试页。没有启动新浏览器，也没有鼠标、键盘或剪贴板操作。前两次握手超时，确认 9222 仍由原 Chrome 监听后重试成功；本报告采用成功采集的结果。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName fourth-round
node tests/compare-fourth-round.cjs
```

当前比较器预期退出 1，表示存在 29 项差异；采集本身成功。比较前会验证浏览器模式、测试源码 SHA-256 和全部用例名称。完整回归首次握手超时后重试成功，`canvas-task.ps1 -Action Test` 最终退出 0。

- 用例：[fourth-round-cases.js](../tests/fourth-round-cases.js)。
- 比较器：[compare-fourth-round.cjs](../tests/compare-fourth-round.cjs)。
- 完整差异、所有返回值、产物哈希和既有回归结果：[fourth-round-review.json](fourth-round-review.json)。
- Chrome runId：`4708a8d9408b4f2291b3ebcfafb42da1`。
- 采集时间：`2026-09-14T10:08:23.117Z`。
- 原生 SHA-256：`5BF24327F7B2E531C0970F807806C0EC1A2283A7CD8E7ACF13B2DE1DE55F0EE0`，与第三轮修复相同。
- 既有回归采集编号：`3647a5fa660e4e86b180274b9eaf3a76`、`0a0cb380e39a42db8c50c3c277a75c61`、`bd78e3c87ec44707a245822dc0cc54eb`。
- Unicode 回归：`67e0d83c05fc466580078b324f4b7322`；demo：`c93b55de2e46451097faf33817e3f4b7`。

建议依次修复 ImageData 属性/生命周期、颜色量化与无效 CSS 校验、序列和字典转换流程，再补齐字体与其余接口校验。保留旧的 50% 颜色测试，并与 25% 样本一起验证，避免用另一种统一取整规则掩盖差异。
