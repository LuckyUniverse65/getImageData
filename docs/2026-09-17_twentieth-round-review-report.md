# OffscreenCanvas 第二十轮检查

本轮对当前实现新增 135 项边界检查，使用现有 Chrome 153.0.8010.48 实时对照。112 项通过，23 项存在差异，其中 1 项使独立 Node 子进程异常终止。以下问题尚未在本轮修复。

## P1：原生画布分配失败后，浮点写入可终止 Node

当前环境中，`new OffscreenCanvas(20000, 1).getContext('2d', {colorType:'float16'})` 无法建立 GPU surface，但 Rust 仍返回一个上下文，保留 `width * height * 4` 字节的备用缓冲区。

`putImageData()` 的备用路径按浮点像素每个 8 字节计算偏移。在横坐标 19999 写入一个像素时：

```text
备用缓冲区长度：80000
写入起始下标：159992
Rust panic：range start index 159992 out of range for slice of length 80000
子进程退出状态：3221226505
```

这是进程终止，无法由 JavaScript `try/catch` 捕获。复现只分配 20000×1 的画布，不涉及巨量内存。

同一备用路径的 `getImageData()` 仍固定按 4 字节复制：在首像素写入 F16 `[1,0,0,1]` 后，本地读回 `[1,0,0,0]`，Chrome 返回 `[1,0,0,1]`。

- Evidence：`allocation_putLast`、`allocation_readFirst`。
- Finding：备用缓冲区的存储格式、写入步长和读回步长不一致。
- Path：[webgl_native.rs](../src/webgl_native.rs) 的 `canvas_2d`、`putImageData`、`getImageData` 分支，重点为检查时的 780、789、1499 和 1595 行。
- 修复方向：原生分配失败必须进入明确且可用的软件后端或失败状态；所有备用像素操作统一格式和步长，避免以补大数组代替实际渲染后端。

## P1：大尺寸画布静默停止绘制，上下文状态不正确

当前硬件的原生 GPU surface 在宽度超过 16384 后创建失败。本地没有与 Chrome 相应的软件回退：

| 宽度（高度为 1） | 本地绘制红色后的像素 | Chrome | 状态差异 |
|---|---|---|---|
| 16384 | 红色 | 红色 | 无 |
| 16385、20000、32768 | 透明黑 | 红色 | 本地仍报告 `isContextLost() === false` |
| 65536 | 透明黑 | 透明黑 | 本地 `false`，Chrome `true` |

8 位和 F16 画布均可复现。此外，从 2×1 画布设置 `width=20000` 时，本地抛 `InvalidStateError`，而 Chrome 成功调整尺寸并绘制。构造与 resize 对同一分配失败的处理也不一致。

- Evidence：8 个 `wide_*` 差异及 `allocation_resizeWide`。
- Finding：构造路径接受空原生指针，绘制调用成为静默空操作；上下文丢失状态被固定为 `false`。
- Path：[skia_backend.cpp](../src/skia_backend.cpp) 的 `skia_canvas_create`（检查时 1392 行）；[webgl_native.rs](../src/webgl_native.rs) 的构造、`_resize` 和 `isContextLost`（784、1605、1620 行）。
- 修复方向：统一构造和 resize 的分配策略，提供软件回退并准确报告不可用状态。

## P2：F16 图像、位图和图案复制额外损失精度

同色域 F16 源画布写入带非整数透明度的像素后，直接 `getImageData()` 与 Chrome 一致；经过 `drawImage()`、`transferToImageBitmap()` 后绘制或 `createPattern()` 填充时，三个入口均产生额外误差。

例如源像素包含 `[−0.125, 1.23, 2.5, 0.73]`，同色域复制后蓝色通道：

```text
源画布直接读回：2.5
Chrome 图像复制：2.5
本地图像复制：  2.498046875
绝对差值：      0.001953125
```

共 12 项差异，覆盖 sRGB/P3 源与目标组合及三种图像入口。最大误差为 `0.001953125`，超过上一轮比较器采用的 `1e-5` 浮点颜色阈值。

- Evidence：`hdr_*_image`、`hdr_*_bitmap`、`hdr_*_pattern`；4 个 `hdr_*_direct` 控制用例通过。
- Finding：源图像通过非预乘读回后又转换为 F16 预乘数据，图像与图案入口仍直接调用旧的 `SkPixmap::readPixels`，没有使用已为像素读写增加的舍入处理。
- Path：[index.js](../index.js) 的 `#readPixels`；[skia_backend.cpp](../src/skia_backend.cpp) 的 `skia_canvas_set_pattern`（1787 行）和 `skia_canvas_draw_rgba_image`（2089 行）。
- 修复方向：尽可能保留原始预乘图像；需要转换时统一半精度舍入，避免源快照反复预乘/反预乘。

## 复现与证据

已新增 `runTwentiethRoundCases`、三个分配失败用例和独立比较器。会导致崩溃的本地用例只在隔离子进程中运行，不会终止主检查程序。

```powershell
node capture-cdp.cjs tests/fourth-round-cases.js cdp-twentieth-review
node tests/compare-twentieth-round.cjs
```

当前比较器因发现差异而以状态 1 退出，这是本轮检查的预期结果。

- [机器证据](twentieth-round-review.json)：测试数、浏览器采集元数据、源码/模块哈希、崩溃 stderr、逐项差异。
- `out/cdp-twentieth-review-browser.json`：完整 Chrome 结果。
- `out/twentieth-local.json`：完整本地结果。
- 浏览器采集批次：`945a64fd8a9b40bcac2248e1f8b58cce`。

本轮通过的新增检查包括 P3/F16 渐变、不透明画布像素写入、变换和裁剪后的合成、带阴影的文字绘制，以及分离缓冲区和跨上下文 ImageData 克隆。检查没有修改生产实现或重新编译模块；上述问题说明上一轮通过的测试范围仍有缺口。

## 完成检查

- [x] 新增 135 项可复现检查，保存真实浏览器对照。
- [x] 崩溃用例在带超时的独立子进程中验证。
- [x] 按根因聚合 23 项差异，注明具体触发条件与源代码位置。
- [x] 浮点颜色沿用 `1e-5` 阈值，未通过扩大容差掩盖差异。
- [x] 保留当前实现，产出独立审查报告和机器证据。
