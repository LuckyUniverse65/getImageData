# 第二十三轮：函数身份（name / length / toString）

为接入 5sFramework 做的前置修复。原先**每一个暴露出去的可调用对象**在 `Function.prototype.toString` 下都会泄露 JavaScript 包装器源码：

```
Chrome:  ctx.fillRect   name="fillRect"  length=4  "function fillRect() { [native code] }"
修复前:  ctx.fillRect   name=""          length=0  "function(...args){if(contextBrands.get(this)!==ContextType)…"
```

对照 Chrome 153.0.8010.48：**106 个可调用对象中 104 个不一致**。连内部标识符 `contextBrands`、`ContextType` 都可以被读到。

## 做法：Rust 侧的原生转发，不使用 toString 钩子

`src/webgl_native.rs` 新增 `nativeFunction(target, name, length, isConstructor)`：用 `napi_create_function` 造一个**真正的 Node-API 函数**，其数据指针持有目标 JavaScript 函数的引用；调用时 `napi_call_function` 透传 `this` 与参数，构造时 `napi_get_new_target` + `napi_new_instance`。

因为暴露出去的函数本身就是原生函数，`Function.prototype.toString` 自然返回 `function name() { [native code] }`——包括 `Function.prototype.toString.call(fn)` 这种绕过属性查找的写法。**不依赖任何 toString 钩子，也不污染 `Function.prototype`。**

引用生命周期绑在包装器上：`napi_wrap` 挂同一个指针并注册 finalizer，函数被回收时一并释放 `napi_ref`。

Node-API 函数的 `length` 恒为 0，所以在 Rust 里用 `napi_define_properties` 按 Web IDL 元数改写（属性位 `napi_configurable`，与浏览器的 `{writable:false, enumerable:false, configurable:true}` 一致）。

`index.js` 末尾新增 harden 阶段：遍历全部接口原型，把方法包成 `name` / arity 正确的原生函数，把访问器包成 `get x` / `set x`（getter 元数 0，setter 元数 1），并把每个类替换为原生构造函数——`Wrapper.prototype` 指向原类原型并改为只读、`prototype.constructor` 回指、静态方法逐个包装、`DOMMatrix`→`DOMMatrixReadOnly` 与 `DOMPoint`→`DOMPointReadOnly` 的静态继承链用 `setPrototypeOf` 还原。

全部 arity 取自 Chrome 实测（`arityTable` 探针，13 个接口 94 个原型方法），没有一个是猜的。

## 结果

| 项目 | 修复前 | 修复后 |
|---|---|---|
| 可调用对象与 Chrome 一致 | 2 / 106 | **106 / 106** |
| 原型方法 arity 与 Chrome 一致 | — | **94 / 94** |
| `new method()` 抛 TypeError | 否 | 是（与 Chrome 一致） |

顺带修掉一个由 harden 引入的回归：`DOMMatrixReadOnly.fromMatrix` 原先用 `this === DOMMatrixReadOnly` 判定，包装后 `this` 变成 wrapper，会错误返回 `DOMMatrix`。改为比对 `this?.prototype === DOMMatrixReadOnly.prototype`，`DOMPointReadOnly.fromPoint` 与 `matrixFromArray` 同样处理。

## 验收

| 项目 | 结果 |
|---|---|
| `node demo.js` | `true`，9216 个值零差异 |
| `node test.js` | 6108 项通过，`browserVerified: true`，所有 `Failures: []` |
| 第二十一轮 57 项探针 | 差异 0 |
| 第二十二轮 128 项探针 | 差异 2（均为此前已记录的已知偏差） |
| 独立测试 | 10/10 |
| `cargo build --release` | 0 告警 |

机器证据：[twentythird-round-fixes.json](twentythird-round-fixes.json)。

## 仍存在的三处差异

| 差异 | 说明 |
|---|---|
| 方法与访问器带 `arguments`、`caller` 自有属性 | `napi_create_function` 必定添加，且不可配置、删不掉。Chrome 只在 `Function.prototype` 上放毒化访问器 |
| 方法与访问器带 `prototype` 自有属性 | Chrome 的方法没有 `prototype`；Node-API 造的函数有，且不可配置 |
| `Object.getPrototypeOf(OffscreenCanvas)` | Chrome 是 `EventTarget`，本地是 `Function.prototype`；本项目未实现 `EventTarget` |

前两项无法通过 Node-API 消除。浏览器用的是 `v8::FunctionTemplate::RemovePrototype()`，该能力 Node-API 不暴露；要闭合就得绕过 Node-API 直接调 V8 C++ 接口（需要 node 的 V8 头文件与导出符号，且跨 Node 版本脆弱）。

同时注意：**bound 函数**（`fn.bind()`）的自有属性恰好是 `["length","name"]`、无 `prototype`、不可 `new`，结构完美，但 `toString` 会丢掉函数名（`function () { [native code] }`）。两条路只能二选一，本轮按「toString 优先」选择了原生函数。

这两项在本轮之前就已存在于所有原生方法上，不是本轮引入的回归。
