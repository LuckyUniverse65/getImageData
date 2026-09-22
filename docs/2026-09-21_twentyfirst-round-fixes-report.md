# OffscreenCanvas 第二十一轮检查与修复

本轮针对 `index.js` 暴露的 `OffscreenCanvas`、`OffscreenCanvasRenderingContext2D`、`CanvasRenderingContext2D`、`CanvasPattern` 及其原生实现（`src/webgl_native.rs`）做定向检查。新增 57 项探针用例，逐项对照当前 Chrome 153.0.8010.48 实时结果。修复后 **51 项行为一致**，其余 6 项为尚未实现的接口，不是已实现代码的缺陷。

## 修复内容

| 问题 | 证据 | 修复 |
|---|---|---|
| 上下文把全部方法和访问器挂在**实例**上，`Object.getOwnPropertyNames(ctx)` 返回 72 项、`Object.keys(ctx)` 返回 47 项 | Chrome `contextShape` 为 `ownNames:0, ownKeys:0, canvasOwn:false` | 接口只在首个上下文上装配一次到 prototype，随后删除实例自有属性；`canvas` 改由 WeakMap 旁存，原生访问器描述符改为 `napi_configurable` |
| `canvas_2d()` 每建一个 2D 上下文用 `CString::into_raw()` 泄漏 25 个 CString，永不回收 | 代码审查 | 名字改为局部 `Vec<CString>`，`define_properties` 后自然释放 |
| `setLineDash` 存 f64 原值，`getLineDash()` 返回未经 float 转换的数 | Chrome：`[1e300,1]` → `[3.4028234663852886e+38,1]`；`[0.1]` → `[0.10000000149011612]`；`[5e-46]` → `[0]` | 入栈前统一走 `canvas_float` |
| `new OffscreenCanvas(2**32+2,1)` 抛 `RangeError` | Chrome 抛 `TypeError`（`[EnforceRange] unsigned long`） | 改为 `TypeError`，边界值不变 |
| `OffscreenCanvas`、`ImageBitmap` 缺 `Symbol.toStringTag` | Chrome `[object OffscreenCanvas]` / `[object ImageBitmap]`，本地均为 `[object Object]` | 补上标签 |
| `OffscreenCanvas.prototype` 缺 `oncontextlost` / `oncontextrestored` | Chrome 原型成员清单 | 按实测语义实现：per-instance、初值 `null`、非函数赋值读回 `null`、错误接收者抛 `TypeError` |
| `measureText()` 返回普通对象，10 个指标是自有数据属性 | Chrome `[object TextMetrics]`，`own:[]`，10 项均为 prototype 访问器 | 新增 `TextMetrics` 接口 |
| `createLinearGradient()` 等返回普通对象，`addColorStop` 是自有属性 | Chrome `[object CanvasGradient]`，`own:[]` | 新增 `CanvasGradient` 接口，沿用既有 `CanvasPattern` 的做法 |
| `ImageData` 是普通对象，float16 分支另造一个对象 | Chrome `[object ImageData]`，`proto:[colorSpace,constructor,data,height,pixelFormat,width]`，`own:[data]` 只读 | 新增 `ImageData` 接口，含与 Chrome 一致的构造函数（两种重载、`IndexSizeError` / `InvalidStateError` / `TypeError` 分支） |
| `ImageData`、`TextMetrics`、`ImageBitmap` 构造函数 `length` 为 4/2/4 | Chrome 为 2/0/0 | 显式修正 Web IDL 构造函数元数 |
| `ImageData`、`TextMetrics`、`CanvasGradient`、`ImageBitmap` 不是全局量 | Chrome 均为 `function` | 在 `installWebGLGlobals` 与模块导出中补齐 |
| 约 85 行不可达的旧 JS 光栅器（`fill_rectangle`/`raster`/`blend`/`shadow_paths`/`style_at`/`clip_contains`/`offset_paths`/`clone_for_raster`）及只写不读的 `Canvas2D.pixels`、`Canvas2D.clip` | `cargo build` 12 条 dead-code 告警 | 全部删除。`save()` 不再深拷贝 `Vec<Vec<Path>>`，`clip()` 不再克隆整条路径。编译告警从 12 降到 0 |

## 被实测否定的两项推断

按规范文本，我原本判定下面两处是缺陷并已改动，实测后**全部回退**：

