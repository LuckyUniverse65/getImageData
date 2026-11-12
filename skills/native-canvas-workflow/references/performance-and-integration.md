# 性能、Canvas 复用与接入

## 慢在哪里

把进程启动、require 原生模块、首张画布/字体/GPU 初始化、实际绘图、读回、编码、输出/IPC 分开计时。打印大像素数组也可能成为主要开销。冷启动时间不能当作每次绘图耗时。

`scripts/benchmark-demo.cjs` 历史上仍指向根 `demo.js`，先修正实际入口再使用。比较同一绘图操作的冷/热耗时和像素哈希。不能为了提速直接切到 CPU，然后假设 GPU 像素不变。

## 服务与实例复用不是一回事

工程 `demo/demo_server.js` 的 GET `/draw` 每次创建新画布并完整绘制；进程常驻及启动预热摊薄初始化成本。当前返回尺寸和耗时，不能在未检查代码时宣称返回了像素数组。

工程 `integration/canvas-service/` 才是明确复用同一 Canvas 的方案：

- server 在每个服务实例持有一张画布、一个上下文，启动时预热。
- 每次绘图先 reset 或赋回尺寸以清除变换、裁剪、路径和样式；仅 clearRect 不够。再完整重绘并返回像素快照。
- 当前 draw 没有 await，在单进程事件循环中同步完成，所以请求不会在一次绘图中间交错；增加异步操作时需要队列或独立画布，不能继续假设天然串行。
- 新建/销毁业务 worker 不影响服务持有的 Canvas。client 只发请求、接收数组，不 require 原生 canvas。

复现入口（要求已安装合适的 `canvas` 本地包或 npm 别名）：

```text
node integration/canvas-service/server.js
node integration/canvas-service/worker-demo.js
```

第二条在另一个终端执行。检查 serviceId/PID 保持、请求号增长、业务线程变化、像素哈希稳定；每次请求确实绘图，而非返回缓存结果。不要自动改变调用方的同步 API 为 HTTP 异步 API，先确认其调用链能接受。

`function createWebGLContext() { [native code] } could not be cloned` 属于结构化克隆错误。导出对象带函数，不能用 workerData/postMessage 传整个模块。每个 worker 自己加载模块是另一种可用方案，但不会跨 worker 复用同一原生画布。

## 接入现有 DOM 框架

只在用户授权修改的工程中动手；“告诉我位置/给我代码”只交付说明或本工程文件，不修改外部项目。当前工程 `docs/2026-10-20_5sFramework-canvas-replacement.md` 是手动替换方案；旧 bridge 文件是另一套方案，不能同时安装两套。

先找运行时真正加载的环境文件（独立入口和服务 worker 可能不同），不要依据历史行号直接替换。通常：

1. 保留框架 HTMLCanvasElement 与 DOM 继承；用 WeakMap 等把框架元素关联到真实原生画布。
2. 在 getContext 的 2d/bitmaprenderer 分支取得真实上下文，保留缓存、互斥、ctx.canvas 和其他分支；不在假对象上复制原生原型方法。
3. 同步 width/height setter；即使相同值也要 reset。需要 setAttribute 等 DOM 修改路径时单独接通，不能声称直接赋值覆盖了全部 DOM 语义。
4. 导出必须编码同一张真实画布的像素，不能继续返回写死 base64。包内 HTMLCanvasElement 无 toDataURL/toBlob，需要桥接编码。
5. transferControlToOffscreen 使用关联原生 HTMLCanvasElement 的转移并维护转移状态。框架图像源在 drawImage/createPattern/createImageBitmap 前转换；仅实现 Canvas 转换不等于支持所有图片/视频元素。
6. OffscreenCanvas、ImageData、Path2D、矩阵等全局类型按需求覆盖；已有真实上下文的方法自然生效，无需逐个重写 fillText/getImageData。

跨 realm 的 Array、Error、TypedArray、Blob 可能不是同一构造器；像素正确不证明 instanceof 和所有 DOM 原型关系都等同浏览器。当前本地 ImageBitmap 也不是完整浏览器 transferable。

验收最少覆盖实际像素、两次 getContext 身份、互斥返回、ctx.canvas、尺寸重置、导出签名、转移状态、图像源转换和跨线程参数。最小 VM/DOM 支撑测试通过只能声明该集成路径通过，不能宣称整个框架或打包 EXE 已验收。
