# 会话交接：2026-09-21 ~ 09-22（第 21–23 轮）

写给接手这个项目的下一个 Claude。读完这份就能继续干，不需要重新摸索。

---

## 0. 最重要的一条规则

**这个项目的正确性判据是用户本机运行的 Chrome 153，不是规范文本。**

按规范推断改代码，本次会话已经吃过两次亏：

1. 规范说 `CanvasPattern.setTransform` 遇到非有限矩阵应直接 return。实测 Chrome：`{a:NaN,…}` 会**保留**该矩阵、图案画不出任何像素（`[0,0,0,0]`）；`{e:Infinity}` 才退化为单位矩阵正常绘制。按规范「修」完反而制造了回归。
2. 规范说 `getImageData` 的 `sx/sy/sw/sh` 是普通 `long`（ToInt32 回绕）。实测 Chrome 是 `[EnforceRange]`，对 `2**32+1`、`Infinity`、`NaN` 一律抛 `TypeError`。原实现本来就是对的。

**动任何 Canvas 行为之前，先写探针用 CDP 采集 Chrome 的实际值，再改。**

---

## 1. 项目是什么

`D:\python\getImageData` —— 一个 Node 原生模块，目标是让 Canvas 2D 的行为与 Chrome 153.0.8010.48 **逐像素、逐属性一致**（用于指纹对齐场景）。

```
index.js              JS 层：Web IDL 参数转换、接口形状、序列化行为（1090 行）
src/dommatrix.js      DOMMatrix / DOMMatrixReadOnly / DOMPoint（553 行，本会话新增）
src/webgl_native.rs   Node-API 绑定与 JS API 分派（约 2000 行）
src/skia_backend.cpp  Skia Graphite/Dawn D3D11 后端（约 2500 行）
src/png.js            纯 JS PNG 编码器（现已冗余，见 §5 待办）
src/canvas_css.rs     CSS 颜色/字体解析
build.rs              clang-cl 编译 C++ + 链接 Skia/Dawn/ANGLE/编解码器
webgl.node            编译产物（14.4MB，被 git 跟踪）
libEGL.dll            ANGLE，仅 Ganesh 诊断路径用
libGLESv2.dll         同上
```

### 三条渲染后端（`skia_backend.cpp:1442-1464`）

| 后端 | 触发 | 说明 |
|---|---|---|
| **Graphite / Dawn / D3D11** | 默认 | 正式路径。用户的 Chrome 通过 Variations 实验启用了 SkiaGraphite，本项目对齐的是它 |
| **软件光栅** | GPU 建面失败自动，或 `CANVAS_RASTER_SURFACE=1` | **真正的回退路径**。宽度 >16384 的画布靠它，否则静默丢绘制 |
| **Ganesh / ANGLE** | 仅 `CANVAS_USE_GANESH=1` | **诊断用，不是回退**。与 Graphite 光栅化结果不逐像素相同 |

---

## 2. 常用命令

```powershell
# 构建并部署
cargo build --release
Copy-Item target/release/webgl.dll webgl.node -Force

# 验收（两条都必须过）
node demo.js            # 打印 true = 9216 个 RGBA 值与内嵌 Chrome 基准零差异
node test.js            # 6108 项 + 浏览器实时对照，要求 browserVerified: true
node test.js --local    # 只跑本地部分，快
node --test tests/*.test.cjs   # 10 项独立测试

# Chrome 对照采集
node capture-cdp.cjs --session-status
node capture-cdp.cjs tests/<probe>.js cdp-<name>
```

### CDP 会话的坑（必读）

- `cdp-session.cjs:13` 的脚本白名单是**模块级常量**，由常驻服务进程启动时读入。**每加一个新探针文件就得重启服务**（`--session-stop` + `--session-start`），而重启就是对 Chrome 新建一条连接——正是该文件注释里「never reconnect and repeat consent」要避免的。
- **对策**：要么一次把所有探针文件加进白名单，要么**复用已在白名单里的探针文件**（改内容即可，白名单按路径匹配，采集时才读文件内容）。本会话就是靠后者避免了多次重启。
- 会话进入 `failed` 状态后必须显式 stop/start 才能恢复，这是设计。
- Chrome 必须带 `--remote-debugging-port=9222` 运行。会话中断过一次，用户重启 Chrome 后恢复。

