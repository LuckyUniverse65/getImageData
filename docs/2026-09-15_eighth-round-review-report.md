# OffscreenCanvas 第八轮兼容性检测

2026-09-15，在提交 `2211a42f155302b0d86e73e9dca028e9b93faf59` 上新增 **46 项诊断：17 项一致，29 项存在差异**。29 是失败用例数，多个用例对应同一实现问题。本轮未修改生产代码或原生模块，发现的问题尚未修复。

原有 **361 项回归全部通过**，demo 的 9216 个 RGBA 值零差异，渐变 GC 检查通过。第八轮使用独立比较器，未并入原有主回归的通过计数；本地子进程正常退出，没有观察到崩溃。

## 证据

| 证据 | 内容 |
| --- | --- |
| [eighth-round-review.json](eighth-round-review.json) | 本地与 Chrome 逐项值、29 项差异、像素差异计数、重复采集、361 项回归结果和文件 SHA-256 |
| [用例入口](../tests/fourth-round-cases.js) | `runEighthRoundCases`；源码 SHA-256 `9EE56F970329C0A194053D6BA2D8E0E6CE974F1E2287EAF9AEA01A238B204257` |
| [比较器](../tests/compare-eighth-round.cjs) | 校验采集模式、脚本路径、源码哈希、用例集合；本地使用独立子进程，有差异时退出 1 |
| 首次最终采集 | runId `2e333de2e0634f87ac78c2df78c4c54d`；UTC `2026-09-15T07:51:48.474Z` |
| 重复采集 | runId `c9e7b4ab22ba4ed2b94165c8e76665f6`；UTC `2026-09-15T07:51:52.755Z`；46 项浏览器结果完全一致 |

