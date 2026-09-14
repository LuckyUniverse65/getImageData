# OffscreenCanvas 第三轮检测

> 历史检测记录：以下是修复前的差异和崩溃证据。后续已修复全部 36 项差异与 Unicode 颜色崩溃，并扩充回归至 158 项，最终全部通过现有 Chrome CDP 对照。详见[第三轮修复记录](2026-09-14_third-round-fixes-report.md)。

2026-09-14，在 `450ad04` 的源码和原生产物上继续检测。通过用户手动启动的 Chrome 153.0.8010.37 / 9222 CDP 确认：55 项新增定向检查中，19 项一致、36 项存在差异；另一个隔离测试确认非法 Unicode 颜色会终止整个 Node 进程。

本轮新增诊断脚本和证据，未修改生产源码或重编译 `webgl.node`。原有 92 项回归仍全部与 Chrome 一致，demo 的 9216 个 RGBA 值零差异，GC 检查通过。新增检查刻意选择此前未覆盖的行为，36/55 不是整体错误率，也不代表 36 个互相独立的底层缺陷。

## 优先修复：非法颜色导致进程终止

**证据**：先设 `fillStyle='red'`，再设 `fillStyle='#红'`。

- Chrome 忽略非法颜色，保留 `#ff0000`，随后绘制红色像素 `[255,0,0,255]`。
- 本地隔离子进程退出码为 `3221226505`，输出 Rust panic：`byte index 1 is not a char boundary; it is inside '红' (bytes 0..3)`。JavaScript 的 try/catch 无法捕获该原生进程终止。通过独立子进程再次复现，结果相同。

