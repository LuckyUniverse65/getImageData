# OffscreenCanvas 第十九轮修复

本轮修复 `demo.js` 审查中确认的合成模式缺失、色彩空间和像素格式被忽略、ImageData 属性缺失及示例隐式全局变量问题。新增 316 项用例，完整 4750 项验收通过。

## 修复内容

| 原问题 | 修复行为 | 实现位置 |
|---|---|---|
| `destination-out` 等有效模式被忽略 | 支持全部 26 种 Canvas 合成模式，包含状态保存、恢复、重置 | `src/webgl_native.rs`、`src/skia_backend.cpp` |
| 阴影与前景合成顺序 | 按模式分别合成阴影和前景，处理全画布合成、裁剪与不透明画布 alpha；图像和图案使用各自的滤镜层次 | `src/skia_backend.cpp` |
| P3 和 float16 参数只校验、不执行 | 根据选项创建带色彩空间的 8 位或 F16 Skia surface，读写时执行色彩转换 | `src/webgl_native.rs`、`src/skia_backend.cpp` |
| ImageData 没有格式信息 | 返回只读 `colorSpace`、`pixelFormat`，克隆保留格式，浮点数据为 Float16Array | `index.js`、`src/webgl_native.rs` |
| 图像传递丢失浮点精度 | Canvas、ImageBitmap 和图案保留源色彩空间及像素格式；PNG 明确转为 sRGB 8 位 | `index.js`、原生图像入口 |
| 示例在严格模式报错 | 声明局部变量，显式导出 `globalThis.data` 供采集使用；移除圆锥渐变无效的多余参数 | `demo.js` |
| 空渐变示例不能覆盖彩色填充 | 新增三类带色标渐变与可见文字填充测试 | `tests/fourth-round-cases.js` |

渐变未添加色标时仍保持透明，这符合 Canvas 语义。没有更改原示例的预期像素数组。

## 安装和运行

Node 22 没有原生 Float16Array，本轮加入锁定版本 `@petamoriken/float16@3.9.3`。已安装当前工作区依赖并更新 `webgl.node`。新检出环境先执行：

```powershell
npm ci
node demo.js
node test.js
```

`node test.js` 复用已有 Chrome CDP 会话。只检查本地断言可使用 `node test.js --local`。单独生成本轮对照证据：

```powershell
node capture-cdp.cjs tests/fourth-round-cases.js cdp-nineteenth-round
node tests/compare-nineteenth-round.cjs
```

兼容 Float16Array 通过模块导出，未自动安装到全局；它不具备原生 TypedArray 的全部反射特征。宽色域 CSS 字符串语法不属于本次新增功能，可以通过 P3 ImageData 写入宽色域颜色。

## 验收证据

环境：Windows x64、Node 22.13.1、Chrome 153.0.8010.48，默认 Skia Graphite / Dawn 后端。

| 证据 | 结果 | 路径 |
|---|---|---|
| 完整实时回归 | 4750 项通过，GC、Worker 并发通过 | `out/cdp-verification-result.json` |
| 本轮对照 | 316 项通过，其中 315 项逐值一致 | `out/cdp-nineteenth-round-diff.json` |
| 原始示例 | 9216 个 RGBA 值与 Chrome 及内嵌参考数组均零差异 | `out/cdp-demo-browser.json` |
| 编译检查 | `cargo check` 与 release 编译成功，更新原生模块 | `out/nineteenth-build.txt` |

最终浏览器测试批次：`25946259eb9f4681a41e63662d13920d`；示例采集批次：`d4602d55b6704b179ad0f7605ece6ad7`。精简机器证据和源码哈希见 [nineteenth-round-fixes.json](nineteenth-round-fixes.json)。

### 浮点精度边界

`color_display-p3_unorm8` 的 P3 → sRGB 浮点读回有两个颜色通道与 Chrome 存在微小差异：

| 本地 | Chrome | 绝对差值 |
|---|---|---|
| 0.0092010498046875 | 0.00919342041015625 | 0.00000762939453125 |
| 0.0005030632019042969 | 0.0004992485046386719 | 0.000003814697265625 |

比较器只对 `rgba-float16` 的 RGB 通道采用 `1e-5` 绝对误差；格式属性、alpha、所有 8 位像素和合成测试仍严格比较。报告保留 `exact` 和 `toleratedCases`，不能将本次结果表述为全部逐值一致。

此外，Chrome 153 在测试中的浮点越界区域返回过非确定内容。浏览器比较只使用画布内像素；本地独立断言要求越界像素为透明黑，并验证 transferToImageBitmap 后画布清空。不将浏览器异常作为预期值。

## 完成检查

- [x] 对原问题提供最小复现并修复。
- [x] 覆盖矩形、路径、图像、图案、阴影、裁剪与状态恢复。
- [x] 覆盖 P3/F16 读写、脏矩形、ImageData 克隆及位图传递。
- [x] 保留既有回归，新增用例纳入 `node test.js`。
- [x] 更新安装说明、格式支持范围和精度边界。