浏览器为用户手动启动的 Chrome `153.0.8010.37`，端口 `9222`，持久连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`。所有采集在后台临时测试页执行 JavaScript，没有使用鼠标键盘，也没有重启浏览器或调试服务。

生产文件、`webgl.node`、`demo.js`、`test.js` 的哈希与[第七轮验收证据](seventh-round-fixes.json)一致。新增用例使用已经允许的采集入口，结果增加独立 `eighthRound` 字段。

## 发现与实现位置

下表中的用例名对应 JSON 的 `comparison.differences[].name`。字体赋值测试预先设置 `14px Arial`，颜色测试预先设置蓝色，以确认非法输入是否保留原状态。

| 证据 / 输入 | 本地与 Chrome 的差异 | 实现位置及处理方向 |
| --- | --- | --- |
| `canvasGetterReceiver_width/height`：从原型取 getter，对普通对象调用 | 本地返回 undefined；Chrome 抛 `TypeError` | [index.js](../index.js) 的 OffscreenCanvas getter 缺少实例身份校验 |
| `canvasSetterReceiver_width/height`：普通对象带 `_resize`，赋值参数带 `valueOf` | 本地执行转换和伪对象 `_resize`，各 1 次；Chrome 直接 `TypeError`，二者均 0 次 | setter 应在参数转换前校验接收对象，不能只依靠同名字段 |
| `canvasContextReceiverOrder`、`canvasBlobReceiverOrder` | 普通对象调用方法时，本地先读取 type/alpha 等参数；Chrome 在读取参数前就抛 `TypeError`。Blob 本地还误报 `IndexSizeError` | `getContext`、`convertToBlob` 入口补身份校验及异常顺序 |
| `canvasTransferReceiver` | 伪对象带空 `_contexts` 时，本地 `InvalidStateError`，Chrome `TypeError` | `transferToImageBitmap` 入口同样缺少身份校验；正常子类对照项通过 |
| `fontToken_escapedQuote`、`fontToken_escapedIdentifier` | 本地拒绝 `12px "A\"B"` 和 `12px \41 rial`；Chrome 分别接受为含引号的字体名及 Arial | [canvas_css.rs](../src/canvas_css.rs) 的字体分词与标识符解析未完整处理转义；不能把转义引号当作结束引号 |
| `fontToken_quotedGeneric`、`fontToken_quotedKeyword` | 本地把 `"serif"`、`"inherit"` 的引号去掉；Chrome 保留引号 | `serialize_family` 需要区分保留字、通用字体族和普通名称 |
| `fontToken_reservedFamily`、`fontToken_reservedInitial` | 本地接受未加引号的 `inherit`、`initial` 作为字体族；Chrome 忽略赋值，保留旧字体 | `font` 的未加引号字体族校验遗漏保留字 |
| `fontToken_multiwordFamily` | 本地返回 `12px Times New Roman`，Chrome 返回 `12px "Times New Roman"` | 未加引号的多词字体族需要规范序列化；本项只确认字符串差异 |
| `capsStyle_*_bold`、`capsStyle_*_bold italic`，共 6 个用例 | 本地顺序为 `small-caps bold` 或 `italic small-caps bold`；Chrome 为 `bold small-caps` 或 `italic bold small-caps` | `canvas_css::font` 当前按 style → variant → weight 输出，应调整为 Chrome 的序列化顺序；Tahoma 组合项另有字形边界差异 |
| `colorToken_commentPrefix`、`colorToken_commentSuffix` | `/**/rgb(255 0 0)`、`rgb(255 0 0)/**/` 本地仍蓝，Chrome 变红 | [webgl_native.rs](../src/webgl_native.rs) 的 `parse_color` 在预处理前判断函数前缀；`function_color` 在注释移除后没有清理尾部空白 |
| `colorToken_noneChannel` | `rgb(none 0 0)` 本地拒绝，Chrome 接受并绘制黑色 | `canvas_css::function_color` 只有数字通道解析，尚未覆盖现代 CSS Color 的 `none` 通道 |
| `capsBoundaries_Tahoma/Courier New` 中的 `\u0301a`，以及对应两个 `leadingCombiningDrawing_*` | Tahoma 的 ascent 本地 13、Chrome 9；Courier New 本地 14、Chrome 11。实际像素分别有 14、10 个 RGBA 值不同 | [skia_backend.cpp](../src/skia_backend.cpp) 的 `synthetic_caps_runs` 将开头无基字符的组合标记放入原字号分段；需核对其与后续小写字母的分组规则 |
| `capsStyle_Tahoma_italic`、`capsStyle_Tahoma_bold italic`、`italicTahomaDrawing` | 测量 `aVéß` 时本地 ascent 12、Chrome 13；填充图有 257 个 RGBA 值不同 | `resolve_font`、`synthetic_caps_blob` 的斜体派生字体和字形边界路径需要进一步定位，当前不能认定唯一底层原因 |

像素用例都比较完整 80×40 画布的 12800 个 RGBA 值，差异计数是通道值数量。Tahoma 普通斜体的本轮测量对照一致；两端也都能区分正常与斜体绘制，因此证据不支持“完全没有斜体效果”的结论。

建议先补 Canvas 接收对象校验及转换顺序，再处理字体分词/序列化和颜色注释，随后修正合成字形分组与 Tahoma 斜体派生配置。字体与颜色的部分发现属于尚未覆盖的 CSS 功能，应与错误接受非法输入分别处理。

## 一致项与范围

17 项一致包含空字体族、字体中间/尾部注释、反斜杠与 Unicode 空白对照；颜色闭括号前注释、命名颜色注释/转义、旧式非法 HSL、百分比 alpha；Courier New/Arial 斜体、Arial 特殊字符边界、Tahoma 普通斜体测量、字体斜体效果对照；正常 Canvas 子类，以及 Blob quality 失败时的读取顺序。

一致项可能是双方都拒绝输入，不代表新增功能支持。字体结果针对本机字体和当前 Chrome，未扩大为所有字体、脚本、字号或平台的保证。第八轮样本通过既有封装触及原生路径，但本轮没有执行完整 Canvas 标准测试集。

## 复现

在项目根目录、用户 Chrome 和持久 CDP 会话可用时运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName eighth-round
node tests/compare-eighth-round.cjs
```

当前预期结果为 `tested:46`、`matched:17`、`differing:29`，比较器退出码 **1**；本地子进程正常退出。原始结果写入 `out/cdp-eighth-round-{browser,local,diff}.json`，提交中的 JSON 证据保留本次快照。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

主回归预期退出码 **0**：361 项通过、demo 零差异、GC 通过。它尚未把第八轮待修复用例计入通过结果。