当前白名单（`cdp-session.cjs:13`）：
```
demo.js, tests/browser-cases.js, tests/additional-cases.js, tests/third-round-cases.js,
tests/fourth-round-cases.js, tests/unicode-color-case.js,
tests/twentyfirst-round-probe.js, tests/twentysecond-round-probe.js,
tests/twentysecond-round-probe-b.js, tests/twentysecond-round-probe-c.js,
tests/twentysecond-round-probe-d.js, tests/twentythird-round-probe.js
```

---

## 3. 本会话做了什么

### 第 21 轮 —— 修已实现部分的缺陷（12 项）

| 问题 | 修复 |
|---|---|
| 上下文把方法/访问器挂在**实例**上，`getOwnPropertyNames(ctx)` 返回 72 项 | 接口只在首个上下文上装配一次到 prototype，随后删除实例自有属性；`canvas` 改由 WeakMap 旁存；原生访问器描述符改 `napi_configurable`。现在为 **0 项**，与 Chrome 一致 |
| `canvas_2d()` 每建一个上下文用 `CString::into_raw()` 泄漏 25 个 CString | 改为局部 `Vec<CString>` |
| `setLineDash` 存 f64 原值 | 入栈前走 `canvas_float`（Chrome：`[1e300]`→`3.4028e38`，`[0.1]`→`0.10000000149011612`） |
| `new OffscreenCanvas(2**32+2,1)` 抛 `RangeError` | 改 `TypeError` |
| `OffscreenCanvas`/`ImageBitmap` 缺 `Symbol.toStringTag` | 补上 |
| 缺 `oncontextlost`/`oncontextrestored` | 按实测语义实现 |
| `measureText()`/`createLinearGradient()`/`getImageData()` 返回普通对象 | 新增 `TextMetrics`、`CanvasGradient`、`ImageData` 三个真接口 |
| 构造函数 `length` 错误 | 修正 |
| 这些接口不是全局量 | 补齐 |
| 约 85 行不可达旧光栅器 + 只写不读的 `pixels`/`clip` | 删除。`save()` 不再深拷贝 `Vec<Vec<Path>>`。编译告警 12→0 |

**结果：57 项探针对 Chrome 行为差异 0。**
文档：`docs/2026-09-21_twentyfirst-round-fixes-report.md` + `docs/twentyfirst-round-fixes.json`

### 第 22 轮 —— 补齐 6 项缺失接口

用户要求「全部加上，不要加一半就停」。

| 接口 | 实现要点 |
|---|---|
| `DOMMatrix` / `DOMMatrixReadOnly` / `DOMPoint` / `DOMPointReadOnly` | 新增 `src/dommatrix.js`。16 个 `mIJ` + `a`–`f` 别名、完整不可变与 `*Self` 运算、CSS `<transform-list>` 构造。`getTransform()` 现返回 `DOMMatrix` |
| `Path2D` | C++ 新增 `CanvasPath` + 17 个入口（原生 SkPath）。支持复制构造、SVG 路径串、`addPath` 带矩阵，以及 `fill`/`stroke`/`clip`/命中测试的 Path2D 重载。原型成员与 Chrome 逐项一致 |
| `ctx.filter` | 10 种 CSS 滤镜函数接入 Skia image filter 链 |
| `ctx.lang` | 属性语义（默认 `"inherit"`） |
| `ImageBitmapRenderingContext` | 原型为 `canvas,constructor,transferFromImageBitmap` |
| `createImageBitmap()` | Canvas/ImageBitmap/ImageData/Blob 四种源，裁剪缩放复用 `drawImage` 采样 |
| `convertToBlob` 的 JPEG/WebP | Skia 编码器 |

