# OffscreenCanvas 第六轮兼容性检测

2026-09-15，在第五轮修复提交 `8c74c8b8c2927351b8750d6af50301ac833ab527` 上新增 36 项诊断：**15 项一致，21 项存在差异**。21 是失败用例数，多个用例共用同一实现问题。本轮未修改生产代码或原生模块。

原有 **274 项回归全部通过**，demo 的 9216 个 RGBA 值零差异，渐变 GC 检查通过。第六轮使用独立比较器，尚未并入主回归的通过计数。本地诊断子进程正常退出，没有观察到崩溃。

## 验证与证据

浏览器参照为用户手动启动的 Chrome `153.0.8010.37`，调试端口 `9222`。采集复用持久连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，在后台临时测试页执行 JavaScript，没有使用鼠标、键盘或剪贴板，也没有重启浏览器或调试服务。

| 证据 | 内容 |
| --- | --- |
| [sixth-round-review.json](sixth-round-review.json) | 逐项本地/Chrome 返回值、差异清单、两次采集、274 项回归结果和文件 SHA-256 |
| 首次采集 | runId `3e7bac014caa4260a4fd6fdd8494dde2`；UTC `2026-09-15T06:20:41.906Z` |
| 重复采集 | runId `5942f421a1dd4e2eb5c5756aecffdd10`；UTC `2026-09-15T06:21:21.883Z`；36 项浏览器返回值与首次完全一致 |
| [用例入口](../tests/fourth-round-cases.js) | `runSixthRoundCases`；SHA-256 `0E00BD720CB91BA0E9FE49436A93B098942EC0FC59185BFAB868482DD5271683` |
| [比较器](../tests/compare-sixth-round.cjs) | 校验采集模式、脚本路径、源码哈希、用例集合；本地在独立子进程执行，存在差异时退出码为 1 |

`index.js`、`src/webgl_native.rs`、`src/canvas_css.rs`、`src/skia_backend.cpp`、`webgl.node` 的哈希均与[第五轮验收证据](fifth-round-fixes.json)一致。

## 差异及实现位置

下表中的用例名对应 JSON 的 `comparison.differences[].name`。字体语法测试先设置 `14px Arial`，颜色语法测试先设置蓝色；无效赋值应保留此前状态。

