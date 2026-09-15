# OffscreenCanvas 第九轮修复与验收

2026-09-15，第九轮原有 **23 个失败用例已全部修复**。补充 15 项相关边界后，第九轮 **70 / 70 项**与用户现有 Chrome 一致，完整 **503 项**回归通过，demo 的 **9216 个 RGBA 值零差异**，渐变 GC 检查通过。原生模块已重新构建，`demo.js` 未修改。

[ninth-round-fixes.json](ninth-round-fixes.json) 保存最终本地/Chrome 的完整逐项结果、采集信息、回归结果、源码/二进制/字体哈希以及参考源码位置。[检测报告](2026-09-15_ninth-round-review-report.md)及对应 JSON 保留修复前 55 项中 23 项差异的历史证据。

## 修复内容与证据

| 触发问题 | 修复后行为 | 实现路径 |
| --- | --- | --- |
| 普通对象或 Proxy 调用 ImageBitmap getter/close；通过位图 constructor 直接 new | 统一抛 TypeError；内部位图创建、重复 close 和已有快照生命周期保持正确 | [index.js](../index.js) 使用独立实例集合与内部创建令牌 |
| CRLF/FF 续行、十六进制转义终止符、未转义 FF | CSS 输入先规范换行；转义续行正确解析，字符串内裸换行被拒绝 | [canvas_css.rs](../src/canvas_css.rs) 的 `preprocess`、`family_string` |
| 转义引号之后带注释和 Arial 回退字体 | 正确返回 `12px "A\"B", Arial`，度量为 12px Arial 的 `33.57421875` | CSS 注释扫描保护未加引号的转义；C++ 字体列表解析也处理转义引号 |
| `serif Arial`、`bolder`、`lighter` | 通用字体族开头的非法多词名称被拒绝；相对字重解析为 bold/100 并用于绘制 | `canvas_css::font` 与 `font_spec` |
| `oblique 10deg` 等合法斜体角度 | 内部保存请求角度，getter 按 Chrome 序列化；验证了 -90～90 度边界、非法 ±91、turn/grad/rad、默认角度及 save/restore | `serialized_font`、[webgl_native.rs](../src/webgl_native.rs) 的 `font_spec`、[skia_backend.cpp](../src/skia_backend.cpp) 的 `resolve_font` |
| 旧式 HSLA 百分比透明度的 getter | `hsla(0,100%,50%,50%)` 的 getter alpha 为 0.5，实际像素 alpha 为 127；numeric `.5` 对照像素 alpha 为 128 | alpha 序列化提取支持逗号语法；绘制区分数值和百分比路径的精度 |
| HSL 灰色 getter 正确但像素偏 1 | `hsl(120 0% 50%)` getter 为 `#808080`，实际像素为 `[127,127,127,255]`；灰度扫描及彩色/alpha 对照均一致 | HSL 归一化浮点分量经 Node-API/C++ 传至 SkPaint，不在绘制入口重新量化成字节；序列化仍保留独立结果 |
| Tahoma 缺少 U+093E、U+1D185 的字形 | 通过系统字体选择回退；U+1D185 单独测量为 `[0,5,5,13,-8]`，普通和合成字体的像素均一致 | `fallback_runs`、`font_runs_blob` 在测量、字形边界及绘制之间共享字体和位置 |
| 组合标记紧跟字母，或位于字符串开头；原生 small-caps 混入缺失字形 | 组合标记保持与基字符相同的字体 run；完整 Unicode 标记分类覆盖补充平面；开头 BMP 非间距重音与其他开头标记分开选择字号；回退保留原生 smcp 特性 | HarfBuzz Unicode 分类、`synthetic_caps_runs` 与 `font_runs_blob` |

斜体行为按本机 Windows Chrome 对照实现：0～14 度之间优先真实 italic 字体，默认 14 度允许合成倾斜；其他已测角度选择普通字形。此处的字体匹配与公开字符串并非简单的一一映射，不能只根据 getter 判断实际使用的字形。

新增 15 项包括 Arial/Tahoma 的角度扫描和 ±10 度实际绘图（6 项），系统字体度量对照、HSL 灰度扫描（2 项），HSL 彩色及状态恢复、斜体状态恢复与角度单位、回退字形的填充/描边阴影、原生 small-caps 与回退混用（7 项）。所有像素比较均使用完整数组且不放宽容差。

## 参考实现

排查颜色精度时核对了对应 Chrome 版本的 [Color::toSkColor4f 与序列化](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/platform/graphics/color.cc)、[HSLToSRGB](https://github.com/chromium/chromium/blob/153.0.8010.37/ui/gfx/color_conversions.cc)和 [CSS 颜色快速解析](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/core/css/parser/css_parser_fast_paths.cc)。参考文件的 URL 与本地读取副本哈希记录在 JSON 中；最终结论以现有 Chrome 实测结果为准。

## 验收

浏览器为用户手动启动的 Chrome `153.0.8010.37`，端口 `9222`。所有浏览器检查复用连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，没有重启浏览器或调试服务，没有使用鼠标、键盘或剪贴板。

| 检查 | 结果 |
| --- | --- |
| Release 原生构建 | 成功，更新 `webgl.node`；仍有此前的 11 条未使用代码等警告 |
| 原有回归 | 433 项全部通过 |
| 第九轮比较器 | 70 项一致，0 项差异，子进程及比较器均退出 0 |
| 主回归 | 503 项通过，`browserVerified:true`，各组失败列表为空 |
| demo / 渐变 GC | 9216 个 RGBA 值零差异 / 通过 |
| 第四至第九轮采集 | runId `ae940c2d760e458eaff43d4bf252db78` |
| demo 采集 | runId `c68a684fc8ee4f638628392757b9862b` |

`demo.js` SHA-256 仍为 `FEA443544EEFDB59C29593EAEC43BBA59CECADCF104A69B99B189B6206F9300E`。`test.js` 已纳入第九轮结果、重要本地断言、完整用例集合与浏览器值比较。

## 复现与范围

在项目根目录、现有 Chrome 和持久 CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-ninth-round.cjs
```

两条命令应退出 0，分别报告 503 项主回归通过及 `tested:70, matched:70, differing:0`。采集验证测试源码 SHA-256，防止误用旧脚本快照。

覆盖范围限定于本机字体、Windows 字体匹配和本轮测试的 CSS/Unicode 组合；系统字体、Chrome 或显卡变化仍可能影响像素。当前字形回退按字符和组合标记分组，未宣称实现全部语言的复杂文字整形、所有 CSS 颜色语法或完整 Canvas 标准。