**关键根因**：`third_party/skia/out/canvas2d-clang/args.gn` 里 `is_official_build = true` 让 Skia 去找 Windows 上不存在的**系统** libjpeg/libpng/libwebp，于是编解码器被整体关闭。改用仓库内 checkout 后重新编译 Skia（`args.gn.bak` 是原备份），`build.rs` 补链 8 个库：`libjpeg`、`libjpeg12`、`libjpeg16`、`libpng`、`libwebp`、`libwebp_sse41`、`wuffs`、`zlib`。

**实测推翻了 9 处按规范做的实现**，全部按实测改正：

- **滤镜在设备空间生效**（`scale(1/2/0.5)` 三条模糊剖面逐值相同）。原先挂在 paint 上被 Skia 按 CTM 放大。改用重置矩阵的图层；第一次尝试失败是因为内层 paint 还带着 composite 混合模式，`source-atop` 画进空图层后什么都不剩——内层必须强制 `source-over`
- **阴影不被滤镜着色** → 改由 `DropShadow(input=滤镜链)` 生成
- **`isPointInPath(path,x,y)` 的点在画布空间**，不是路径空间 → 命中测试前先用 CTM 映射路径
- **`transferFromImageBitmap` 不改画布尺寸**，位图被拉伸填满；resize 不清空帧；`transferToImageBitmap()` 返回**帧的**尺寸；空白画布 `convertToBlob()` 抛 `NotReadableError`
- **`ctx.filter` getter 返回原样字符串**（`BLUR(4PX)` 原样），`url(...)` 合法
- **JPEG/WebP 默认质量是 1.0**（`size_jpeg_undefined === size_jpeg_1 === 805`）；**WebP 质量 1 走无损**（528 < 0.92 的 586）；JPEG 满质量关闭色度下采样（`Downsample::k444`）
- `DOMMatrix.toJSON` 键序（`a`–`f` 在前）、`toString` 用 JS 数字文本（`1e-7` 不展开）、四分之一圈精确为 0/±1、CSS 单位大小写不敏感

**结果：四批 128 项探针，行为差异 2 项**（见 §4 已知偏差）。
文档：`docs/2026-09-21_twentysecond-round-features-report.md` + `docs/twentysecond-round-fixes.json`

### 第 23 轮 —— 函数身份（name / length / toString）

起因：在调研接入 5sFramework 时发现，**每个暴露的可调用对象在 `Function.prototype.toString` 下都泄露 JS 包装器源码**，连内部标识符 `contextBrands`、`ContextType` 都可读到。

```
Chrome:  ctx.fillRect  name="fillRect"  length=4  "function fillRect() { [native code] }"
修复前:  ctx.fillRect  name=""          length=0  "function(...args){if(contextBrands.get(this)!==ContextType)…"
```

对照结果：**106 个可调用对象中 104 个不一致**。

**做法（用户明确要求「用 Rust 伪造 toString，不依赖框架的 toString hook」）**：

`src/webgl_native.rs` 新增 `nativeFunction(target, name, length, isConstructor)`——用 `napi_create_function` 造**真正的 Node-API 函数**，数据指针持有目标 JS 函数的 `napi_ref`；调用时 `napi_call_function` 透传 `this` 和参数，构造时 `napi_get_new_target` + `napi_new_instance`。因为暴露出去的函数本身就是原生的，`toString` 天然返回 `function name() { [native code] }`，**包括 `Function.prototype.toString.call(fn)` 这种绕过属性查找的写法**。引用生命周期用 `napi_wrap` + finalizer 绑在包装器上。

新加载的 N-API 符号：`napi_call_function`、`napi_get_new_target`。

`index.js` 末尾新增 harden 阶段（`hardenPrototype` / `hardenConstructor`），遍历全部接口原型包装方法与访问器（`get x`/`set x`，getter 元数 0、setter 元数 1），每个类替换为原生构造函数并还原 `prototype` 只读、`constructor` 回指、静态方法、`DOMMatrix`→`DOMMatrixReadOnly` 静态继承链。

**所有 arity 取自 Chrome 实测**（`arityTable` 探针，13 个接口 94 个原型方法），没有一个是猜的。

