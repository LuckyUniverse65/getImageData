# OffscreenCanvas 第十六轮实现检查

2026-09-16：当前 `demo.js` 输出 `true`，其 9216 个 RGBA 值与现有 Chrome 153.0.8010.48 实时一致。原有 1245 项回归全部通过，但新增 50 项边界检查中 **36 项一致、14 项存在差异**。因此当前示例通过，底层实现仍有兼容性问题。

本轮只修改测试并保存检查证据，没有修改 `demo.js`、`index.js`、Rust/C++ 实现或 `webgl.node`。新增检查通过独立比较器运行，尚未纳入 `test.js` 的通过断言。

## 实现与检查范围

Node 调用链为 `demo.js → index.js → webgl.node / src/webgl_native.rs → src/skia_backend.cpp → Skia Graphite / Dawn D3D11`。浏览器分支使用浏览器自身的 OffscreenCanvas。

本轮检查了空渐变、单色标渐变、退化渐变、零半径和零扫角圆弧、大角度、文字 maxWidth，以及 copy 模式下的零尺寸矩形。未将“14 个失败用例”解释为 14 个独立根因。

## 已确认的问题

| 优先级 | Evidence：触发与结果 | Finding：问题与原因 | Path：代码位置 |
| --- | --- | --- | --- |
| P1 | `zeroRectCopy_fillRect_0,0`、`zeroRectCopy_strokeRect_0,0`：先填满红色，再设 copy，绘制 0×0 矩形。本地 1024 个像素全部清空，Chrome 保留全部红色；每例 2048 个 RGBA 分量不同。 | 零宽且零高的矩形应提前返回。本地直接进入 copy 绘制，`draw_with_shadow` 在实际图形绘制前清空目标。 | `src/skia_backend.cpp:581`、`:1340`、`:1357` |
| P1 | `degenerateGradient_linearSame_{1,2}`、`degenerateGradient_radialSame_{1,2}`：线性渐变两端点相同，或径向渐变两圆相同，添加 1/2 个色标后填充。Chrome 全透明，本地绘制实色和阴影；每例 1528 个分量不同。 | 未将 Canvas 退化渐变转换为透明着色器，直接使用 Skia 的退化处理。例：linearSame_1 中心像素本地 `[255,0,0,255]`，Chrome `[0,0,0,0]`。 | `src/skia_backend.cpp:506`，尤其 `:519`、`:523` |
| P2 | `zeroRadius_arc_false`、`zeroSweepCurrentPoint_arc`：空路径中调用零半径/零扫角 arc，随后 lineTo。本地错误从原点连线；另有 `zeroRadius_ellipseBoth_false`、`zeroSweepCurrentPoint_ellipse` 的线段像素差异。 | arc 空路径分支直接调用 `addArc`，退化时没有正确建立当前点。ellipse 同样缺少 Canvas 对退化参数的专门处理；其具体抗锯齿差异还需在修复时进一步核对。 | `src/skia_backend.cpp:1280`、`:1287`、`:1298` |
| P2 | `anglePrecision_arc_100000000`、`anglePrecision_arc_100000000000000000000`：分别有 65、49 个分量不同。后者 start 与 end 在 JS 中已相等，Chrome 没有绘制像素，本地仍绘制了弧线。 | 浮点归一化 `end += new_start - old_start` 存在消减误差，没有保持零扫角语义；参数还在 Rust 到 C++ 边界提前转为 float。最终 arc 空路径 `addArc` 分支放大了退化差异。 | `src/skia_backend.cpp:436`、`:445`、`:1287`；`src/webgl_native.rs:1351` |
| P2 | `degenerateGradient_linearNormal_1`、`degenerateGradient_conic_1`：一个红色色标配合 lime 阴影、blur=3、offsetX=3，分别有 18 个分量不同，例如绿通道本地 255、Chrome 254。 | 单色标渐变的阴影存在精确像素兼容差异。代码对所有渐变统一设置 dither，且与其他样式共用阴影画笔；尚未通过修改实验确定这 18 个分量的唯一根因。 | `src/skia_backend.cpp:506`、`:535`、`:552` |

