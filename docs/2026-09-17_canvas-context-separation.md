# 普通 Canvas 与 OffscreenCanvas 的上下文分离

原实现把 `CanvasRenderingContext2D` 导出为 `OffscreenCanvasRenderingContext2D`，而 `HTMLCanvasElement.getContext('2d')` 也通过一个隐藏的 OffscreenCanvas 创建上下文，导致普通 Canvas 的类型、宿主绑定和生命周期混入离屏路径。本次同时修复 JavaScript 包装层和 Rust Node-API 层。

## 现在的创建路径

| 宿主 | 原生宿主标记 | 2D 接口 | `context.canvas` |
|---|---|---|---|
| `HTMLCanvasElement` | `CanvasHost::Html` | `CanvasRenderingContext2D` | 原 HTMLCanvasElement |
| `OffscreenCanvas` | `CanvasHost::Offscreen` | `OffscreenCanvasRenderingContext2D` | 原 OffscreenCanvas |

两种接口有各自的构造器、原型和 `Symbol.toStringTag`，不会互相满足 `instanceof`。它们的接口构造器均禁止直接调用或 `new`，应通过对应宿主的 `getContext('2d')` 获取。

Rust 为两类宿主及两类上下文分配不同的 N-API 类型标签。方法、属性 getter/setter 的回调携带宿主类型并在转换用户参数前校验接收者。直接使用 `webgl.node` 也不能把普通 Canvas 的方法借给离屏上下文使用，反方向同样拒绝。

通用 Skia 绘制原语及颜色转换仍共用；独立的是原生宿主身份、接口分发、接收者校验、画布所有权和生命周期。没有通过复制整套绘制算法制造两份行为易漂移的渲染器。

## HTMLCanvasElement 的独立状态

- 普通 Canvas 直接持有 `native.HTMLCanvasElement` 及自己的上下文缓存，不再用 OffscreenCanvas 包装普通 2D 上下文。
- width/height 设置采用 HTML Canvas 的数值转换，重建存储并重置绘制状态，同时保留上下文对象身份。
- 第一次成功创建上下文后锁定模式，重复获取返回同一对象；未知模式返回 null。
- 只有尚未创建上下文、尚未转移的普通 Canvas 可以调用 `transferControlToOffscreen()`。
- 转移后原 Canvas 进入占位状态，重新获取上下文、重复转移或直接设置尺寸均抛 `InvalidStateError`。
- 创建后的上下文不能再被转移，且 `.canvas` 不会意外指向内部离屏对象。
- 普通 Canvas 作为 `drawImage` / `createPattern` 图像源时保留真实色域、位深及透明度信息。

模块导出和 `installWebGLGlobals()` 均安装各自接口；内置 `document.createElement('canvas')` 返回使用 DOM 宿主路径的对象。保留项目原有的 `new HTMLCanvasElement(width, height)` Node 便利入口，这不表示浏览器允许直接构造 HTMLCanvasElement。

## 验证

新增 67 项 Chrome 对照覆盖构造器、原型、标签、instanceof、宿主绑定、模式锁定、尺寸转换、重置、转移限制、同类型方法借用、跨类型方法及属性拒绝，以及普通/离屏之间双向图像与图案复制。

另有 3 项本地测试直接验证原生类型隔离、首次创建上下文前的接口可用性、全局安装，以及旧 `_offscreen` 同名用户属性无法重定向普通画布存储。这些检查均纳入主回归。

最终 **6108 项**浏览器回归全部通过，新增 67 项逐值一致；3 项本地隔离测试通过。原始 demo 的 9216 个 RGBA 值零差异，Worker 并发和 GC 检查通过。已重新编译并更新 `webgl.node`。

```powershell
node --test tests/context-hosts.test.cjs
node test.js
```

最终验证及当前文件哈希保存在 [canvas-context-separation.json](canvas-context-separation.json)。本次范围是已有 2D 功能的宿主与接口分离；完整 DOM/CSS 布局、焦点绘制和异步离屏提交不在本次实现范围。