顺带修了 harden 引入的一个回归：`DOMMatrixReadOnly.fromMatrix` 原先用 `this === DOMMatrixReadOnly` 判定，包装后 `this` 变成 wrapper 会错误返回 `DOMMatrix`。改为比对 `this?.prototype === DOMMatrixReadOnly.prototype`，`DOMPointReadOnly.fromPoint` 与 `matrixFromArray` 同样处理。

**结果：可调用对象 106/106、原型方法 arity 94/94 一致**，`new method()` 也与 Chrome 一样抛 TypeError。
文档：`docs/2026-09-21_twentythird-round-function-identity-report.md` + `docs/twentythird-round-fixes.json`

---

## 4. 已知偏差（都记录在案，不要当成待修 bug 反复折腾）

| 偏差 | 原因 |
|---|---|
| `new DOMMatrix('rotate(1rad)')` 的 cos 差 **1 ULP**（`…98` vs Chrome `…97`） | 试过 8 种算法与邻近双精度输入，无一能复现 Chrome 的值，属 libm/FMA 层面。同批 14 个 transform-list 用例另外 13 个精确一致 |
| WebP **有损** quality 0.5 红通道 251 vs 249 | 文件大小完全相同（594 字节）说明编码配置一致；`SkWebpEncoder::Options` 只暴露 `fCompression`/`fQuality`。**无损路径（默认与 quality 1）逐值精确** |
| 方法/访问器带 `arguments`、`caller`、`prototype` 自有属性 | `napi_create_function` 必加且不可配置删不掉。Chrome 方法是 `["length","name"]`。要闭合需 `v8::FunctionTemplate::RemovePrototype()`，Node-API 不暴露。**注意**：bound 函数（`fn.bind()`）恰好有完美的自有属性形状但 `toString` 会丢名字，两者不可兼得，本项目按「toString 优先」选了原生函数 |
| `Object.getPrototypeOf(OffscreenCanvas)` | Chrome 是 `EventTarget`，本项目未实现该接口 |
| 错误**文案**与 Chrome 不同 | 项目既有约定，历次对照只比较 error name。第 21 轮有 24 处属此类 |
| P3 → sRGB 浮点读回 2 个通道微差 | 第 19 轮记录，比较器对 `rgba-float16` 的 RGB 通道用 `1e-5` 绝对误差 |

---

## 5. 未完成的任务（用户已明确交代，按顺序做）

### 任务一：备份到 GitHub（**先做这个，再动代码**）

用户原话：「先将现如今的代码上传到 github 进行版本备份，以防你改错后无法找到原先的代码」。

现状：分支 `fix/offscreen-compatibility-20260914`（不是 main，可以直接提交），**54 项未提交改动**：

```
 M build.rs cdp-session.cjs demo.js index.js readme.md
 M src/skia_backend.cpp src/webgl_native.rs test.js
 M tests/fourth-round-cases.js webgl.node
?? docs/（20 个报告与证据 JSON）
?? src/dommatrix.js
?? package.json package-lock.json
?? tests/（15 个测试与探针文件）
```

注意事项：
- `git remote -v` 还没查过（Bash 当时被限流）。如果没有 remote，需要问用户仓库地址，**不要自己创建仓库**。
- `webgl.node` 是 14.4MB 的二进制且被 git 跟踪（`.gitignore` 里写明「Root runtime binaries are intentionally versioned in this baseline」）。GitHub 单文件上限 100MB，没问题，但仓库会变重。
- `.gitignore` 已排除 `/out/`、`/target/`、`/third_party/`、`/node_modules/`、`*.log`。
- 提交前用 `git status` 复核 `git add` 的范围，确认没有把密钥类文件带进去。
- 提交信息末尾按当前会话的 attribution 要求署名。

### 任务二：删除 `src/png.js` 并验证

用户原话：「将 png.js 删除后，进行功能测试，对比删除前后的值是否相同，功能是否正常，都正常的话，写一个 md 文档」。

**背景**：`src/png.js` 是 37 行的纯 JS PNG 编码器（用 `node:zlib` 的 `deflateSync`），写它是因为第 22 轮之前 Skia 编解码器被关掉了。现在 `SkPngEncoder` 已在 DLL 里，调用链是：