P1 表示正常调用可能明显改变画面或清空已有内容；P2 表示特定边界或精确像素兼容问题，不是安全漏洞评级。

## 最小复现

以下 Node 示例在项目根目录执行。Chrome Console 中运行时，去掉 `require` 那一行即可使用原生 API。

```javascript
const { OffscreenCanvas } = require('./');
const g = new OffscreenCanvas(8, 8).getContext('2d');
g.fillStyle = 'red';
g.fillRect(0, 0, 8, 8);
g.globalCompositeOperation = 'copy';
g.fillRect(2, 2, 0, 0);
console.log(Array.from(g.getImageData(0, 0, 1, 1).data));
// 本地：[0, 0, 0, 0]；Chrome：[255, 0, 0, 255]
```

```javascript
const { OffscreenCanvas } = require('./');
const g = new OffscreenCanvas(8, 8).getContext('2d');
const gradient = g.createLinearGradient(2, 2, 2, 2);
gradient.addColorStop(0, 'red');
g.fillStyle = gradient;
g.fillRect(0, 0, 8, 8);
console.log(Array.from(g.getImageData(4, 4, 1, 1).data));
// 本地：[255, 0, 0, 255]；Chrome：[0, 0, 0, 0]
```

完整检查与比较：

```powershell
node demo.js
node test.js --local
node test.js
node capture-cdp.cjs tests/fourth-round-cases.js cdp-sixteenth-round
node tests/compare-sixteenth-round.cjs
```

最后一个命令在当前实现上预期退出 1，并报告 `tested=50, matched=36, differing=14`。需要现有 Chrome CDP 会话。只运行新增本地检查用 `node tests/compare-sixteenth-round.cjs --local`；该命令没有浏览器对照，不代表用例通过。

## demo 本身的注意点

- 所有渐变均未调用 `addColorStop`，填充为透明；可见内容主要由默认黑色描边及其阴影产生。不能把空渐变没有彩色填充误判为实现故障。
- `createConicGradient(34, 47, 1, 37, 59, 245)` 只使用前三个参数，即角度 34 弧度、中心 `(47, 1)`；其余参数被忽略。这是 API 调用的含义，不是六参数径向渐变。
- `aanotafontaa` / `aanotafont` 是不存在的字体名，实际使用系统回退字体；像素基线依赖字体和图形后端。
- `gl`、`gr`、`xx`、`data` 未声明，依赖非严格脚本中的全局赋值；改为严格模式或 ES module 会报错。这与底层绘图错误分开看待。

## 证据

- [检查摘要与源码 SHA-256](sixteenth-round-review.json)。
- 完整本地结果：`out/cdp-sixteenth-round-local.json`。
- 完整浏览器结果：`out/cdp-sixteenth-round-browser.json`。
- 逐项差异：`out/cdp-sixteenth-round-diff.json`。
- 新用例：`tests/fourth-round-cases.js` 中 `runSixteenthRoundCases`；比较器：`tests/compare-sixteenth-round.cjs`。
- 第一次浏览器 runId：`182467ccbff9412a8bcdb39c5240324b`。主回归独立采集 runId：`c12c68145a17489180a3b095d5656152`，其中新增 50 项的浏览器结果与第一次逐项相同。
- demo 实时 runId：`07c90706db49433398024abf0bde6a71`，9216 个值零差异。
- 两次采集复用已连接的 Chrome 153.0.8010.48，会话 ID `3f3dfe73-4928-4759-ad39-cd214de31a22`；只使用临时后台测试标签页。

这些结论适用于本次 Windows、字体和图形后端环境及列出的调用。修复应优先处理 copy 意外清空和退化渐变，再处理圆弧退化、角度归一化与单色渐变阴影。
