# OffscreenCanvas 状态、渐变与上下文修复

2026-09-14：修复六类兼容性问题，更新原生模块，并在用户手动打开的 Chrome 153.0.8010.37 / F12 中完成验收。47 项兼容性结果全部一致，原始 demo 的 9216 个 RGBA 值零差异，渐变强制 GC 检查通过。

## 修复前备份

修改实现前，已将当前工作区提交并推送到 `fix/offscreen-compatibility-20260914` 分支。备份提交为 [b7cc778](https://github.com/LuckyUniverse65/getImageData/commit/b7cc778)。原始 `demo.js` 和 `snapshot/` 保留原内容。

## 问题、证据与实现位置

| 问题 | 修复前证据 → 修复后行为 | 实现位置 |
| --- | --- | --- |
| 圆锥渐变不环绕 | 起始角 0 与 2π 得到不同颜色；先按双精度归一化角度，再旋转完整 SweepGradient，使正负整圈、负角和 34 弧度正确环绕。 | `src/webgl_native.rs` 渐变创建；`src/skia_backend.cpp` make_paint |
| 图像绘制使用旧状态 | globalAlpha=0 仍画出不透明红色，copy/source-over 切换也使用旧模式；drawImage 前同步当前画笔。0.5 透明度原来读回 127，现按 Blink 的 8 位量化规则得到 128。 | `src/webgl_native.rs` drawImage；`src/skia_backend.cpp` skia_canvas_draw_rgba_image |
| 描边命中使用旧状态 | lineWidth=4 时，同一点在 stroke 前 false、之后 true；命中测试同步当前状态，并通过 FillPathWithPaint 处理虚线及端点。 | `src/webgl_native.rs` isPointInStroke；`src/skia_backend.cpp` skia_canvas_point_in_path |
| 非法 globalAlpha 被截断 | 0.5 后赋 2 变成 1，NaN 污染状态；现忽略越界和非有限值，支持数值字符串转换，Symbol 抛 TypeError。 | `src/webgl_native.rs` set_canvas_property |
| 渐变缺少参数校验 | 负半径、NaN、Infinity、缺参被接受；现负半径抛 IndexSizeError，非有限参数及缺参抛 TypeError。先转换所有参数，再检查半径，与本次 F12 异常顺序一致。 | `src/webgl_native.rs` webidl_double 和渐变创建 |
| 上下文模式不互斥 | 一个画布可同时获取 2d、webgl、webgl2；现仅缓存首次成功创建的模式，其他模式返回 null，resize 后仍保持模式及对象身份。非法 OffscreenCanvas 名称抛 TypeError。 | `index.js` OffscreenCanvas.getContext |

透明度量化同时与本地 Chromium 参考源码 `CanvasRenderingContext2DState::SetGlobalAlpha` 一致：`ClampRound<uint8_t>(alpha * 255) / 255.0f`。无浏览器数组回填或按用例返回固定像素。

## 新增验证

新增 13 项结果，与原有 34 项共同运行：

- 渐变：径向负半径、数值转换、零半径、非有限值、缺参、异常优先级；圆锥渐变整圈、旋转和各象限的颜色。
- 透明度：非法赋值保留旧状态、字符串及 Symbol；drawImage 在状态变更和 save/restore 后使用正确透明度与合成模式；0、0.1、0.25、0.5、0.75、1 及半透明源图。
- 描边：绘制前后的命中结果、修改线宽、恢复状态、butt/round 端点、虚线与偏移。
- 上下文：2d/webgl/webgl2 互斥、对象身份、resize、非法名称及缺参后的恢复。

测试源码为 `tests/browser-cases.js`。`test.js` 运行本地行为断言，并逐项深比较本次浏览器结果；demo 由独立 Node 子进程执行，与 F12 独立执行产生的像素逐值比较。

## F12 采集与验收

窗口检测改为枚举实际顶层窗口，再按 Chrome 进程与 DevTools 标题筛选。这样不会漏掉同一个 Chrome 进程下、未被 Get-Process 选为主窗口的独立 F12。恢复最小化窗口后重新获取坐标，使用真实 Enter 键执行 Console 输入。

所有采集均来自用户原有 Chrome 进程 3668、窗口 `DevTools - chrome://new-tab-page/`。未启动新浏览器或切换 profile。剪贴板结束后恢复；运行编号与源码 SHA-256 用于校验结果来源。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

| 项目 | 本次结果 |
| --- | --- |
| 构建 | 成功，保留基线已有的 11 条 Rust 警告 |
| Chrome | 153.0.8010.37，user-visible-f12 |
| 兼容性 | 47 / 47，一致 |
| 渐变强制 GC | 通过 |
| demo | 9216 个 RGBA 值，0 个差异 |
| 兼容性采集 | feaf1fd08053400c85fda05742c11205，2026-09-14T06:56:43.8213528Z |
| demo 采集 | 01a9d41157a742ffb9c8120eb57ed4ae，2026-09-14T06:56:48.1698667Z |

结构化摘要及模块、源码哈希见 [offscreen-verification.json](offscreen-verification.json)。完整本地证据为 `out/verification-result.json`、`out/local-cases.json`、`out/compatibility-browser.json`、`out/demo-browser.json` 和对应的 `*-f12.png`。`out/pre-fix-cases.json` 保存修复前的新用例结果。

## 范围

本次没有扩展 bitmaprenderer、全部图像阴影/图像源、全部 CSS 颜色及字体、CanvasPattern 或完整 WebGL pipeline。上下文互斥适用于通过 `index.js` 导出的 Canvas 外壳；原生模块内的工厂函数不构成独立完整浏览器实现。

原 demo 无渐变色标，不能单独证明有色渐变正确。此次有色渐变由新增用例验证。此前 Chrome GPU 越界读回的透明填充差异仍按[原记录](canvas-fixes.md#chrome-越界读取差异)处理：该项使用同一手动 Chrome 的 CPU 读取作为参照，其余测试和 demo 使用默认后端。