```
convertToBlob()                      index.js:760
  └─ native.encodeImage(...)         Rust: encode_image()
       └─ skia_encode_image(...)     C++: SkPngEncoder/SkJpegEncoder/SkWebpEncoder
  └─ encodePng(...)  ← 仅当上面返回 null   index.js:763
```

`convertToBlob` 是 `OffscreenCanvas` 的原型方法（`index.js:740`，类内部），不是独立函数。`index.js:763` 是**唯一**用到 `encodePng` 的地方，也是 JS 层唯一牵连 `node:zlib`/`Buffer` 的调用点。

**删除的意义**：第 22 轮实测 PNG 已由 DLL 编码（`bytes 107 header [137,80,78,71]`，且 `encode_png` 探针与 Chrome 一致），所以 763 行实践上不可达。删掉后 JS 层对 Node 内建依赖清零，只剩 `Blob` 和 `DOMException`（两者 Node 原生就有）。

**做法**：
1. 先跑一遍基线记录当前值（`convertToBlob` 各格式的字节、header、往返像素）
2. **先探 Chrome**：`convertToBlob` 编码失败时抛什么错（大概率 `EncodingError`）。不要自己定，按 §0 的规则采集。探针可以复用已在白名单里的文件避免重启会话
3. 把 763 行换成对应的 reject
4. 删除 `src/png.js` 和 `index.js:5` 的 require
5. 对比删除前后的值是否一致
6. 跑 `node demo.js` + `node test.js` + `node --test tests/*.test.cjs`

**文档要求**（用户明确指定只写这几件事，要说清楚）：
- 什么情况下调用会返回 null
- 给出例子
- 如何避免这种情况

从 C++ 代码看 `skia_encode_image` 返回 null 的条件：`pixels` 为空指针、`width==0`、`height==0`、或 Skia 编码器本身失败（OOM／不支持的 pixmap）。而 `convertToBlob` 在 `index.js:753` 已经挡掉尺寸为 0 的情况。写文档时要把这些条件和 `convertToBlob` 的前置校验对应起来讲清楚。

---

## 6. 更大的背景：用户想把它打包成可分发模块

这是几轮对话反复澄清出来的最终目标，**任务一、二做完后会继续往这个方向走**。

### 用户的需求（逐步澄清的结果）

1. 只需要在 **Node** 里能用，不需要 Python/C++ 宿主
2. `const { OffscreenCanvas } = require('canvas')` 直接可用，每次 `new` 是独立实例
3. **不希望看到任何 JS 文件**——导入时只有二进制

第 2 点**现在就已经成立**（`index.js:1086` 的导出包含全部接口，每个 `getContext('2d')` 对应独立的 Rust `Canvas2D` 结构）。我一度把「互不干扰」误解成需要每沙箱一套独立接口的工厂，被用户纠正了——他要的是实例层独立，那本来就是对的。

### 第 3 点的方案（已论证，未实施）

把 JS 层作为源码**编译进 DLL**，加载时在当前 realm 求值：

```
build.rs  ──► 把 index.js + dommatrix.js 打包成一个函数表达式 → OUT_DIR/bundle.js
webgl_native.rs ──► include_str!(bundle.js)
napi_register_module_v1:
    1. 照常建立原生导出
    2. napi_run_script(embedded_source) → 得到一个函数
    3. 调用它，传入原生导出
    4. 返回值作为模块 exports
```

`napi_run_script` 在**当前 V8 context** 里执行，所以创建的对象属于调用方 realm。需要新加载这个符号（标准 Node-API，当前未加载）。

要做的改动：
1. `build.rs` 增加打包步骤
2. 加载 `napi_run_script`
3. 注册时求值并调用
4. 删掉 `src/png.js`（任务二已覆盖）
5. 所有 `require(...)` 从 JS 里消失

