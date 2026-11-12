# 行为修复与回归

## 选择证据，再动实现

1. 明确问题属于接口可观察行为、几何/像素、颜色/精度、字体、原生生命周期还是部署加载。先确认实际加载的是源码模块还是已安装包。
2. 保存最小重现与现状值。Windows Chrome 对齐任务用同一目标 Chrome 跑相同探针；Linux普通绘图用明确的功能结果与现有 API 合约验收。
3. 比较结果、异常类型、转换/读取顺序和副作用。错误文案只在用户需要精确文案时新增要求。不要让参考端和被测端调用同一实现而形成自证。
4. 在负责该语义的层修正：JS 转换与品牌、Rust 绑定和状态、C++ 像素与字体、GN/链接用于实际缺失的编码能力。保留二进制与测试源码哈希。
5. 跑受影响的边界和相关回归，再运行所需完整验收。出现新失败定位原因；通过后不无目的扩大或重复测试。

## 会话中反复出现的陷阱

- 规范与特定 Chrome 实现可能不同。历史 Chrome 153 对 `getImageData` 的超范围/NaN 参数表现为 EnforceRange；CanvasPattern 非有限变换也有特殊行为。新 Chrome 需重新探测，不能把历史观察当普遍规范。
- 参数转换顺序、getter 调用次数、抛错先后、`Symbol`、BigInt、NaN/Infinity、饱和与取整都可观察。属性描述符、原型成员、构造器可调用性、错误接收者、返回对象品牌也是接口能力。
- 像素数据须携带 alpha 类型、色彩空间、位深和源类别，不能混淆不透明/预乘数据与图像源阴影语义；save/restore/reset/resize 应覆盖新增状态。
- 字体回退、中文、合成粗斜体、字距、词距、small caps、文字方向需要同时检查像素、度量和实际字体。像素相同不代表 TextMetrics 相同。
- resize 即使赋原尺寸也要清空并重置状态。转移/关闭/冻结、跨画布图案与路径、GC 和 Worker 不能只检查“未崩溃”。
- 原生函数身份使用 Node-API 转发，保留 `this`、构造语义和 finalizer；不要随便改成 JS `toString` hook。Node-API 自有属性限制仍存在，不宣称完全等同 V8 DOM 函数。

历史容差：8 位像素与普通值精确比较；既有 float16 跨色域样本仅 RGB 使用 `1e-5` 绝对误差，alpha 不放宽。不能为了让新失败消失而整体扩大容差。已记录矩阵旋转 1 ULP、WebP 有损解码 2/255、Noto Serif SC 度量偏差等，只有用户要求或新证据支持时才继续处理。

## 删除 fallback / 编码错误

当删除编码 fallback 或 DLL 路径时，先确认真实调用、链接和基线，再删除实现与打包引用，验证 MIME、签名、往返像素、质量和失败行为。当前 `png.js` 删除工作已完成，不重复做。

| 层级 | 失败语义 |
| --- | --- |
| C++ `skia_encode_image` | 失败可返回 `nullptr` |
| Node `encodeImage` | 可恢复编码失败为 `undefined`，错误参数也可能抛 TypeError |
| `convertToBlob` | 成功为 Blob；编码失败拒绝为 EncodingError，不正常返回 null |

当前实现的具体例子：

```js
const {encodeImage, OffscreenCanvas} = require('lucky65_canvas');
console.log(encodeImage(new Uint8Array(4), 2, 1, 'image/png')); // 数据不足，undefined
console.log(encodeImage(new Uint8Array(16384 * 4), 16384, 1, 'image/webp')); // 超编码器尺寸上限
const canvas = new OffscreenCanvas(0, 1);
canvas.getContext('2d');
canvas.convertToBlob().catch(error => console.log(error.name)); // IndexSizeError
```

业务优先用 convertToBlob，先建立有效上下文；处理异常、控制尺寸与并发，关闭不再需要的 ImageBitmap。历史实现导出 WebP 每边裁至 16383、JPEG 裁至 65500，保留左上角而非缩放；未知 MIME 选择 PNG。降低 quality 不改变尺寸上限。故障注入可验证错误分支，但不能声称制造过真实 OOM；OOM 也可能终止进程。

## 验证入口

- `scripts/test-native-api.js <模块入口>`：41 导出/44 方法基线、编解码、位图转移、float16/P3、生命周期、Worker；接口扩展后应经过审核同步合约，不能直接重录合约掩盖缺失。
- `tests/context-hosts.test.cjs`、`tests/worker-concurrency.test.cjs`、`tests/*-gc.cjs`：按变更选择专项。
- `tests/png-removal-check.cjs` 与工程编码空值说明：历史前后对比及故障注入；先检查当前参数和路径。
- `test.js`、`scripts/verify-machine.cjs` 和基准脚本仍有旧根目录 demo/data 路径，未修复入口不能把旧的 6108 项成功记录当作本次回归通过。