**根因与路径**：[src/webgl_native.rs:556](../src/webgl_native.rs#L556) 的 `parse_color` 用 UTF-8 字节长度识别十六进制格式，接着对字符串直接执行 `hex[0..1]` 等切片。`红` 占三个字节，进入三位十六进制分支，切片边界落在字符内部并 panic。这是普通非法输入应被忽略却导致进程退出的问题。

**建议**：先确认十六进制正文只含 ASCII hex 字符，再使用字节或安全索引解析；无效值返回 None，保留现有绘图状态。共享解析函数的其他调用入口也需要同步检查。

安全复现脚本为 [compare-unicode-color.cjs](../tests/compare-unicode-color.cjs)，它只在可丢弃子进程内加载原生模块并记录退出状态。不要把崩溃样本直接混入主回归进程。

## 新确认的行为差异

| 证据 / 触发 | 本地结果 | 同一 Chrome 结果 | 根因路径与修复方向 |
| --- | --- | --- | --- |
| `fillText(123,0,16)`、`measureText(123)` | 不绘制，宽度 0 | 绘制字符串 123，宽度约 16.65 | [Rust 文本入口](../src/webgl_native.rs#L1181) 直接读取字符串，缺少 DOMString 转换；对象 toString 也未调用。 |
| `measureText(Symbol())`、`measureText()` | 返回空文本度量 | TypeError | [measureText](../src/webgl_native.rs#L1211) 缺少类型和必选参数校验。 |
| `measureText('A\tB')` / `measureText('A\nB')` | 宽约 22.65；空格版本约 14.89 | 三者宽度相同，约 14.89 | 文本准备阶段应把 ASCII 空白转换为空格。另有较小的宽度精度差异，完整值保存在 JSON。 |
| 空字符串 fillText 的 maxWidth 使用 valueOf 对象 | 未调用 valueOf | 调用 1 次 | 文本入口先对空文本提前返回，跳过了应先发生的参数转换。 |
| 已有 `12px Arial` 后设 `italic italic 16px Arial` 或 `16px /` | 接受非法字体字符串 | 保留 `12px Arial` | [valid_font](../src/webgl_native.rs#L808) 只做词元白名单和非空后缀检查，未校验重复样式和字体族语法。 |
| `drawImage(image,0)` / 四参数调用 | 静默返回 / 按三参数形式绘制 | TypeError | [drawImage](../src/webgl_native.rs#L1044) 按参数数量下界分支，未严格执行重载解析。 |
| drawImage 接受普通 `{width,height,data}` | 绘制对象中的像素 | TypeError | 同上，只读取对象字段，没有 CanvasImageSource 身份校验。属于接口兼容性差异，不能据此认定安全漏洞。 |
| drawImage 使用零尺寸 Canvas 或已 close 的 ImageBitmap | 静默返回 | InvalidStateError | 同上，零尺寸/无效源分支缺少异常。 |
| `createPattern(source,'invalid')` | 返回 Pattern 对象 | SyntaxError | [createPattern](../src/webgl_native.rs#L1066) 将未知 repetition 当作 repeat。 |
| createPattern 使用零尺寸 Canvas | undefined | InvalidStateError | 同上，源状态校验不完整。 |
| createImageData / putImageData 缺参；传普通对象充当 ImageData | 返回空对象或接受并写入像素 | TypeError | [createImageData](../src/webgl_native.rs#L1254)、[putImageData](../src/webgl_native.rs#L1273) 缺少重载和对象身份校验。合法 ImageData 克隆测试通过。 |
| `fill('invalid')`、`clip('invalid')`、命中测试传非法规则 | 接受，按默认规则处理 | TypeError | fill / [clip](../src/webgl_native.rs#L1369) / [命中测试](../src/webgl_native.rs#L1361) 只识别 evenodd，未验证枚举。 |
| 命中测试缺参、roundRect 缺参 | false / 静默返回 | TypeError | 对应入口缺必选参数验证。 |
| roundRect 半径 `new Set([2])` | RangeError | 正常圆角路径 | [round_rect_radii](../src/webgl_native.rs#L420) 仅识别数组，把其他可迭代对象误当作点字典。 |
| roundRect 半径 NaN | RangeError | 不添加路径，无异常 | [radius_pair](../src/webgl_native.rs#L400) 将负数和非有限值合并为同一错误。 |
| `setTransform({},undefined)` | TypeError | 接受对象重载，矩阵复位 | [JS 适配](../index.js#L38) 对 2–5 个参数直接报错，与此重载行为不同。 |
| `setTransform({is2D:true,m13:1})` | 忽略矛盾成员并修改矩阵 | TypeError | [字典适配](../index.js#L49) 只读取六个 2D 值及别名，漏掉其余 DOMMatrixInit 一致性检查。 |
| Proxy 观察矩阵字典读取 | a,m11,b,m12…，只读取 12 个成员 | a,b,c,d,e,f,m11…及 is2D/3D 成员 | 同上，访问顺序可被 getter/Proxy 观察，有副作用时会影响结果。 |
| `rgb(255 0 0 / 50%)`、`hsl(120,100%,50%)` | 忽略有效颜色，继续使用黑色 | 半透明红色 / 绿色 | [parse_color](../src/webgl_native.rs#L556) 未覆盖现代 RGB 和 HSL 语法。 |

`setTransform({is2D:false})` 和 `{m13:1}` 在这台 Chrome 上与本地一致，没有将它们单独列为错误；差异来自带有矛盾 is2D 声明的情况。`getContext('2d',3)`、属性 getter 抛错后重试创建，也与 Chrome 一致。

## 已知范围限制的具体复现

以下行为在上一轮 README/报告已经说明未完整实现，本轮补充了可复现证据，计入上述 36 项差异，但不是新回归：

- **非空文本实际边界**：`12px Arial` 的 M，本地 ascent/descent 约 10.86/2.54，Chrome 为 9/0；textAlign=center 时本地左右边界也未随对齐调整。实现用字体度量和 advance 宽度代替实际字形边界。
- **CSS 字体完整解析**：`12pt Arial` 本地保持默认字体，Chrome 转为 `16px Arial`；`normal 12px Arial` 本地原样返回，Chrome 规范化为 `12px Arial`。非法 px 字体被接受的问题则是上表列出的校验缺陷。
- **图像阴影**：drawImage 设蓝色阴影、向右偏移 8 像素，Chrome 的阴影采样点为蓝色，本地透明。C++ 图像入口未调用路径/文本所用的阴影绘制逻辑。

## 通过的控制测试与原有回归

新增 19 项一致，包括自绘图像重叠、无效图像坐标、合法 ImageData 克隆、putImageData 忽略当前变换/裁剪/透明度、奇异变换后的恢复、路径跨 save/restore、空裁剪 restore、resize 清空状态栈、alpha:false 的 copy 行为和 RGB 百分比颜色等。完整名称见 JSON 的 matches。

| 检查 | 结果 |
| --- | --- |
| 原有测试 | 92/92 一致 |
| demo | 9216 个 RGBA 值，0 差异 |
| 渐变 GC | 通过 |
| 第三轮普通边界测试 | 55 项：19 一致、36 不同 |
| 独立 Unicode 颜色测试 | Chrome 保留原值；Node 子进程终止 |

## 复现与证据

继续使用用户现有 Chrome/profile，端口 9222。采集在独立后台标签页执行，结束仅关闭本次测试页，不使用鼠标、键盘、剪贴板，也不启动新浏览器。首次连接超时，重试成功，以下均为成功采集的结果。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/third-round-cases.js -OutputName third-round
node tests/compare-third-round.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/unicode-color-case.js -OutputName unicode-color
node tests/compare-unicode-color.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

两个新增比较器在当前实现上预期退出 1，表示检测到差异，不是浏览器采集失败。主回归退出 0。新测试保持为单独的诊断入口，未修改原有回归的通过标准。

- 普通用例：[third-round-cases.js](../tests/third-round-cases.js)，55 项。
- 对照工具：[compare-third-round.cjs](../tests/compare-third-round.cjs)、[compare-unicode-color.cjs](../tests/compare-unicode-color.cjs)，均核对浏览器模式与测试源码 SHA-256。
- 可提交的完整证据：[third-round-review.json](third-round-review.json)，包含差异、全部返回值、崩溃 stderr、产物哈希和回归结果。
- 普通用例 Chrome runId：`dd4b64dad1644b0d81b35906fb5b0675`。
- Unicode 颜色 Chrome runId：`ea2386a847e746b7b8f402ca1ea8f6bd`。
- 92 项回归 runId：`730089fab5804dbfbc2557019b84eb3b`、`10bcd3baff25492a97f5f1076cbd652c`。
- demo runId：`5dc340d907474542a62d2d2968826d84`。
- 原生 SHA-256：`A76F70B3984602B7B9A429ECC2F26923BDBACE87AF9E47953DAA04D7324E0510`，与第二轮修复产物相同。

修复顺序建议：先消除颜色解析 panic，再处理常用接口转换/重载/状态校验，随后完善矩阵和 roundRect，最后补齐 CSS 解析、实际文本度量及图像阴影。每组修复应加入相应回归断言，并重新运行原有 92 项和本轮诊断。
