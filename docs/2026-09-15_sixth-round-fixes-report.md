# OffscreenCanvas 第六轮修复与验收

2026-09-15，第六轮检测记录的 **21 个失败用例全部修复**。原有 36 项加上 16 项相关边界，共 **52 项全部与当前 Chrome 一致**，已纳入主回归。完整 **326 项通过**，demo 的 9216 个 RGBA 值零差异，渐变 GC 检查通过。

修复前证据见[第六轮检测报告](2026-09-15_sixth-round-review-report.md)及 [sixth-round-review.json](sixth-round-review.json)。最终源码、原生模块和测试入口哈希，以及逐项 Chrome/本地返回值，保存在 [sixth-round-fixes.json](sixth-round-fixes.json)。`demo.js` 保持原哈希。

## 修复内容

| 证据与触发条件 | 修复后的行为 | 实现路径 |
| --- | --- | --- |
| `heightConversionChangesWidth`：高度参数转换时把宽度改为 8 | 保留重入修改，尺寸为 `[8,6]` | [index.js](../index.js) 的高度 setter 先转换参数，再读取当前宽度 |
| `contextPrototypeGetter`、`contextAttributesOwnProperties` | 原型 getter 只读取一次；返回字典具有可写、可枚举、可配置的自有数据属性，不调用继承 setter | JS 转换中使用无原型字典和自有枚举键检查；[webgl_native.rs](../src/webgl_native.rs) 使用 `dictionary_set` 定义属性 |
| 字体和颜色中的 `12.`、`255.`、`1.` | 忽略非法 CSS 数字，保留已有状态；合法指数和小数继续有效 | [canvas_css.rs](../src/canvas_css.rs) 共用 CSS 数字 token 校验 |
| 字体族 `-`、NUL、引号及转义 | 拒绝非法标识符，替换 NUL，并规范化本轮覆盖的字体族字符串 | CSS 预处理、字体族标识符校验及序列化 |
| `rgb(255/**/ 0 0)`、`hsl(0 100 50)` | 注释和现代 HSL 数字形式解析为红色 | CSS 注释处理及现代/旧式 HSL 参数规则 |
| `fillStyleAlphaPrecision` 与新增精度扫描 | alpha 按字节量化后序列化，`0.123456789` 返回 `0.12`；保留已有百分比像素行为 | `style_value` 使用标准 alpha 序列化函数 |
| `fontWeight950`、`fontWeightRange` | 1～1000 的字重传给字体后端，950 不再回退到 400 | Rust `font_spec` 与 [skia_backend.cpp](../src/skia_backend.cpp) 字体选择范围一致；字重解析排除字号 token |
| `fontSmallCaps`、尺寸扫描、实际填充和描边 | `small-caps` 传递 OpenType `smcp`，测量、字形边界和绘制保持一致 | Rust/C++ 文字接口新增 variant 参数，HarfBuzz 保留替换字形及相应位置 |
| `smallCapsWordSpacing`：含 `空格+A` 的普通和小型大写文字 | 空格边界不再错误应用字距调整，文字宽度和绘制位置与 Chrome 一致 | SkShaper feature 范围控制 |
| Blob 参数 getter、Symbol、BigInt、原始类型 options | 按 `quality → type` 顺序转换，传播 getter 异常并检查参数类型；`quality` 接受 NaN、Infinity | `index.js::convertToBlob` 补 ImageEncodeOptions 字典转换 |
| Blob 零尺寸、无上下文、getter 修改尺寸 | 参数转换完成后检查当前尺寸，再检查上下文；分别返回 `IndexSizeError` / `InvalidStateError` | `convertToBlob` 按顺序执行状态检查 |

## 验收证据

所有浏览器验证均使用用户手动打开的 Chrome `153.0.8010.37`、端口 `9222`，复用持久连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`。未启动新浏览器、重启调试服务或使用鼠标键盘。

| 验证 | 最终结果 |
| --- | --- |
| 原生 Release 构建 | 成功，已更新 `webgl.node`；构建仍报告原有未使用代码等警告 |
| 原有回归 | 274 项全部通过 |
| 第六轮 | 52 / 52 一致；本地子进程正常退出；比较器退出码 0 |
| 完整回归 | 326 / 326，`browserVerified:true` |
| demo | 9216 个 RGBA 值，差异 0 |
| 渐变 GC | 通过 |
| 第四/第五/第六轮共用采集 | runId `b2ef5397c6704e9f99c1457497fe5f8c` |
| demo 采集 | runId `d1bf9aa1e3974581b70311898ceb27ab` |

新增边界包括：字典返回属性描述符、5 种字号下的大小写/重音字符测量、小型大写填充与描边逐像素比较、save/restore、字重边界、字体族序列化、alpha 精度、Blob NaN/Infinity/BigInt/负 quality、参数转换重入、零尺寸且无上下文，以及普通/小型大写文字的空格边界。完整逐项值和六次采集元数据均在 JSON 证据中。

## 运行

用户 Chrome 和现有 CDP 会话可用时，在项目根目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-sixth-round.cjs
```

两条命令均应退出 0，分别返回 326 项主回归和 52 项第六轮结果。第六轮已经由主测试执行；独立比较器用于查看逐项结果，失败时退出 1。

重新构建使用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
```

Rust/C++ 文字接口及 `webgl.node` 需要同步更新。构建依赖仍遵循 [README](../readme.md) 中的本机工具链说明。

## 范围

本轮 `small-caps` 验证基于安装的 Arial 自带 OpenType `smcp` 字形；缺少该特性的字体仍未实现合成小型大写。完整 CSS 字体/颜色语法、逐字形字体回退、双向文字塑形、全部字体和平台不在本轮完整覆盖范围。

Blob 编码仍支持 PNG；本轮修复参数转换和状态处理，未增加 JPEG/WebP 编码器。测试没有将这些既有支持限制算作已修复功能。
