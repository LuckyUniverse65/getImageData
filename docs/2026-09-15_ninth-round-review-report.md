# OffscreenCanvas 第九轮兼容性检测

2026-09-15，在提交 `81d4c0405ec1bc8c7f30dd99e8ee1966e552fadf` 上继续检测。新增 **55 项：32 项一致，23 项存在差异**；23 是失败用例数，多个用例指向同一实现问题。本轮未修复生产代码，下面的差异仍待处理。

原有 **433 项回归全部通过**，demo 的 **9216 个 RGBA 值零差异**，渐变 GC 检查通过。生产源文件、原生模块、`demo.js` 和 `test.js` 的 SHA-256 均与第八轮验收相同。第九轮使用独立比较器，未计入主回归的通过数；本地子进程正常退出。

## 证据和复核

| 证据 | 内容 |
| --- | --- |
| [ninth-round-review.json](ninth-round-review.json) | 本地/Chrome 完整逐项值、23 项差异、像素差异计数、重复采集、433 项回归及文件/字体 SHA-256 |
| [测试入口](../tests/fourth-round-cases.js) | `runNinthRoundCases`；沿用持久服务已经允许的脚本，增加独立 `ninthRound` 返回字段 |
| [比较器](../tests/compare-ninth-round.cjs) | 校验浏览器模式、测试路径、源码哈希和用例集合；本地隔离到子进程，有差异时退出 1 |
| 第一份最终样本 | runId `4240c80fd29e42c283b1526f8bd4d367`，UTC `2026-09-15T08:24:07.941Z` |
| 第二份样本 | runId `76f9d2872aea4eaf85a0b7f8eaec6f28`，UTC `2026-09-15T08:24:31.342Z` |
| 主回归附带第三份样本 | runId `9db8b1b616f24a008b292c74a869c141` |

三份样本的第九轮返回值完全一致，测试源码 SHA-256 均为 `5D64B8C4D01FCEEDF9A951987A3AFD03229688098C3BAE2E502F00516AED17CF`。

浏览器为用户手动启动的 Chrome `153.0.8010.37`，端口 `9222`。全过程复用连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，通过后台测试页执行 JavaScript；没有使用鼠标、键盘、剪贴板，也没有重启浏览器或持久调试服务。

## 发现与实现路径

字体测试先设置 `14px Arial`，再赋值待测字体，返回 `font` 和 `measureText('AVabc').width`。颜色测试先设蓝色再赋值，比较样式字符串和一个实际像素。

