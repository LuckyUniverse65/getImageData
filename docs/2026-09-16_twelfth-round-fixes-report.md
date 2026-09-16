# OffscreenCanvas 第十二轮修复进展

第十二轮原有 35 项已全部与已采集的 Chrome 结果一致，其中原先 17 个失败用例的差异已消除。当前修复仍待最终实时浏览器验收：扩展至 61 项后，60 项有浏览器参考结果，其中 58 项一致、2 项存在空格排版差异；最后新增的 1 项缓存顺序检查尚未采集。**本报告不表示全部兼容性问题已解决。**

2026-09-16，本地测试执行 693 项且本地断言通过，渐变、图案 GC 检查通过。当前二进制与此前保存的 Chrome 数据重新比较，原有 632 项一致，demo 的 9216 个 RGBA 通道值零差异。这些是缓存参考复核，不是本次重新连接 Chrome 的实时验收。主报告保持 `browserVerified:false`。

## 已实现

| 修复 | 行为及证据 |
| --- | --- |
| letterSpacing、wordSpacing、fontKerning | 原生属性参与默认值、无效赋值、字符串转换、重入、save/restore、reset 和 resize；测量、字形位置和边界使用同一组文字选项。原有状态及绘制差异全部消除。 |
| CSS 字距长度 | 保留单位序列化，按当前字体解析 em/rem/ex/ch，处理绝对长度和 OffscreenCanvas 无视口时的相关单位；按 Chrome 实测拒绝两端空白和无单位零；间距使用 16.16 精度。扩展语法、单位和字体变化用例一致。 |
| 双向文字 | 使用 Unicode bidi 分段及视觉重排，避免将希伯来文的字形替换回原逻辑顺序。原有四项测量和像素、补充的方向与 maxWidth 描边用例一致。 |
| 斜体回退字体 | 匹配回退字体时保留请求的倾斜样式；分别处理合成斜体、实际斜体及带内嵌位图的字体，避免继承基础字体的多余倾斜。六个原有组合及三个阴影描边组合一致。 |
| imageSmoothingQuality | 补齐 low/medium/high 的属性状态、无效赋值、保存恢复和重置。原有棋盘采样对照一致；本轮没有宣称实现或验证全部质量档位的采样算法差异。 |
| CanvasPattern 原型 | setTransform 可枚举；Symbol.toStringTag 为不可写、不可枚举、可配置的 CanvasPattern 数据属性。 |

实现位于 [index.js](../index.js)、[webgl_native.rs](../src/webgl_native.rs)、[canvas_css.rs](../src/canvas_css.rs) 和 [skia_backend.cpp](../src/skia_backend.cpp)。已重新编译 webgl.node。未修改 demo.js，未放宽任何像素比较容差。

## 尚待核实

`spacingMetricsBeforeAfterDraw` 和 `spacingClusters_spaces` 使用 17px Arial、letterSpacing=1.5px、wordSpacing=2px，对文本 ` A  B ` 测量时，本地宽度为 58.5703125，Chrome 为 50.5703125，并有对应位置和像素差异。

另一个已采集用例 `spacingCombinedOrder` 在相同属性下，先测量 `A B` 再测量这段文本，Chrome 返回 58.5703125。现有证据说明结果依赖调用顺序，但尚不足以证明完整缓存规则或将其定性为 Chrome 缺陷。保留严格失败结果，没有加入特定文本判断或仿造尚未确认的缓存行为。

新增 `spacingCacheOrder` 将在独立上下文中比较先测首空格、尾空格和普通词间空格，再改变和恢复词距的结果；该项因浏览器连接中断尚未采集。它仍保留在主测试中，最终验收需要包含它。

## 浏览器与复现

已成功的采集来自用户手动打开的 Chrome 153.0.8010.37、9222 端口、连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`。最新 60 项参考 runId 为 `40b495615bd546998ae90045520dca41`，脚本 SHA-256 为 `90958FDDEFAB660D7465C62290B36BD6FC771A8DCE6C2F8F68045868537EB84A`。

后续采集报 `Cannot connect to the existing Chrome CDP socket`。只读状态检查显示当前服务 PID 2820、连接 `c2b3b68b-5d8a-45d3-9f61-bea5fd5f2708`、状态 failed；它不是此前成功连接。验证入口在原服务不可用时自动创建了服务，但未成功连接浏览器。没有操作鼠标、键盘或剪贴板，也没有启动或重启 Chrome。未停止或重启这个失败服务。

项目 cdp-session.cjs 对 failed/disconnected 状态禁止自动重连，因此恢复浏览器后还需恢复可用的持久会话。恢复连接前无法完成最后一项采集、空格差异修复和全部实时验收。

```powershell
node test.js --local
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action SessionStatus
```

连接恢复后执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-twelfth-round.cjs
```

主测试已接入第十二轮，比较完整结果和用例集合。当前 61 项脚本与旧 60 项参考的哈希不同，独立比较器会拒绝将旧参考当作新采集；这是预期保护，不能跳过。

[twelfth-round-fixes-progress.json](twelfth-round-fixes-progress.json) 保存当前实现哈希、本地执行结果、缓存参考复核、剩余差异及未采集用例。旧检测报告与证据保持不变。
