# OffscreenCanvas 第十八轮持续检查与修复

2026-09-17：本轮新增 **2,792 项全部通过**，完整回归 **4,434 项**与现有 Chrome **153.0.8010.48** 实时一致。demo 的 **9,216 个 RGBA 值零差异**，Worker 并发、渐变和图案 GC 检查通过。最后连续两批各 **128 个全新用例**没有新发现，之后再次完整回归通过。

结论是：**已在下述范围内充分持续检查，当前没有剩余已发现问题**。这不等于证明完整 Canvas 标准、所有输入、字体和硬件环境均无缺陷。

## 检查方式与停止条件

检查沿 `demo.js → index.js → Rust Node-API → C++ → Skia Graphite / Dawn D3D11` 追踪实现。除了重跑旧回归，还逐批加入参数边界、状态组合、确定性随机序列、失败序列逐步重放和 Worker 生命周期检查；参照对应 Chrome 版本的 Blink、cc 和 Skia 源码定位原因。

像素按 RGBA 分量逐值比较，接口结果按深度严格相等比较，没有增加容差或删除失败用例。数值结果中的负零显式编码，避免 JSON 抹掉符号导致假差异。失败序列的前缀重放也保留在回归中，因此失败用例数不能当作独立缺陷数。

最初 378 项中有 128 项失败。之后扩展检查仍多次发现遗漏，均继续修复，未把某次已知用例通过作为结束依据。最后阶段如下：

| 阶段 | 累计本轮用例 | 新检查内容 | 结果 |
| --- | ---: | --- | --- |
| 最后一次修复后 | 2,536 | 修复恢复相同非单位矩阵时的路径快捷表示失效；完整回归 4,178 项 | 全部通过 |
| M | 2,664 | 新增 64 条 50 步随机序列、64 项矩阵恢复与路径组合 | 新增 128 项无新发现 |
| N | 2,792 | 新增 128 条 50 步随机序列 | 新增 128 项无新发现 |
| 最终完整回归 | 4,434 | 全部历史与本轮用例、demo、Worker、GC | 全部通过 |

随机序列使用固定种子，组合路径、填充、描边、渐变、图像、阴影、裁剪、变换、透明度和保存/恢复，失败可重复。M 的种子为 11001–11064，N 为 12001–12128。

## 主要修复与证据链

| 触发场景 / 回归证据 | 原因与修复 | 实现位置 |
| --- | --- | --- |
| `matrixPath`、`singularLifecycle`、`nearSingular` 类用例 | 修正奇异矩阵下点与路径的处理，以及离开奇异状态后的坐标空间；双精度逆矩阵补足极小可逆矩阵 | `src/skia_backend.cpp`：路径准备、矩阵变换 |
| `matrixPrecision`、`coordinateSaturation`、半径与矩形边界用例 | 对照 Blink 区分浮点截断、有限值饱和、非有限坐标忽略，以及极小负半径和异常顺序 | `index.js`、`src/webgl_native.rs` |
| 曲线裁剪、透明颜色与渐变组合 | 圆弧实体化使用一致的分段路径；颜色与 globalAlpha 的乘积保留浮点精度 | `src/skia_backend.cpp`：圆弧、`make_paint` |
| `sequenceD`、`sweepE_rebase`、`sweepM_restore` | 路径在变换时逐步舍入；恢复状态分别应用原矩阵及目标逆矩阵；即使矩阵相同，非单位矩阵仍使圆弧/直线快捷表示失效 | `rebase_logical_path`、变换方法与 Rust FFI |
| 圆弧、文字与矩形在旋转、裁剪后的 `copy` | 恢复不透明 alpha 时采用对应绘制边界，并保留闭合圆弧的边界；文字补充实际字形边界 | `draw_with_shadow`、`draw_path`、文字方法 |
| `gradientShadowProbe`、`sweepH_lifetime` | 初始化清屏与绘制混在同一批命令中，改变 MSAA 附件及渐变抖动原点；拆开初始化提交，尺寸重置不再重复清屏 | `skia_canvas_create`、Rust `_resize` |
| 图像阴影后继续绘制渐变 | 图像阴影图层缺少源绘制边界；按 Chrome 的设备空间边界创建图层 | `draw_with_filtered_shadow` |
| `sweepE_pixel`、`sweepF_source`、`sweepG_opaque` | 不透明画布读写像素和作为图像源时错误执行 alpha 转换；补齐图案、位图和自绘制的元数据传递 | `index.js`、Rust Pattern、C++ 读写与图像方法 |
| 不透明画布转出的 ImageBitmap 带阴影绘制 | 位图像素存储标记与图像源阴影分类不能混用；分别传递这两个属性 | `drawImage` 包装、`skia_canvas_draw_rgba_image` |
| `prefixH_6024`、`sweepI_zeroShadow` | 不能仅因 globalAlpha 为零而省略阴影，滤镜图层在复杂抗锯齿裁剪边缘仍有可观察效果 | `draw_with_shadow` |
| `prefixJ_8061`、`imageClipProbe`、`sweepK_dirty` | 缺少 Chrome 的绘制范围与裁剪相交判断，本应跳过的滤镜产生极淡边缘；补上包含 shadowBlur 的范围判断 | `intersects_dirty_clip` |
| 像素读取与写入的整数边界 | 防止坐标与尺寸相加发生有符号溢出，并匹配 getImageData 的 RangeError | Rust `getImageData`、C++ 像素读写 |
| `tests/worker-concurrency.test.cjs` | 多 Worker 并发访问进程共享 GPU 状态曾导致进程访问冲突；对原生入口及终结器加递归互斥锁 | `canvas_gpu_mutex`、原生入口 |

