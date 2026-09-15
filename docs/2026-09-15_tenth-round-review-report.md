# OffscreenCanvas 第十轮兼容性检测

2026-09-15，在提交 `9433270062b3494d1c3e93e5ce5998608864035a` 上新增 **46 项检测：29 项一致，17 项存在差异**。本轮只增加诊断用例和证据，生产实现未修改，以下问题尚未修复。17 是失败用例数量，不等于独立缺陷数量。

原有 **503 项回归全部通过**，demo 的 **9216 个 RGBA 值零差异**，渐变 GC 检查通过。生产源文件、`webgl.node`、`demo.js`、`test.js` 的哈希均与第九轮验收相同。第十轮诊断未计入主回归的通过数，本地子进程正常退出。

## 证据与复核

| 证据 | 内容 |
| --- | --- |
| [tenth-round-review.json](tenth-round-review.json) | 默认配置下本地/Chrome 的完整逐项结果、17 项差异、像素计数、重复采集、503 项回归、文件与字体 SHA-256 |
| [测试入口](../tests/fourth-round-cases.js) | `runTenthRoundCases`，复用持久 CDP 服务已经允许的脚本，返回独立 `tenthRound` 字段 |
| [比较器](../tests/compare-tenth-round.cjs) | 校验浏览器模式、脚本路径、源码哈希及完整用例集合；本地使用独立子进程，差异导致退出 1 |
| 首次最终采集 | runId `a38b56e92d0a4b6fb33293d7dccfa182`，UTC `2026-09-15T09:33:37.765Z` |
| 重复采集 | runId `3666dd48b55d495da46e3643c3ef4007`，UTC `2026-09-15T09:33:40.322Z` |
| 主回归附带第三次采集 | runId `539e7081c6474aa499595642dadc46e5` |

三份第十轮结果完全一致，源码 SHA-256 为 `150E30924858BDE3C24C2A4461ECF2DA1740A565DE543DA79C371D729AC29FAA`。

