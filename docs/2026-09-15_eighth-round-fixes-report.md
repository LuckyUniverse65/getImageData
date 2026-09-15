# OffscreenCanvas 第八轮修复与验收

2026-09-15，修复第八轮原有 29 个失败用例，并补充 26 项相关边界检查。第八轮 **72 / 72 项**与用户现有 Chrome 一致，完整回归 **433 / 433 项**通过，demo 的 **9216 个 RGBA 值零差异**，渐变 GC 检查通过。原生模块已重新构建。

[eighth-round-fixes.json](eighth-round-fixes.json) 保存本地与 Chrome 的完整逐项值、最终采集元数据、源文件和二进制 SHA-256。[修复前检测报告](2026-09-15_eighth-round-review-report.md)和对应 JSON 保留原始 46 项中 29 项差异的历史证据。失败用例数不等于独立缺陷数。

## 修复内容

| 问题与触发方式 | 修复后的行为 | 实现 |
| --- | --- | --- |
| 从原型取出 Canvas getter、setter 或方法，对普通对象调用 | 先验证实例身份再转换参数；拒绝伪对象、Proxy 和 ImageBitmap，正常子类可用；Blob 方法通过 Promise 拒绝 | `index.js` 使用独立 WeakSet，在入口校验接收对象 |
| 字体名含转义引号、十六进制转义、空格或保留字 | 保留转义 token 边界，正确解码和序列化；单独的未加引号保留字赋值被忽略，多词名称可以包含这些词 | `src/canvas_css.rs` 的分词、标识符解析与字体族序列化 |
| `bold small-caps` 和 `italic bold small-caps` 的字体字符串 | 按 style → weight → variant 输出；区分 CSS-wide 关键字与通用字体族的大小写序列化规则 | `canvas_css::font`、`serialize_family` |
| RGB/HSL 函数前后含注释，或现代颜色包含 `none` | 注释预处理后识别颜色函数，完整 `none` 通道按零处理；`none%`、`nonedeg` 和旧式逗号语法中的 `none` 仍拒绝 | `parse_color`、`function_color`、`alpha` |
| 合成小型大写中，组合重音位于字符串开头 | 开头组合标记跟随后续字符选择字号；仅包含组合标记时保留原字号 | `synthetic_caps_runs` |
| Tahoma 合成斜体的字形边界和像素不同 | 去除 DirectWrite 模拟倾斜，以 SkFont 的 -0.25 倾斜绘制和测量；前景与阴影保留同一设置 | `resolve_font` 与文本绘制配置 |
| 缩放后文字基线落在小数像素，字形偏模糊 | 启用 SkFont 基线对齐，由 Skia 按变换处理；普通、缩放、旋转、反射和斜切对照全部一致 | `SkFont::setBaselineSnap` |

补充的 26 项包含斜体派生度量、字体转义和关键字扫描、颜色通道和注释 alpha、开头组合标记扫描、填充/描边的变换与阴影对照、不同字体缩放、四种基线变换，以及接收对象和 Promise 时序检查。像素用例比较整个 80×40 画布的 12800 个 RGBA 值，未放宽容差。

## 验收证据

浏览器为用户手动启动的 Chrome `153.0.8010.37`，端口 `9222`。全过程复用持久连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，没有重启浏览器或调试服务，没有使用鼠标、键盘或剪贴板。

| 检查 | 结果 |
| --- | --- |
| 原生 Release 构建 | 成功，`webgl.node` 已更新；仍有此前的 11 条未使用代码等警告 |
| 既有回归 | 361 项通过 |
| 第八轮回归 | 72 项全部一致，独立比较器退出 0 |
| 完整主回归 | 433 项，`browserVerified:true`，全部差异列表为空 |
| demo / 渐变 GC | 9216 个值零差异 / 通过 |
| 第四至第八轮采集 | runId `ad3a1ee8efd04467891aaf4e07d7de04` |
| demo 采集 | runId `e8036814272a461d8792ccab29d2a0d7` |

`demo.js` 未修改，其 SHA-256 与第七轮验收一致：`FEA443544EEFDB59C29593EAEC43BBA59CECADCF104A69B99B189B6206F9300E`。`test.js` 已纳入第八轮独立子进程结果、异常顺序断言、完整用例集合与浏览器返回值比较。

## 复现

在项目根目录、现有 Chrome 与持久 CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-eighth-round.cjs
```

两条命令应退出 0，分别报告 433 项主回归通过和第八轮 `tested:72, matched:72, differing:0`。浏览器结果校验当前测试源码 SHA-256，不能使用修改脚本之前的快照冒充新结果。

结论限定于本机字体、当前 Chrome 和覆盖用例。尚未执行完整 Canvas 标准测试集，也不代表所有字体、Unicode 脚本和 CSS 语法都已实现；项目其余支持范围见 README。