**待用户定的一个点：Float16Array**。`index.js:4` 现在是 `globalThis.Float16Array || require('@petamoriken/float16')`。Node 22 无原生、Node 24+ 有。只用于 `pixelFormat:'rgba-float16'` 的 ImageData。三选一：(A) 内嵌最小实现约 10-15KB；(B) 只用原生，Node 22 上 float16 降级；(C) 在 Rust 里做 f16 转换。我建议 A，用户还没回复。

**两个限制**：
- 需要允许 code generation from strings（`--disallow-code-generation-from-strings` 或 `codeGeneration:{strings:false}` 的 vm context 会失败）
- 源码仍可被读出（`fillRect.toString()` 已是 `[native code]`，但模块级函数的引用仍能看到源码）

**另可顺手做**：`build.rs:51` 把 `libEGL.dll.lib`/`libGLESv2.dll.lib` 作为导入库静态链接，没有 `/DELAYLOAD`，所以加载 `webgl.node` 时 Windows 就要找这两个 DLL，缺了直接加载失败——哪怕永远不用 Ganesh。`build.rs:54` 已经链了 `delayimp`，加 `/DELAYLOAD:libEGL.dll /DELAYLOAD:libGLESv2.dll` 就能让它们变成可选，分发时不必携带。

### 曾经调研过但已否决的方向

用户最初问的是接入 `D:\python\5sFramework`（一个用 `vm` 沙箱模拟浏览器的 Cloudflare/Turnstile 破解框架，`env/` 下 224 个 JS 桩，canvas 相关 8 个文件约 3122 行，`getImageData` 返回写死的指纹数组）。调研结论记在这里以免重复劳动：

- 框架有 `vm65.toolsFunc.setNative(fn, name)`（`tools/toolsFunc.js:10482-10521`），通过替换 `Function.prototype.toString` + symbol 存伪造源码做 native 化；`safeProto(obj,name)` = `setNative` + `reNameObj`
- 实测跨 realm：宿主 realm 对象直接进沙箱会暴露（`canvas instanceof Object` false、`data instanceof Uint8ClampedArray` false、`e instanceof Error` false）
- 实测把 JS 层放进沙箱求值：canvas/imageData/gradient/path/matrix 的 `instanceof Object` 全部 true，像素正确；仍 false 的三处是 `ctx`（原型来自模块加载时创建的 native 构造函数）、`data`（宿主 TypedArray）、`e`（Rust `dom_error` 走 `napi_get_global` 拿宿主全局）
- **用户明确否决了「针对框架做定向修改」**，要求做成通用、可塑造、多模块的产物。所以不要再去写 5sFramework 的适配桩

---

## 7. 交接时的环境状态

- 分支 `fix/offscreen-compatibility-20260914`，54 项未提交
- `cargo build --release` 编译成功、**0 告警**
- `node demo.js` → `true`
- `node test.js` → 6108 项通过、`browserVerified: true`、所有 `Failures: []`、`demoMismatches: 0`
- `node --test tests/*.test.cjs` → 10/10
- 本会话新增 `tests/path-gc.cjs`（Path2D 原生存储释放与复用），已纳入 `test.js`
- CDP 会话状态未确认（交接时 Bash 被限流）。Chrome 需带 `--remote-debugging-port=9222`
- 我在清理自己的临时脚本时误删了 `out/add13.py`（上一轮遗留，5KB，`out/` 被 gitignore 无法恢复）。同目录的 `fix12-*.py`、`fix13-*.py`、`extend13.py`、`report13.py` 都还在。已向用户报告

---

## 8. 工作方式备忘

- 用 Python 脚本做批量文本替换时，**写到文件再执行**（`python out/xxx.py`），不要用 bash heredoc——含引号/反引号的内容会被 shell 破坏，本会话踩过多次
- 临时脚本用完要删，但**删之前确认是自己创建的**
- 每轮的产出：`docs/YYYY-MM-DD_<轮次>-report.md`（人读）+ `docs/<轮次>-fixes.json`（机器证据，含 Chrome 版本、runId、源码 SHA-256、逐项差异）+ 更新 `readme.md` 顶部
- 项目惯例是「连续两批新增用例无新发现」才算一轮收尾，不要以「原始问题修完」为停止条件
