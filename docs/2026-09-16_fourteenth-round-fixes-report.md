# OffscreenCanvas 第十四轮连续检测与修复

2026-09-16，完成多轮“新增检查 → 修复 → 复查”，当前覆盖范围内无剩余差异。新增 **180 项全部通过**，完整 **974 项**与用户手动启动的 Chrome **153.0.8010.48** 实时一致。原始 demo 的 **9216 个 RGBA 值零差异**，渐变与图案 GC 检查通过。

## 检查收敛过程

| 检查阶段 | 新发现的失败用例数 | 修复后结果 |
| --- | --- | --- |
| 首批 100 项：字体组合、间距、图像裁剪和阴影 | 21 | 100/100 一致 |
| 扩展到 141 项：字体脚本、单位测量、阴影变换与合成 | 14 | 141/141 一致 |
| 扩展到 180 项：极端间距、混合脚本、ImageBitmap、源裁剪 | 8 | 180/180 一致 |
| 将新增测试接入完整回归，再次实时采集 Chrome | 0 | 974 项全部通过 |

这些数字是不同失败用例数，同一底层原因可能影响多个用例。首次差异、各阶段用例清单及最终精确结果见 [fourteenth-round-fixes.json](fourteenth-round-fixes.json)。

## 修复与证据

| Evidence：触发用例 | Finding：原因与修复 | Path：实现位置 |
| --- | --- | --- |
| `capsClusters_Tahoma_unicase_*`、`capsClusters_Calibri_unicase_*` | unicase 的合成需要处理数字及标点等同类分段；字体缺少 unicase 但支持 small-caps 时，先对相应分段转小写，再应用 `smcp`，而不是统一缩小大写 | [skia_backend.cpp](../src/skia_backend.cpp) 的 `synthetic_caps_runs`；[webgl_native.rs](../src/webgl_native.rs) 的 `canvas_lowercase` |
| `capsFallback_*`、`capsScript_*`、`capsMixedScript_*` | 主字体支持某特性并不表示回退字体或所有文字脚本都支持。按实际字体与 GSUB 脚本查询 OpenType 支持，在 bidi 分段内进行字体、脚本和大小写分段 | `has_font_feature`、`needs_caps_layout`、`font_runs_blob` |
| `negativeSpacing_Tahoma_small-caps_*` | 合成字体路径没有把负总宽度计入左边界。与普通字体路径统一处理负宽度 | `font_runs_blob` 的边界合并 |
| `spacingBoundary_*`、`spacingUnitsMeasure_*`、`relativeFontUnit_*` | 序列化缺少科学记数法及浮点上限处理，未支持 `cap`、`ic`。按六位有效数字和舍入后的指数格式化，保存有限 float 值；`cap` 使用字体大写高度，验证 `ic`、`ex`、`ch` | [canvas_css.rs](../src/canvas_css.rs) 的 `spacing`、`serialized_spacing`；`sync_native_text`、`skia_canvas_spacing_unit` |
| `spacingSaturation_*` | 极端字距、词距及单字形 advance 需要有符号 16.16 饱和运算；总宽度还受逐字形 float 累加顺序影响 | `skia_canvas_set_text_options`、`PositionedRunHandler::spacing` |
| `imageBoundary_*_clipSource`、`imageClipping_*` | 依赖底层隐式裁剪会产生不同的目标矩形与采样坐标。先显式裁剪源矩形，再映射目标矩形 | `skia_canvas_draw_rgba_image` |
| `imageBoundary_*_shadow`、`shadowBoundary_*` | 半透明图像阴影需要作用于实际渲染的透明度。改为设备坐标中的离屏图层和 DropShadow 滤镜；包含变换、裁剪、globalAlpha、无模糊和 copy 模式验证 | `skia_canvas_draw_rgba_image` |
| `shadowBoundary_opaqueSource_*`、`imageSourceAlpha_*` | 所有像素 alpha=255 不等于源对象没有透明通道。通过内部状态传递 OffscreenCanvas 的 `alpha:false`，避免通过扫描像素推断；转出的 ImageBitmap 按 Chrome 实测使用带透明通道的路径 | [index.js](../index.js) 的 `contextInternals`、`imageSourceState`；Rust/C++ 图像绘制参数 |

测试入口为 [fourth-round-cases.js](../tests/fourth-round-cases.js) 的 `runFourteenthRoundCases`，已接入 [test.js](../test.js)。独立比较器为 [compare-fourteenth-round.cjs](../tests/compare-fourteenth-round.cjs)，校验浏览器模式、测试脚本哈希、用例集合及精确结果。

## 依据与验收

字体变体回退参考 Chromium 对应版本的 [OpenTypeCapsSupport](https://github.com/chromium/chromium/blob/153.0.8010.48/third_party/blink/renderer/platform/fonts/opentype/open_type_caps_support.cc)，特别是 `FontFeatureToUse`、`NeedsSyntheticFont`、`NeedsCaseChange` 与 `DetermineFontSupport`。阴影模式参考本地 Chromium `canvas_rendering_context_2d_state.cc` 的 `GetFlags`、`ShadowAndForegroundImageFilter`；间距处理参考 `ShapeResultSpacing`。

| 验收项目 | 结果 |
| --- | --- |
| 本轮比较 | tested=180，matched=180，differing=0 |
| 完整回归 | totalCases=974，browserVerified=true，各轮失败列表为空 |
| 原始 demo | 9216 个 RGBA 值，0 差异；文件哈希未变 |
| 生命周期 | gradientGC=true，patternGC=true |
| 构建与补丁 | release 构建成功，保留原有 11 条编译警告；`git diff --check` 通过 |

最终本轮采集 runId：`d7ed626e1a9b466a97a0558a271174ce`；demo runId：`2cf950cfd87b4286a640094ace6d27ff`。

整个浏览器验证过程使用用户已有 Chrome、端口 **9222**，复用连接 **3f3dfe73-4928-4759-ad39-cd214de31a22**。没有操作鼠标、键盘、剪贴板，没有重启浏览器或持久 CDP 服务。新增用例使用既有测试入口，未放宽调试服务的脚本限制。用户统一授权后没有再提出范围内的确认问题。

demo SHA-256：`FEA443544EEFDB59C29593EAEC43BBA59CECADCF104A69B99B189B6206F9300E`。源码、编译产物、测试脚本、公开参考源码的哈希与逐项结果均存入 JSON 证据文件。此前各轮报告保留不变。

## 复现

在项目目录且现有 Chrome 持久调试连接可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-fourteenth-round.cjs
```

预期均退出 0，主回归报告 974 项通过，本轮比较器报告 180 项一致、0 差异。

“无剩余差异”指本次新增场景及全部既有回归。当前 Windows、已安装字体、Graphite/Dawn 后端与 Chrome 版本构成验证环境；本报告不将有限测试结果表述为所有 Canvas 标准场景都没有问题。
