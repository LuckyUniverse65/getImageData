# OffscreenCanvas 第二十轮持续检查与修复

本轮从已复现的原生崩溃、超大画布失效和 F16 图像复制误差继续检查，修复后反复扩展相邻边界。新增 **1291 项**测试纳入主回归，总计 **6041 项**；最后连续两批各 **128 个新用例**没有发现新的实现问题。

## 修复内容

| 问题 | 修复 |
|---|---|
| GPU 分配失败后，Rust 按 4 字节分配备用像素，F16 写入按 8 字节访问，导致进程终止 | 删除无效的备用像素存储及读写分支；像素只由真实 Skia surface 持有。原始崩溃用例永久保留在独立子进程中运行 |
| 超出 GPU 纹理尺寸的合法画布静默丢失绘制，resize 错误抛异常 | GPU 创建失败时回退到 Skia 软件 surface，并实现对应读取路径；不可用尺寸通过上下文丢失状态表达 |
| `isContextLost()` 固定返回 false，初步修复又在空操作和错误参数调用时过早置位 | 按操作的实际分配时机标记丢失；验证空矩形、空路径、读尺寸错误、save/restore、clip、命中测试和矩阵操作；同步丢失状态在 resize 后保留 |
| 上下文丢失后矩阵及保存状态仍被修改 | 失效上下文上的变换、save/restore 提前返回，保持已验证的 Chrome 行为 |
| 软件 F16 渲染截断，图像和图案上传额外丢失半精度 | 调用线程安全且幂等的 `SkGraphics::Init()`，启用 CPU 特性分派；上传使用一致的半精度舍入转换 |
| `transferToImageBitmap()` 在分配失败后仍返回位图，`convertToBlob()` 仍编码 PNG | 通过内部的真实存储可用性检查，分别返回对应的 `UnknownError`、`IndexSizeError`、`NotReadableError`；内部检查入口不暴露给包装后的上下文 |
| 图案上传失败后沿用默认黑色或之前的画笔 | 在上传前设置透明图案，失败路径不再绘制旧颜色 |
| 合法大图源一次性上传超过 GPU 上限，`drawImage()` 丢弃绘制 | 接入 `SkTiledImageUtils::DrawImageRect` 和 Graphite `ImageProvider`，按分块上传；验证边缘裁切、横竖大图、Bitmap、缩放、旋转、阴影和合成 |
| 跨位深和色域写入一次完成，HDR 裁剪和舍入顺序与 Chrome 不同 | 按 Chromium `putImageData` 顺序，先保持原色域及非预乘 alpha 转换位深，再执行目标色域和 alpha 转换 |
| 不透明上下文的色域读写错误参与预乘转换 | 写入和 GPU 读回的颜色转换使用正确的不透明源元数据；软件读取保持其对应的 Chrome 路径 |
| 软件画布转移位图后的初始化忽略保留的裁剪 | 替换存储先清零，再在保留的 clip 内初始化不透明黑色；保持矩阵、样式、保存栈和原始位图快照 |

主要修改位于 `src/skia_backend.cpp`、`src/webgl_native.rs`、`index.js`，已重新编译并更新根目录 `webgl.node`。

跨位深转换顺序直接对照 Chromium 153.0.8010.48 的 `BaseRenderingContext2D::putImageData` / `PutByteArray`：

https://github.com/chromium/chromium/blob/153.0.8010.48/third_party/blink/renderer/modules/canvas/canvas2d/base_rendering_context_2d.cc

## 测试覆盖

| 测试组 | 用例数 |
|---|---:|
| 初始复现及相邻用例，含 3 个独立进程分配用例 | 135 |
| 分配生命周期 | 30 |
| 空操作、错误和分配时机 | 54 |
| 横竖软件画布读写 | 80 |
| 丢失后的状态操作 | 48 |
| 连续图像、位图、图案和自复制 | 64 |
| 无上下文、零尺寸、失效和重置后的导出 | 48 |
| 超大图像源 | 64 |
| 分块图像合成、裁切、旋转和阴影 | 128 |
| 脏矩形、跨格式及像素生命周期 | 128 |
| 位图转移后的状态与快照 | 128 |
| GPU 色域、格式、HDR 和极低透明度边界 | 128 |
| 软件色域、格式、HDR 和极低透明度边界 | 128 |
| 重置及零尺寸恢复后的曲线、描边和渐变 | 128 |
| **新增合计** | **1291** |

所有用例均由本地和现有 Chrome CDP 会话运行同一份测试源。采集记录含 Chrome 版本、连接 ID、运行 ID 和测试文件 SHA-256；主回归校验采集哈希及用例名称集合，避免使用过期浏览器结果。

最终结果：完整 **6041 项全部通过**；新增 **1291/1291 逐值一致**，历史用例也全部一致；demo 的 **9216 个 RGBA 值零差异**，`node demo.js` 输出 `true`。Worker 并发、梯度和图案 GC 检查通过。release 构建成功，编译器仍报告原有的未使用代码等告警。

`Infinity`、`NaN` 和负零在相关测试中显式编码，避免 JSON 把无穷值变成 null、把负零变成正零而产生假差异。没有放宽已有 `1e-5` 浮点颜色比较规则；最终新增用例均逐值一致，未使用该容差。

## 停止检查依据

发现新问题后继续修复、扩展用例，而不是以原始 135 项通过为停止条件。最后两批是：

1. **128 项软件格式边界**：sRGB / P3、8 位 / F16、opaque / alpha、HDR、透明像素和次正规 alpha，以及两种输出格式和色域。没有新的实现问题；测试记录补齐了非有限值及负零标记。
2. **128 项重置后绘制**：GPU / 软件、两种色域及位深、两种透明度设置、reset / 零尺寸恢复、矩形 / 椭圆 / 贝塞尔虚线 / 渐变。没有新发现。

随后执行包含全部历史与新增用例的完整回归。证据和当前文件哈希见 [twentieth-round-fixes.json](twentieth-round-fixes.json)。历史检查报告 [twentieth-round-review](2026-09-17_twentieth-round-review-report.md) 保留原始失败证据，未用修复结果覆盖。

## 复现

```powershell
cargo build --release
Copy-Item target/release/webgl.dll webgl.node -Force
node test.js
node demo.js
```

`node test.js` 复用已建立的 Chrome CDP 会话，运行 Worker 并发、梯度/图案 GC 检查和原始 demo 对照；`node test.js --local` 仅运行本地部分。单独核对本轮全部用例：

```powershell
node capture-cdp.cjs tests/fourth-round-cases.js cdp-twentieth-review
node tests/compare-continuation.cjs
```

本地完整日志为 `out/twentieth-final-regression.txt`，主报告为 `out/cdp-verification-result.json`，浏览器采集为 `out/cdp-twentieth-review-browser.json`。

## 范围

结论限定于当前 Windows x64、Node 22.13.1、Chrome 153.0.8010.48 和默认 Graphite / Dawn D3D11 及软件回退路径。异步上下文恢复事件、其他 GPU/CPU/浏览器版本、可选 Ganesh 后端和未实现的 Canvas API 不属于本轮通过结论。软件不透明画布的读回及转移后裁剪初始化按当前 Chrome 的实测行为对齐，不推断其他浏览器也具有相同行为。

本轮达到的是已说明范围内充分持续检查、连续新增批次无新发现，并通过完整回归；不等同于对整个 Canvas 标准作无缺陷保证。