浏览器为用户手动启动的 Chrome `153.0.8010.37`，端口 `9222`，持久连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`。所有浏览器验证在后台测试页执行 JavaScript，没有操作鼠标、键盘或剪贴板，没有重启浏览器或调试服务。

## 已确认的问题

| 证据 / 触发方式 | 本地与 Chrome 的差异 | 实现路径与修复方向 |
| --- | --- | --- |
| `bitmapIntegrity_freeze`：`Object.freeze(bitmap)` 后调用 close | 本地抛 TypeError，尺寸仍为 2×2；Chrome 正常关闭，尺寸变为 0×0 | [index.js](../index.js) 的 ImageBitmap 将内部状态存为普通自有属性，freeze 阻止了内部更新；应隔离内部状态与对象扩展属性 |
| `canvasIntegrity_freeze`：已有 2D 上下文的 Canvas 被 freeze 后设置 width=3 | 本地抛 TypeError，JS 尺寸仍为 2×2；Chrome 正常更新为 3×2。本地原红色内容和样式却已清空、重置 | `_resize` 在写入被冻结的 `_width` 前已调用原生 resize，产生部分更新；除了异常不一致，还存在 JS 尺寸与原生状态不一致的风险 |
| `bitmapOwnWidthShadow`、`canvasOwnWidthShadow`：定义自有 width=0 后作为 drawImage 源 | 本地抛 InvalidStateError，目标仍透明；Chrome 继续使用真实内部尺寸并画出红色 | `checkImageSource` 读取可被遮蔽的公开 width/height；应使用内部状态完成图像源检查，并核对原生图像读取入口 |
| `shadowColorPath_hslGray`：阴影颜色为 `hsl(0 0% 50%)` | 两端 getter 都是 `#808080`；本地阴影 RGB 为 128，Chrome 为 127 | [webgl_native.rs](../src/webgl_native.rs) 的 shadow 仍存 u8，`skia_canvas_set_shadow` 接收字节；第九轮浮点修复只覆盖 fill/stroke 样式 |
| `gradientColorPath_linear/radial/conic_hslGray`：两个相同的 HSL 灰色色标 | 三种渐变分别有 96 个通道值不同，均为本地 128、Chrome 127 | `gradient_add_stop` 与 Gradient.stops 仅保存量化字节，C++ 渐变入口同样接收 u8；需保存绘制用浮点颜色。两端均有渐变抖动，不能将单一像素当作整张结果 |
| `shadowColorPath_hslAlpha`：阴影颜色为 `hsl(0 100% 50% / 50%)` | 像素 alpha 双方均为 127；本地 getter 为 `rgba(255, 0, 0, 0.498)`，Chrome 为 `rgba(255, 0, 0, 0.5)` | shadow 的样式序列化仍使用量化字节，未保存原始 alpha 精度 |
| `hslParserRoute_numericComment/numericExponent/numericNoneHue` | 带尾部注释、alpha 为 `5e-1`，或 hue 为 `none` 时，getter 相同；本地像素 alpha 为 128，Chrome 为 127。普通 numeric、unitless 对照通过 | [canvas_css.rs](../src/canvas_css.rs) 的 `hsl_color` 仅检查通道形式便量化 numeric alpha，未完整区分 Chrome 快速解析与普通解析路径；预处理也会丢失注释信息 |
| `fallbackClusters_mixedScripts_normal`：Tahoma 17px 绘制 `a` + U+093E + `B` | 本地宽度 `35.9423828125`、Chrome `33.46044921875`；字形边界和 256 个通道值不同 | [skia_backend.cpp](../src/skia_backend.cpp) 的 `fallback_runs` 将所有组合标记固定到前一字体；这里的间距标记需要核对独立回退及脚本边界 |
| `fallbackClusters_mixedScripts_small-caps`：同一文本启用 small-caps | 本地宽度 `29.21435546875`、Chrome `31.732421875`，211 个通道值不同 | `synthetic_caps_runs` 同时将标记归入前一大小写分段；需要检查间距标记的字号和回退规则，不能只修正普通字体路径 |
| `fallbackClusters_cjk_normal/small-caps`：Tahoma 绘制 `A中a` | 两种样式的宽度均与 Chrome 相同；本地实际 ascent 为 14，Chrome 为 15，每项有 98 个通道值不同 | 应核对中文回退字体及 SkFont 度量/栅格化设置；现有证据不足以锁定唯一原因 |
| `cjkTypefaceControl_SimSun`：明确指定 SimSun 绘制 `A中a` | 本地 width/left/right 为 `[34,1,34.5]`，Chrome 为 `[35,0,34]`，84 个通道值不同；明确指定 Microsoft YaHei、Microsoft YaHei UI、Noto Sans SC 的对照均一致 | 即使绕过字体回退选择，也存在 SimSun 的度量或绘制配置差异；检查 `resolve_font`、字形宽度与嵌入位图设置 |

冻结 Canvas 后报错时内容仍被清空，是本轮需要优先处理的状态一致性问题。对象 seal/preventExtensions 的对照没有出现同样失败。

一次独立本地诊断将 `CANVAS_FONT_EMBEDDED_BITMAPS` 设为 1，但上述三个中文字体失败用例仍未全部一致。因此不能把“全局开启嵌入位图”当作已验证修复。该诊断单独保存在 JSON 的 `embeddedBitmapProbe`，没有用于替换默认配置下的比较结果，也没有写入生产默认值。

文字用例每项比较完整 96×48 画布，即 18432 个 RGBA 值；渐变用例比较 8×8 的 256 个 RGBA 值。差异计数是通道值数量，不是像素数量。完整 metrics 顺序为 width、left、right、ascent、descent。

## 一致项与检查范围

29 项一致包含 seal/preventExtensions 后的位图关闭与 Canvas 尺寸修改、冻结后创建上下文/设置上下文状态/绘制位图、冻结渐变对象后添加色标；十六进制灰色与 RGBA 的阴影和渐变对照、HSL 百分比 alpha 渐变、部分 numeric/精度颜色对照；开头多个组合标记、带音乐符号基字符的字体回退；三种明确指定的中文字体。

本轮继续使用当前 Chrome 和本机字体，没有执行完整 Canvas 标准测试集。默认配置的失败用例仍待修复；原有 503 项通过仅表明既有覆盖没有退化。

## 复现

在项目根目录、现有 Chrome 和持久 CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName tenth-round
node tests/compare-tenth-round.cjs
```

当前预期 `tested:46, matched:29, differing:17`，比较器退出码 **1**；本地子进程退出 0。快照保存于 `out/cdp-tenth-round-{browser,local,diff}.json`。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

主回归预期退出 **0**，503 项通过、demo 零差异、GC 通过；第十轮诊断尚未纳入通过计数。