| 证据 / 输入 | 已确认差异 | 实现位置与处理方向 |
| --- | --- | --- |
| `fontBoundary_hexCRLF`、`escapedCRLF`、`escapedFF`、`literalFF` | 十六进制转义后的 CRLF、反斜杠续行 CRLF/FF，Chrome 接受并解析为 `12px Arial`；本地前两项拒绝，FF 被保留为字体名字符。引号内未转义 FF 应使赋值无效，本地却接受 | [canvas_css.rs](../src/canvas_css.rs) 的 `preprocess`、`family_string`；需统一 CSS 换行规范化与转义续行规则 |
| `fontBoundary_escapedQuoteComment`：未加引号名称中含转义引号，后接注释和 Arial 回退 | 本地保留 `14px Arial`；Chrome 接受并返回含转义引号的字体族列表，使用 12px Arial 的度量 | `preprocess` 未在未加引号状态保护反斜杠转义，引号可能被误当作字符串开始，从而影响后续注释处理 |
| `fontBoundary_genericMultiword`：`12px serif Arial` | 本地接受为 `12px "serif Arial"`；Chrome 拒绝并保留旧字体。`12px Arial serif` 对照则双方都接受 | `font` 将所有多词标识符直接合并，遗漏以通用字体族开始时的语法限制 |
| `fontBoundary_weightBolder`、`weightLighter` | 本地分别保留 `bolder`、`lighter`；Chrome 分别序列化为 `bold`、`100`。本轮 Arial 的实际宽度一致 | `font` 保留相对字重 token；[webgl_native.rs](../src/webgl_native.rs) 的 `font_spec` 把 bolder 映射为 700，lighter 仍落到默认 400。需分开处理序列化和实际相对字重解析 |
| `fontBoundary_obliqueAngle`：`oblique 10deg 12px Arial` | 本地拒绝，保持 14px Arial，宽度 `39.169921875`；Chrome 接受，font getter 返回 `12px Arial`，宽度 `34.248046875` | 当前字体解析器和 FontSpec 只传固定 slant，没有角度字段。这是尚未覆盖的 CSS 字体功能；不能仅依据 getter 缺少 oblique 就认定 Chrome 未应用斜体 |
| `colorBoundary_legacyHslAlpha`：`hsla(0, 100%, 50%, 50%)` | 实际像素双方都是 `[255,0,0,127]`；本地样式 alpha 为 `0.498`，Chrome 为 `0.5` | `canvas_css::alpha` 只提取斜杠后的 alpha；旧式逗号语法丢失序列化所需精度，`style_value` 回退到量化字节 |
| `colorBoundary_hslNonePercent`、`hslZeroPercent`、`hslZeroUnitless` | 三种饱和度为零、亮度为 50 的 HSL 输入都返回 `#808080`；本地绘制 `[128,128,128,255]`，Chrome 绘制 `[127,127,127,255]`。直接赋 `#808080` 对照双方一致 | `function_color` 先将 HSL 结果量化为 u8，后续绘制只能拿到字节。证据提示应核对浮点颜色传递与后端量化时机；问题不只发生在 `none` |
| `bitmapGetterReceiver_width/height`、`bitmapCloseReceiver`、`bitmapProxyGetter` | 对普通对象借用 getter/close，本地返回 undefined，Chrome 抛 TypeError；Proxy 包裹真实位图时，本地可读取 width，Chrome 同样拒绝 | [index.js](../index.js) 的 ImageBitmap getter/close 没有独立实例身份校验 |
| `bitmapConstructor`：从真实位图取得 constructor 后 new | 本地可构造 `[1,1]` 位图；Chrome 抛 TypeError | 本地 ImageBitmap 类构造函数可通过实例暴露调用，需区分内部创建与公开构造 |
| `capsUnicode_leadingSpacingMark`、`normalUnicode_spacingMark`：U+093E 后接 a | 合成小型大写宽度本地 `24.1953125`、Chrome `21.71337890625`；普通字体本地 `25.92333984375`、Chrome `23.44140625`，两者均有像素差异 | [skia_backend.cpp](../src/skia_backend.cpp) 的 `shape_text_blob` 使用单一字体 run；应核对缺失字形回退、脚本 shaping 和标记处理，不能只归因于 small-caps 分段 |
| `capsUnicode_supplementaryMark`、`normalUnicode_supplementaryMark`、`normalUnicode_supplementaryMarkOnly`：U+1D185 | 单独标记宽度本地 17、Chrome 0；接 a 时两条路径均多出 17 宽度，且实际字形不同 | `shape_text_blob` 的固定字体 run 与 `synthetic_caps_runs` 仅 BMP 的 Windows 标记分类都需检查；尚未确认这些差异各自的唯一根因 |

Unicode 用例字体为 Tahoma 17px。每项比较完整 96×48 画布的 18432 个 RGBA 值；五个失败绘图用例分别有 **206、176、219、193、106 个通道值不同**，完整 metrics 顺序为 width、left、right、ascent、descent，详见 JSON。这些计数不是不同像素数量。

## 一致项与范围

32 项一致包含普通 LF 续行、部分控制字符与转义分隔符、通用字体族位于多词末尾、分数字重和 normal 前缀；颜色非法空白、函数名注释、数字中间注释、未结束尾部注释、混合单位及大写 `none` 对照；重复 close、位图快照独立性、创建上下文时的重入/resize，以及将绘图方法借给另一真实上下文。

希腊字母、连字、大写展开相关的 CGJ/word joiner 对照，以及普通/斜体/小型大写的小数基线描边均一致。部分一致项是双方都拒绝输入，不代表支持该语法。

优先修复 ImageBitmap 身份与构造约束、字体换行/转义语法和相对字重，再处理颜色精度；Unicode 字形回退与斜体角度需要保留独立对照。结论限于本机字体、当前 Chrome 和本轮用例，不代表已经执行完整 Canvas 标准测试集。

## 复现

在项目根目录、用户 Chrome 和持久 CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName ninth-round
node tests/compare-ninth-round.cjs
```

当前预期 `tested:55, matched:32, differing:23`，比较器退出码 **1**；本地子进程退出 0。原始结果写入 `out/cdp-ninth-round-{browser,local,diff}.json`。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

既有主回归预期退出 **0**，433 项通过、demo 零差异、GC 通过。该通过数不包括第九轮尚未修复的诊断用例。
