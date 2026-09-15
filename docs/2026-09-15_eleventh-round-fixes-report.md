# OffscreenCanvas 第十一轮修复验收

2026-09-15，第十一轮原有 **25 个失败用例全部修复**。原有 34 项加上新增 20 项边界测试，**54 项全部与 Chrome 一致**，并已纳入主回归。完整 **632 项通过**，demo 的 **9216 个 RGBA 值零差异**，渐变和图案 GC 检查通过。

## 修复与证据

| 原问题与用例 | 修复后的行为 | 实现位置 |
| --- | --- | --- |
| `patternIdentity_*`、`patternCrossContextIdentity`、`patternInvalidAssignment_*`：图案样式 getter 返回字符串 | getter 返回原图案对象；save/restore、跨上下文赋值和无效颜色赋值后保持身份 | [webgl_native.rs](../src/webgl_native.rs)：`PatternStyle` 持有 Node-API 引用，`Style::Pattern` 共享图案数据，`style_value` 返回引用对象 |
| `patternSetTransformAPI`、`patternTransform_*`、冻结图案和 save 后变换用例 | 提供 CanvasPattern 原型和 `setTransform`；先校验接收对象，再按字典顺序转换矩阵参数与别名；转换成功后更新共享矩阵。冻结对象仍可更新内部状态，多个上下文及保存的状态均看到更新 | [index.js](../index.js)：`CanvasPattern`、`patternTransforms`；[webgl_native.rs](../src/webgl_native.rs)：`pattern_set_transform` |
| `patternSmoothing_true` 及缩放矩阵的透明边缘 | 图案 shader 使用局部矩阵，并按当前 `imageSmoothingEnabled` 选择采样方式；上传纹理前转换为预乘透明度像素，避免透明边缘再次乘 alpha 而变暗 | [skia_backend.cpp](../src/skia_backend.cpp)：`skia_canvas_set_pattern` |
| 奇异、NaN、Infinity 和超大有限矩阵参数 | 矩阵转换和绘制与当前 Chrome 实测一致；double 到 float 限幅，不可逆矩阵使用透明 shader | 同上；新增矩阵边界与原始非有限值用例逐通道验证 |
| `sourceReadbackOverride_*`、`sourceResizeOverride`、`sourceTransferClearOverride` | 内部读图、编码、调整尺寸和转移清理使用创建上下文时保存的原生入口，不再查找公开方法属性 | [index.js](../index.js)：`contextInternals`、`#readPixels`、`#resize`、`transferToImageBitmap` |
| `fallbackFamilyList_Microsoft YaHei_*`、`fallbackFamilyList_SimSun_*` | 缺少字形时先按完整 CSS 字体列表查找已安装且包含该字形的候选，再进入系统回退；宽度、边界和像素均一致 | [skia_backend.cpp](../src/skia_backend.cpp)：将 family 列表传入 `font_runs_blob` 和 `fallback_runs` |
| 图案状态改为共享引用后的对象生命周期 | 保存状态或另一个上下文仍使用图案时，GC 后对象与矩阵保持有效；两个上下文 reset 后，对象能够回收 | [pattern-gc.cjs](../tests/pattern-gc.cjs)：强制 GC、共享身份、实际绘制和 WeakRef 释放检查 |

25 是修复前失败用例数，不是独立缺陷数。修复过程中发现的透明边缘插值问题也已处理，未使用像素容差放宽来消除差异。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 第十一轮原始用例 | 34/34 一致，其中原有 25 项差异全部消除 |
| 新增边界 | 20/20 一致 |
| 完整主回归 | 632 项通过，`browserVerified:true`，各轮失败列表为空 |
| demo | 9216 个 RGBA 通道值，差异 0；demo 源码哈希未变 |
| 渐变 GC | 通过 |
| 图案 GC | `retainedWhileUsed:true`、`releasedAfterReset:true` |
| 构建与语法 | release 编译、JavaScript 语法和 diff 格式检查通过；编译器仍报告已有未使用代码等警告 |

新增 20 项包括矩阵 null/undefined/原始值/NaN/Infinity/超大值 7 项，属性读取与转换顺序 1 项，非法接收对象 1 项，转换抛错和重入 2 项，默认矩阵重置 1 项，跨上下文共享变换 1 项，半透明图案的两种采样 2 项，运行时切换平滑 1 项，描边图案变换 1 项，跳过缺失字体并选取后续候选 2 项，以及内部方法 getter 隔离 1 项。GC 检查不计入 632 个浏览器对照用例。

## 采集与复现

[eleventh-round-fixes.json](eleventh-round-fixes.json) 保存完整第十一轮本地/浏览器结果、25 项原始失败的修复映射、新增用例列表、主回归结果、GC 结果、采集元数据及文件和字体 SHA-256。历史失败证据保留在 [eleventh-round-review.json](eleventh-round-review.json)。

最终主回归及第十一轮 runId 为 `3f12e00869524914a485b205a453962a`，demo runId 为 `70b3b51e21034b64872c1927dcd38fb2`。浏览器验证始终复用用户手动启动的 Chrome `153.0.8010.37`、端口 `9222`、连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，在后台测试页执行，没有操作鼠标、键盘或剪贴板，没有重启浏览器或调试服务。

在项目根目录、现有 Chrome 与持久 CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-eleventh-round.cjs
```

三条命令均应退出 0。主回归自动执行图案 GC，并采集当前第十一轮脚本；比较器预期 `tested:54, matched:54, differing:0`。对照检查源码哈希与完整用例集合，比较完整像素数组。

验收针对当前 Windows、Chrome 和字体环境。系统中文回退仍使用现有简体中文候选顺序，未扩展按页面语言选择日文、韩文或繁体中文回退；本轮修正的是显式字体列表优先级。未执行完整 Canvas 标准测试集。
