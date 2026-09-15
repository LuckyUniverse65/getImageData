# OffscreenCanvas 第七轮：合成小型大写

2026-09-15，补齐上一轮留下的无 OpenType `smcp` 字体合成支持。新增 **35 项全部与用户现有 Chrome 一致**，已纳入 **361 项主回归**；demo 的 9216 个 RGBA 值零差异，渐变 GC 检查通过。`demo.js` 未修改，原生模块已重新构建。

最终逐项结果、六次浏览器采集元数据、源码/二进制/测试字体哈希见 [seventh-round-fixes.json](seventh-round-fixes.json)。此前仅支持字体原生 `smcp` 的实现范围保留在[第六轮历史报告](2026-09-15_sixth-round-fixes-report.md)。

## 证据、修复与实现路径

| 证据 | 修复后的行为 | 实现路径 |
| --- | --- | --- |
| Windows 的 `cour.ttf`、`tahoma.ttf`、`consola.ttf` 的 GSUB 特性表均没有 `smcp` | 对实际选中的字体检查特性表，缺少时进入合成路径；原有 Arial 原生字形路径继续通过回归 | [src/skia_backend.cpp](../src/skia_backend.cpp) 的 `has_small_caps`，检查读取边界 |
| `small-caps 16px Tahoma` 下 `abc` 宽度为 `19.73876953125`；Courier New 为 `21`；Consolas 为 `18.1435546875` | 转换小写字母，并把合成字号设为原字号的 70% 后四舍五入到整数；原有大写字母、数字和空格使用原字号 | `synthetic_caps_runs` 和 `synthetic_caps_blob` 共用布局 |
| `éß`、`aÉ`、`Éa`、`a`/`A` 加组合重音的测量 | 完整 Unicode 大写映射允许 `ß → SS`；组合重音跟随基字符，预组合带重音字母保留自己的大小写分类 | [src/webgl_native.rs](../src/webgl_native.rs) 的 `canvas_uppercase` 与 C++ 字符分组 |
| 三种字体的填充和描边逐像素比较，以及 `maxWidth`、变换、阴影和 `copy` 场景 | 混合字号字形组成同一个文本绘制对象，保持现有裁剪、合成及阴影处理 | `synthetic_caps_blob` 接入测量、字形边界及绘制入口 |
| Courier New 普通文字的字号扫描与合成文字的字体盒 | 普通字体使用轮廓及线性宽度；合成派生字体保留 Chrome 对应的内嵌位图和非线性度量设置 | 字体选择、测量和合成派生配置 |
| 0、0.5、1、2、3、4、5、6、15、25 px 扫描 | 极小字号及整数舍入边界与 Chrome 一致，零字号返回零宽度 | `syntheticTinySizes` |

`canvas_uppercase` 是内部 Rust/C++ 接口：调用方提供三个 Unicode 标量的缓冲区，覆盖 Rust Unicode 大写展开的最大长度。GSUB 检测目前检查字体级特性表，不代表完成所有语言脚本的特性可用性分析。

## 验收

浏览器为用户手动启动的 Chrome `153.0.8010.37`，端口 `9222`。持久连接 ID 为 `f823af05-4dbf-4e1f-b5f5-31251732a225`；没有重启浏览器、调试服务或使用鼠标键盘。

| 项目 | 最终结果 |
| --- | --- |
| 原生 Release 构建 | 成功，更新 `webgl.node`；仍有原先的未使用代码等编译警告 |
| 原有回归 | 326 项全部通过 |
| 新增回归 | 35 / 35 一致，比较器退出码 0 |
| 完整回归 | 361 / 361，`browserVerified:true` |
| demo / GC | 9216 个 RGBA 值零差异；GC 通过 |
| 第四至第七轮采集 | runId `1c148f0a2edf4cacbce5f76f9cd60d2b` |
| demo 采集 | runId `59a26124068943a6bcb7fe5aef51544e` |

新增 35 项包括每种字体的 3 项字号测量、2 项填充/描边、1 项普通字号对照、4 项绘图状态、1 项 save/restore，共 33 项；另有小字号扫描和字体列表回退 2 项。每项字号测量包含多个字符串样本；计数按顶层用例计算。

## 复现

在项目根目录、用户 Chrome 和持久 CDP 会话可用时运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-seventh-round.cjs
```

两条命令应退出 0，分别报告 361 项完整回归和 35 项第七轮比较。第七轮用例共用已允许的 `tests/fourth-round-cases.js` 采集入口，返回独立 `seventhRound` 字段，本地在子进程运行。需要重建时运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
```

本轮验证了上述三种字体和已列场景；所有脚本、语言相关大小写规则、字体回退和 OpenType 特性的全面兼容仍需进一步覆盖。完整 CSS 语法、双向文字塑形、JPEG/WebP 编码等已有范围限制不因本轮通过而改变。
