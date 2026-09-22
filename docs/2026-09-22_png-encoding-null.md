# PNG 编码：什么时候返回空值、如何避免

## 1. 什么情况下会返回 null

这里必须区分三层调用：

| 调用 | 成功 | 失败 |
| --- | --- | --- |
| C++ `skia_encode_image(...)` | 编码数据指针 | `nullptr`（空指针） |
| Node 原生接口 `encodeImage(...)` | `Uint8Array` | 可恢复的编码失败返回 **`undefined`，不是 `null`**；错误参数也可能抛 `TypeError` |
| `await canvas.convertToBlob(...)` | `Blob` | Promise 拒绝，`await` 抛异常，**不会正常返回 `null` 或 `undefined`** |

原生接口的旧注释以及交接文档把返回值写成了 `null`，与实际实现不符。删除 `src/png.js` 后，`convertToBlob()` 遇到原生编码失败会抛 `EncodingError`，不再偷偷改用 JavaScript 编码器生成 PNG。

C++ 返回空指针有三条路径：

1. 输入像素指针为空，或宽、高为 0。
2. Skia 编码器未生成结果。例如直接编码超过格式尺寸上限的图像：WebP 任一边超过 16383，JPEG 任一边超过 65500；编码器初始化或执行失败也走这一分支。
3. 编码已完成，但复制输出数据的 `malloc` 分配失败。

内存不足不保证都能返回空值：部分分配失败可能直接终止进程。这里没有通过耗尽内存来实测。

在 Node 包装层，宽、高为 0，或像素数组长度不足 `width * height * 4`，会提前返回 `undefined`，不会调用 C++ 编码器。像素参数不是可接受的 TypedArray，或拿不到其数据指针，则抛 `TypeError`。

通过 `convertToBlob()` 正常调用时，多数无效状态会更早被拦截：

- 宽、高为 0，任一边超过 65535，或总像素超过 268435456：`IndexSizeError`。
- 尺寸合法但尚未建立绘图上下文：`InvalidStateError`。
- 2D 位图不可用，或 `bitmaprenderer` 没有帧：`NotReadableError`。

这些不是“编码器返回 null”。未知 MIME 类型也不是编码失败：会先选择 PNG，再交给原生 PNG 编码器。

本次依据 Chrome 153.0.8010.48 实测，补齐了编码前的尺寸裁剪：WebP 每边最多 16383，JPEG 每边最多 65500，保留左上角像素，不缩放，也不修改原画布。超限导出不再触发原来的 PNG 回退。真正编码失败对应 `EncodingError`，另由同版本 [Chrome 源码的 `CreateNullAndReturnResult`](https://github.com/chromium/chromium/blob/153.0.8010.48/third_party/blink/renderer/core/html/canvas/canvas_async_blob_creator.cc) 核对；未声称在浏览器中制造了内存分配失败。

## 2. 例子

以下代码在项目根目录运行。

**直接调用原生接口：尺寸或数据不满足要求。**

```js
const { encodeImage } = require('./webgl.node');

// 宽度为 0，包装层提前返回。
console.log(encodeImage(new Uint8Array(4), 0, 1, 'image/png'));
// undefined

// 2×1 RGBA 图像需要 8 个字节，这里只有 4 个。
console.log(encodeImage(new Uint8Array(4), 2, 1, 'image/png'));
// undefined

// 缓冲区长度正确，但宽度超过 WebP 编码器上限。
// 这次实际进入 C++，编码器返回空指针，再被转换为 undefined。
console.log(encodeImage(new Uint8Array(16384 * 4), 16384, 1, 'image/webp'));
// undefined
```

**正常调用画布接口：无效尺寸抛异常，超限 WebP 会裁剪。**

```js
const { OffscreenCanvas, createImageBitmap } = require('./index.js');

(async () => {
    const empty = new OffscreenCanvas(0, 1);
    empty.getContext('2d');
    try {
        await empty.convertToBlob();
    } catch (error) {
        console.log(error.name); // IndexSizeError，不是 null
    }

    const canvas = new OffscreenCanvas(16384, 1);
    canvas.getContext('2d').fillRect(0, 0, 16384, 1);
    const blob = await canvas.convertToBlob({type: 'image/webp'});
    const bitmap = await createImageBitmap(blob);
    console.log(blob.type, bitmap.width, bitmap.height);
    // image/webp 16383 1：最右侧一列被裁掉
    bitmap.close();
})().catch(console.error);
```

编码器真正失败后的 `EncodingError` 分支使用故障注入验证：在独立测试进程中临时让原生编码函数返回空值，断言 `convertToBlob()` 拒绝，再恢复函数。它验证错误处理，不代表制造了真实内存不足。可复现探针见 [测试脚本](../tests/png-removal-check.cjs)，本次比较结果见 [验证记录](png-removal-verification.json)。

## 3. 如何避免

- 优先使用 `OffscreenCanvas.convertToBlob()`，先创建上下文，确保尺寸大于 0、位图可用。它负责输入准备和格式尺寸裁剪。
- 如果直接使用 `encodeImage()`，传入 `Uint8Array` 或 `Uint8ClampedArray`，保证 RGBA 数据至少有 `width * height * 4` 个字节，并自行满足格式尺寸上限。不要把 `Uint16Array`、浮点数组直接当作 RGBA8 缓冲区。
- 要保留整幅大图，不要依赖自动裁剪。WebP 超过 16383、JPEG 超过 65500 时，可在画布允许的尺寸内明确选择 PNG；或者先等比缩小、分块导出。降低 JPEG/WebP 的 `quality` 不能改变尺寸上限。
- 控制画布尺寸和同时导出的数量，及时关闭不用的 `ImageBitmap`。仅 RGBA 像素就需要约 `width * height * 4` 字节，读取、裁剪和编码还会占用额外内存；满足尺寸上限并不保证内存足够。
- 始终用 `try/catch` 处理导出失败。遇到 `EncodingError` 可缩小图像或降低并发后再尝试；不要对同一个超大输入无限重试，也不要认为换成 PNG 就一定能解决内存问题。