Worker 检查包含三轮创建/销毁，每轮三个 Worker，每个 Worker 创建 30 个画布，使用不同颜色检查相互隔离，并执行位图转移、关闭、reset 和渐变绘制。修复前出现进程退出码 `3221225477`，修复后通过。代价是多个 Worker 的原生 GPU 调用会串行执行。

本轮修复已编译到 `webgl.node`；`demo.js` 无需修改。测试接入 `test.js`，新增用例较多，子进程输出缓冲区从 16 MiB 调整为 64 MiB。构建通过，仍有原有 11 条 Rust 编译警告。

## 复现与核验

在项目目录、现有 Chrome CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
node test.js
node tests/compare-eighteenth-round.cjs
node --test tests/worker-concurrency.test.cjs
```

主回归预期：`totalCases=4434`、`eighteenthRoundCases=2792`、`browserVerified=true`、全部 `*Failures=[]`、`demoMismatches=0`，且 `workerConcurrency`、`gradientGC`、`patternGC` 为 true。独立比较器预期 `tested=2792`、`matched=2792`、`differing=0`。

单独重新采集本轮参考：

```powershell
node capture-cdp.cjs tests/fourth-round-cases.js cdp-eighteenth-round
node tests/compare-eighteenth-round.cjs
```

最终完整回归的本轮 runId 为 `f44de3146f264e91ad9a51e6821b8c65`，demo runId 为 `3e9b473aad2d448ca10a45b2b4e00937`。全程复用既有 CDP 会话。

[最终机器证据](eighteenth-round-fixes.json) 保存完整回归结果、最后两批检查记录、源码和二进制 SHA-256、参考源码哈希及每项本地/浏览器结果哈希。[初始检查证据](eighteenth-round-review.json) 保留本轮最初失败记录。原始数组在 `out/cdp-eighteenth-round-{local,browser}.json`，最新差异文件为 `out/cdp-eighteenth-round-diff.json`。

关键依据包括 Chrome 153.0.8010.48 的 [Canvas2DRecorderContext](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/modules/canvas/canvas2d/canvas_2d_recorder_context.h)、[CanvasPath](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/modules/canvas/canvas2d/canvas_path.cc)、[CanvasImageSource](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/third_party/blink/renderer/core/html/canvas/canvas_image_source.h) 和 [PaintFilter](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.48/cc/paint/paint_filter.cc)。

## 范围限制

验证对象是项目已实现的 OffscreenCanvas / 2D 路径及当前 Windows、字体、GPU、Chrome 环境。现有功能边界仍包括有限的合成模式、PNG 导出、本地兼容位图，以及未完整实现的 Path2D、display-p3 / float16、跨线程 transferable 和 WebGL 绘制管线。这些没有被记作通过的完整标准能力。

改变浏览器、驱动、字体或实现范围后仍应重新验证；本次未执行发布或 Git 提交。
