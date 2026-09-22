# OffscreenCanvas 第二十二轮：补齐 6 项缺失接口

第二十一轮实测列出的 6 项缺失接口**已全部实现**。原先 57 项探针中有 6 项行为差异，现在为 **0**。

## 实现内容

| 缺失项 | 实现 |
|---|---|
| `DOMMatrix` / `DOMMatrixReadOnly` / `DOMPoint` / `DOMPointReadOnly` | 新增 `src/dommatrix.js`。16 个 `mIJ` 分量加 `a`–`f` 别名、`is2D`、`isIdentity`，完整的不可变与 `*Self` 运算（translate / scale / scale3d / rotate / rotateFromVector / rotateAxisAngle / skewX / skewY / multiply / preMultiply / flipX / flipY / inverse / transformPoint），CSS `<transform-list>` 字符串构造与 `setMatrixValue`，`toFloat32Array` / `toFloat64Array` / `toJSON` / `toString`。`ctx.getTransform()` 现在返回 `DOMMatrix` |
| `Path2D` | 原生 `SkPath` 对象（`src/skia_backend.cpp` 新增 `CanvasPath` 与 17 个入口）。支持 `moveTo`/`lineTo`/`quadraticCurveTo`/`bezierCurveTo`/`closePath`/`rect`/`roundRect`/`arcTo`/`arc`/`ellipse`/`addPath`、`new Path2D(path)` 复制、`new Path2D(svg)`，以及 `fill(path)`/`stroke(path)`/`clip(path)`/`isPointInPath(path,…)`/`isPointInStroke(path,…)`。Path2D 坐标是用户空间，绘制时才套用 CTM，不影响上下文自身的当前路径 |
| `ctx.filter` | CSS `<filter-function-list>` 在 Rust 侧解析（大小写不敏感），编码为定长记录交给 Skia 构建 `SkImageFilter` 链：`blur`、`brightness`、`contrast`、`grayscale`、`hue-rotate`、`invert`、`opacity`、`saturate`、`sepia`、`drop-shadow`。参与 save/restore/reset；非法值保留原值 |
| `ctx.lang` | 按事件属性语义实现存取、save/restore/reset |
| `ImageBitmapRenderingContext` | `getContext('bitmaprenderer')` 返回真实上下文，原型为 `canvas` / `constructor` / `transferFromImageBitmap`，与 Chrome 一致。转移会清空源位图并把位图拉伸呈现到画布尺寸（画布自身尺寸不变）；`null` 参数清空画布；非位图参数抛 `TypeError`。`transferToImageBitmap()`、`convertToBlob()`、`drawImage()` 都能读取该画布 |
| `createImageBitmap()` | 接受 Canvas / ImageBitmap / ImageData / Blob，支持裁剪四参数、`resizeWidth` / `resizeHeight` / `resizeQuality` / `imageOrientation` 等选项。裁剪与缩放走既有 `drawImage` 路径，因此采样与其它图像入口一致 |
| `convertToBlob()` 的 JPEG / WebP | 通过 Skia 的 `SkJpegEncoder` / `SkWebpEncoder` / `SkPngEncoder` 编码，`quality` 生效；不支持的 MIME 回退 PNG，类型匹配大小写不敏感 |

## Skia 需要重新配置编译

根因：`third_party/skia/out/canvas2d-clang/args.gn` 里 `is_official_build = true` 让 Skia 选择**系统** libjpeg / libpng / libwebp，而 Windows 上不存在，于是编解码器全部被关闭。本轮改为使用仓库内已有的 checkout：

```gn
skia_use_libjpeg_turbo_decode = true
skia_use_libjpeg_turbo_encode = true
skia_use_libpng_decode = true
skia_use_libpng_encode = true
skia_use_libwebp_decode = true
skia_use_libwebp_encode = true
skia_use_wuffs = true
skia_use_system_libjpeg_turbo = false
skia_use_system_libpng = false
skia_use_system_libwebp = false
```

`build.rs` 相应新增链接 `libjpeg`、`libjpeg12`、`libjpeg16`、`libpng`、`libwebp`、`libwebp_sse41`、`wuffs`、`zlib`。原 `args.gn` 备份为 `args.gn.bak`。

重新编译 Skia 后 **demo 的 9216 个 RGBA 值仍然零差异**，说明光栅化行为未受影响。

## 验收

环境：Windows x64、Node 22.13.1、Skia Graphite / Dawn D3D11。

| 项目 | 结果 |
|---|---|
| `node demo.js` | `true`，9216 个值与 Chrome 153 基准零差异 |
| `node test.js --local` | 6108 项全部通过 |
| GC 检查 | 新增 `tests/path-gc.cjs`：Path2D 不可达后原生 SkPath 释放、重复分配复用存储；与既有 gradient / pattern GC 检查一并纳入 `node test.js` |
| 独立测试 | 10/10 |
| `cargo build --release` | 成功，**0 告警** |
| 接口外形对照 | 第二十一轮 57 项探针：**行为差异 0 项**（此前 6 项） |
| 语义逐项对照 | 本轮新增四批 128 项：**行为差异 2 项**（见下） |
| `node test.js` | `browserVerified: true`，所有轮次 `Failures: []` |