1. **`CanvasPattern.setTransform` 的非有限矩阵**。规范说应直接 return。实测 Chrome：`{a:NaN,…}` 保留矩阵、图案画不出任何像素（`[0,0,0,0]`）；`{e:Infinity}` 退化为单位矩阵、正常绘制（`[255,0,0,255]`）。原实现两种情况都与 Chrome 一致，我的「修复」反而让 NaN 情形画出了红色。已回退并加注释记录实测结论。
2. **`getImageData` 等的 `long` 参数**。规范是普通 `long`（回绕）；实测 Chrome 是 `[EnforceRange]`，对 `2**32+1`、`Infinity`、`NaN` 一律抛 `TypeError`。原实现正确，无需改动。

这两处说明：只按规范文本判断会改错，必须以实时 Chrome 结果为准。

## 验收

环境：Windows x64、Node 22.13.1、Chrome 153.0.8010.48（`@199a3a541d76237379e353b348e64045584db057`），默认 Skia Graphite / Dawn D3D11。

| 项目 | 结果 |
|---|---|
| `node demo.js` | `true`，9216 个 RGBA 值与内嵌 Chrome 153 基准零差异 |
| `node test.js` | `browserVerified: true`，6108 项全部通过，所有轮次 `Failures: []`，`demoMismatches: 0` |
| `node --test tests/context-hosts.test.cjs tests/worker-concurrency.test.cjs` | 4/4 通过 |
| `cargo build --release` | 成功，**0 告警**（修复前 12 条） |
| 本轮探针 | 57 项，行为差异 6 项（均为未实现接口），24 项仅错误**文案**不同（错误类型一致） |

复现：

```powershell
cargo build --release
Copy-Item target/release/webgl.dll webgl.node -Force
node demo.js
node test.js
node capture-cdp.cjs tests/twentyfirst-round-probe.js cdp-twentyfirst-probe
```

机器证据：[twentyfirst-round-fixes.json](twentyfirst-round-fixes.json)，含 Chrome 版本、采集 runId、探针 SHA-256、逐项差异和当前源码/模块哈希。浏览器原始结果为 `out/cdp-twentyfirst-probe-browser.json`。

本轮新增 `tests/twentyfirst-round-probe.js`，并把它加入 `cdp-session.cjs` 的脚本白名单（该白名单限制可注入用户真实 Chrome 的脚本）。

## 尚未实现的接口（非本轮缺陷）

下列 6 项是实时对照中仍存在的差异，它们是缺失功能而非已实现代码的错误，需要新增渲染 / 编码能力，不属于本轮「修复已实现部分」的范围：

| 差异 | Chrome | 本地 | 所需工作 |
|---|---|---|---|
| `ctx.filter`、`ctx.lang` | 存在 | 缺失 | `filter` 需接入 Skia image filter 链（C++）；`lang` 影响文字整形 |
| `getTransform()` 返回类型 | `[object DOMMatrix]` | 普通对象 `{a..f}` | 需实现 `DOMMatrix` 接口 |
| `Path2D` | 有 | 无 | 需要原生可重放的路径对象，涉及 Rust + Skia |
| `getContext('bitmaprenderer')` | `ImageBitmapRenderingContext` | `null` | 可在 JS 层实现，约需 `transferFromImageBitmap` 及生命周期处理 |
| `convertToBlob({type:'image/jpeg'|'image/webp'})` | 真 JPEG / WebP | 一律 PNG | Skia 已链接 `SkJpegEncoder` / `SkWebpEncoder`，需新增 C ABI 与 Rust 接线 |
| `createImageBitmap` | 有 | 无 | 需要图像解码（Skia codec） |

另：`HTMLCanvasElement` 是不接入 DOM 的替身类，与真实 `HTMLElement` 的成员差距远大于上面任何一项，本轮未纳入对照。

错误**文案**与 Chrome 不同（如 `Failed to execute 'getImageData' on '…': Value is outside the 'long' value range.`）是项目既有约定——历次对照只比较 error name。本轮 24 处属于此类，未作改动。

## 结论范围

结论限定于当前 Windows x64、Node 22.13.1、Chrome 153.0.8010.48 与默认 Graphite / Dawn D3D11 及软件回退路径。上表 6 项未实现接口、其他 GPU / 浏览器版本、可选 Ganesh 后端不在本轮通过结论内。