| 证据 / 输入 | 发现：本地与 Chrome | 实现位置与修复方向 |
| --- | --- | --- |
| `heightConversionChangesWidth`：赋值 `height` 时，`valueOf()` 将 `width` 改成 8，再返回 6 | 本地尺寸 `[4,6]`，Chrome `[8,6]`；重入后的宽度被覆盖 | [index.js](../index.js) 的 `height` setter 在转换前读取旧宽度；应先完成高度转换，再读取当前宽度 |
| `contextPrototypeGetter`：`Object.prototype.alpha` 为只读 getter | 本地抛 `TypeError`；Chrome 读取一次，成功创建 `alpha:false` 上下文 | `index.js::contextOptions` 向普通 `{}` 写转换结果，撞上继承的只读访问器；应避免内部字典受原型属性影响 |
| `fontGrammar_trailingDot`：`12.px Arial`；`fontGrammar_bareHyphen`：`12px -` | 本地接受这两个非法值；Chrome 保留 `14px Arial` | [src/canvas_css.rs](../src/canvas_css.rs) 的 `font`：补 CSS 数字 token 和字体族标识符规则 |
| `fontGrammar_nullFamily`：`12px "A\0B"` | 本地保留 NUL 和引号；Chrome 返回 `12px A�B` | `canvas_css::font` 缺少 CSS NUL 替换及相应序列化 |
| `fontWeight950`：`950 12px Arial`，测量 `iiiiWW` | 本地宽度 `33.31640625`，Chrome `39.984375`；两端 font 字符串相同，900 对照项一致 | [src/webgl_native.rs](../src/webgl_native.rs) 的 `font_spec` 只接受 100～900，其余回退 400，与解析器接受 1～1000 不一致 |
| `fontSmallCaps`：`small-caps 16px Arial`，测量 `abc` | 本地宽度 `25.796875`，Chrome `27.4765625` | CSS 层接受 `small-caps`，但 `FontSpec` 及文字调用没有传递 variant；需实现对应文字处理 |
| `colorGrammar_trailingDot`：`rgb(255.,0,0)`；`colorGrammar_alphaTrailingDot`：`rgba(255,0,0,1.)` | 本地变红；Chrome 忽略非法值，仍为蓝色 | `canvas_css::function_color` / `alpha` 使用通用浮点解析，需约束 CSS 数字语法 |
| `colorGrammar_comments`：`rgb(255/**/ 0 0)` | 本地仍蓝，Chrome 变红 | `canvas_css::function_color` 缺少注释 token 处理 |
| `colorGrammar_hslNumber`：`hsl(0 100 50)` | 本地仍蓝，Chrome 变红 | `canvas_css::function_color` 要求饱和度、亮度带 `%`，未支持此现代数字形式 |
| `fillStyleAlphaPrecision`：`rgb(255 0 0 / 0.123456789)` | 本地返回 alpha `0.123456789`，Chrome 返回 `0.12`；同输入的 `shadowColor` 对照项一致 | `webgl_native::style_value` 的 `Style::CssColor` 分支直接返回原始 alpha；这里确认的是序列化差异 |
| `blobOptionsOrder` | 本地 getter 日志 `[]`，Chrome 为 `["quality","type"]`；均成功返回 PNG | `index.js::convertToBlob` 未读取 `options`；应按字典成员顺序完成转换 |
| `blobTypeThrows`、`blobQualityThrows` | getter 抛 `RangeError`；本地仍成功导出，Chrome 传播异常 | 同上；不能跳过 getter 及异常传播 |
| `blobQualitySymbol`、`blobTypeSymbol`、`blobPrimitiveOptions` | 本地成功导出；Chrome 均为 `TypeError` | 同上；补字典、数字及字符串转换 |
| `blobZeroOptionsOrder` | 两端均为 `IndexSizeError`，但只有 Chrome 先读取 `type` getter | 同上；参数转换应先于画布尺寸检查 |
| `blobOptionResizesCanvas`：`type` getter 将宽度改为 0 | 本地成功导出；Chrome 为 `IndexSizeError` | 同上；转换后应检查画布当前尺寸 |
| `blobMissingContextControl`：未调用 `getContext()` 就导出 | 本地生成 PNG；Chrome 为 `InvalidStateError` | `convertToBlob` 未验证上下文状态，`data` getter 为无上下文画布合成透明数据 |

尺寸覆盖和 Blob 参数/状态校验建议优先处理；随后修复内部字典、字体及颜色行为。字体与颜色部分既有非法输入被错误接受，也有有效 CSS 功能尚未实现，不能仅靠放宽字符串解析解决。

Blob 参数用例都先创建 2D 上下文，只有 `blobMissingContextControl` 故意不创建。这样可将缺少上下文的状态错误与 options 转换错误分别验证；这些问题独立于项目已记录的 JPEG/WebP 编码支持限制。

## 对照项与范围

15 项一致：宽度赋值期间修改高度、尺寸转换修改状态后抛异常、上下文 options 修改尺寸、自定义原型继承选项、显式 undefined 选项、ImageData settings 修改尺寸、原始类型 settings 校验、ImageData 克隆额外 undefined 参数、字体指数写法、字重 900、现代 RGB 混合单位、极大 hue、shadow alpha 序列化、Blob null options、Blob 两次导出内容随绘制变化。

最后一项检查红色绘制与后续蓝色绘制导出的内容不同，没有逐像素解码验证 Blob。`small-caps` 本轮直接测量的是文本宽度。原型访问器用例在临时浏览器页面或独立 Node 子进程执行，并在 `finally` 中恢复原属性。

通过现有样本不代表实现已覆盖完整 Canvas/CSS 标准。字体结论针对本机字体及当前 Chrome 版本；未扩大为全部平台、字体和绘图路径的保证。

## 复现

在项目根目录、用户 Chrome 与已有持久 CDP 连接可用时运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName sixth-round
node tests/compare-sixth-round.cjs
```

当前预期：`tested:36`、`matched:15`、`differing:21`，比较器退出码 **1**；这是已发现差异的正常报告行为。原始结果写入 `out/cdp-sixth-round-{browser,local,diff}.json`，提交中的 JSON 证据保留本次采集快照。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

主回归预期退出码 **0**，274 项通过、demo 零差异、GC 通过。第六轮异步用例复用已经允许的 `tests/fourth-round-cases.js` 入口，浏览器结果新增 `sixthRound` 字段；第四/第五轮比较仍读取各自字段。