机器证据：[twentysecond-round-fixes.json](twentysecond-round-fixes.json)。

## 与实时 Chrome 的逐项对照

复用**一条** CDP 会话（`cdp-session.cjs` 的白名单一次加齐四个探针文件，避免反复重连并重复征求授权），对 Chrome 153.0.8010.48 采集四批共 **128 项**：

| 批次 | 用例 | 内容 |
|---|---:|---|
| `twentysecond-round-probe.js` | 53 | DOMMatrix 运算与构造、Path2D 几何与错误、filter 像素与状态、bitmaprenderer 生命周期、createImageBitmap 各种源、编码往返 |
| `…-probe-b.js` | 42 | 深层边界：transform-list 字符串、自变换链、Path2D 非有限值与 evenodd 裁剪、filter 与阴影/合成/变换的交互、createImageBitmap 负裁剪与越界、编码质量 |
| `…-probe-c.js` | 13 | bitmaprenderer 的呈现与空白态模型 |
| `…-probe-d.js` | 20 | 滤镜在 CTM 下的作用空间、编码器体积与往返精度 |

**结果：128 项中行为差异 2 项**，另 3 项仅错误文案不同（错误类型一致）。

对照过程中实测推翻了若干按规范做的实现，均已按实测修正：

| 实测发现 | 修正 |
|---|---|
| 滤镜在**设备空间**生效：`scale(1/2/0.5)` 下模糊剖面逐值相同，drop-shadow 偏移也不随缩放变化 | 改为在重置矩阵的图层上施加滤镜链。首次尝试失败是因为内层 paint 仍带着 composite 混合模式，画进空图层后什么都不剩；现在内层强制 source-over，合成由图层 paint 承担 |
| 阴影**不被滤镜着色**（`filterWithShadow` 的阴影是纯蓝） | 阴影改由 `DropShadow(input = 滤镜链)` 生成 |
| `isPointInPath(path, x, y)` 的点在**画布空间**，不是路径空间 | 命中测试前先用 CTM 映射路径；描边轮廓先在用户空间生成再映射 |
| `transferFromImageBitmap` **不改变**画布尺寸，位图被**拉伸**填满画布；resize **不清空**已转移的帧；`transferToImageBitmap()` 返回**帧的**尺寸；空白画布 `convertToBlob()` 抛 `NotReadableError` | 全部按实测重写 |
| `ctx.filter` 的 getter 返回**原样字符串**（`BLUR(4PX)` 原样返回），且 `url(...)` 是合法值 | 去掉归一化，接受 url() 且不产生滤镜操作 |
| `ctx.lang` 默认值是 `"inherit"`，不是 `""` | 改默认值 |
| `blur()` 空参数合法 | 空参数按 0 处理 |
| JPEG / WebP 默认质量是 **1.0**（`size_jpeg_undefined === size_jpeg_1 === 805`）；WebP 在质量 1 走**无损**（528 字节，低于 0.92 的 586）；JPEG 满质量关闭色度下采样 | 默认质量改 1.0，WebP 质量 ≥1 用 `kLossless`，JPEG 质量 100 用 4:4:4 |
| `DOMMatrix.toJSON()` 先输出 `a`–`f` 再输出 `m11`–`m44`；`toString()` 用 JS 数字文本（`1e-7` 不展开）；四分之一圈精确为 0/±1；CSS 单位大小写不敏感 | 逐项修正 |

`DOMMatrix.multiply` 的乘序经实测确认与实现一致（`[2,12,22]`），此前报告中列为待核对的三项均已闭合。

## 两处已知偏差

| 偏差 | 说明 |
|---|---|
| `new DOMMatrix('rotate(1rad)')` 的 cos 差 **1 ULP**（`…98` vs Chrome `…97`） | 试过 8 种算法与邻近双精度输入，无一能复现 Chrome 的值，属 libm/FMA 层面差异。同批 14 个 transform-list 用例中另外 13 个精确一致 |
| WebP **有损** quality 0.5 的红通道 251 vs 249 | 文件大小完全相同（594 字节），说明编码配置一致；`SkWebpEncoder::Options` 只暴露 `fCompression` 与 `fQuality`，差异来自 libwebp 构建内部。默认与 quality 1 的**无损**路径逐值精确 |

`ctx.lang` 只实现了属性语义，尚未接入按语言选择字体与整形。

## 范围


结论限定于当前 Windows x64、Node 22.13.1、Chrome 153.0.8010.48 与默认 Graphite / Dawn D3D11 及软件回退路径。上述两处已知偏差与 `lang` 的整形行为不在本轮通过结论内。
