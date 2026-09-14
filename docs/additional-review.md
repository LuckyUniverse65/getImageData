# OffscreenCanvas 第二轮兼容性检测

> 历史检测记录：以下描述修复前的 25 项差异。2026-09-14 已完成修复并扩充测试，现有 Chrome CDP 验证为 92/92 一致，详见[修复报告](2026-09-14_offscreen-fixes-report.md)。原始证据保留不变。


2026-09-14，在提交 `c25932d` 的绘图实现和原生模块上新增 30 项定向检查。与用户手动打开的 Chrome 153.0.8010.37 / F12 比较后，25 项存在差异，5 项一致。这是针对未覆盖边界的检查，不是随机采样，不能把 25/30 当作整体错误率。

本轮保留绘图实现与 `webgl.node`，新增检测脚本和证据报告。F12 采集脚本仅增加排除 Node.js 调试窗口的条件，以继续使用原来的 Chrome 页面 DevTools。

随后已通过现有 Chrome 的 9222 CDP 重新运行这 30 项检查，全程不使用鼠标、键盘或剪贴板。全部浏览器结果与原 F12 采集相同，25 项差异均可复现，见 [CDP 复核记录](cdp-verification.md)。当前默认验证入口已切换为 CDP。

## 优先处理的问题

| 问题 | 触发与本地结果 | 同一 Chrome/F12 结果 | 根因位置 |
| --- | --- | --- | --- |
| 空路径裁剪无效 | `beginPath(); clip(); fillRect(...)` 仍能画出红色 | 全部透明；空路径应把裁剪区变为空 | [Rust clip](../src/webgl_native.rs#L1280) 仅在保留路径非空时调用 Skia clip |
| copy 合成遗漏区域外清理 | 先铺红色，再以 copy 画小蓝块，蓝块外仍为红色；drawImage 同样保留旧背景 | 当前裁剪区内、源图形外的像素变透明；裁剪区外保持旧内容 | [Skia make_paint](../src/skia_backend.cpp#L420)、[drawImage](../src/skia_backend.cpp#L1104) 仅设置 kSrc，没有完整处理源图形外区域 |
| setTransform 重载未实现 | 对象 `{a:2,d:3,e:4,f:5}` 被忽略；平移后调用无参 setTransform 也不复位 | 对象得到 `[2,0,0,3,4,5]`，无参恢复单位矩阵 | [Rust setTransform](../src/webgl_native.rs#L1125) 仅接受至少六个参数 |
| alpha:false 被忽略 | 初始像素及 clearRect 后都是 `[0,0,0,0]`，getContextAttributes 返回 undefined | 都是 `[0,0,0,255]`，属性报告 alpha:false | [原生上下文工厂](../src/webgl_native.rs#L1401) 没有处理 attributes；surface 使用透明 alpha |
| 图像负尺寸被当作不绘制 | drawImage 的源宽高或目标宽高为负时得到透明 | 规范化矩形后正常绘制红色，像素顺序不翻转 | [Skia 图像入口](../src/skia_backend.cpp#L1087) 拒绝负源尺寸，负目标矩形未归一化 |
| 图像默认采样错误 | 将红蓝二像素放大后，边界仍为纯红、纯蓝 | 默认平滑采样得到 `[159,0,96,255]` 和 `[96,0,159,255]` | [Skia 图像采样](../src/skia_backend.cpp#L1106) 固定使用默认 SkSamplingOptions，即最近邻 |

`imageSmoothingEnabled` 也没有实现：本地初始为 undefined，save/restore 后赋值仍为 false；浏览器初始和恢复后均为 true。需要一起实现属性、保存恢复和采样选择，单独更换默认过滤器无法覆盖这一问题。

## 参数、像素和文字接口

| 问题 | 具体证据 | 根因位置 |
| --- | --- | --- |
| 普通绘制缺少数值转换 | `fillRect('0','0','4','4')` 本地不绘制，Chrome 绘制红色 | [number](../src/webgl_native.rs#L327) 直接读取 double，忽略非数值类型读取失败；渐变中已补的转换尚未覆盖普通绘制 |
| setLineDash 不保留非法输入前的状态 | 先设 `[3,4]`，再设 `[2,-1]`，本地变为 `[2,2]`；Chrome 保留 `[3,4]` | [setLineDash](../src/webgl_native.rs#L1126) 先清空，再筛掉非法元素 |
| setLineDash 不支持普通可迭代参数 | Float32Array([2,3]) 本地得到空数组，Chrome 得到 `[2,3]` | 同上，仅使用 N-API 数组接口 |
| createImageData 尺寸处理错误 | `(-2,-3)` 本地得到 0×0，Chrome 得到 2×3、24 字节；`(0,2)` 本地返回对象，Chrome 抛 IndexSizeError | [createImageData](../src/webgl_native.rs#L1184) 将负数截为零，缺少零尺寸异常 |
| putImageData 负 dirty 尺寸被忽略 | dirty 矩形 `(2,2,-2,-2)` 本地不写像素，Chrome 正常写入 | [putImageData](../src/webgl_native.rs#L1197) 遇负宽高直接返回，没有调整起点 |
| putImageData 小数坐标向下取整 | 单红像素放到 `(-0.5,-0.5)` 本地在画布外，Chrome 写到 `(0,0)` | 同上使用 floor，应按接口要求向零截断 |
| fillText 忽略 maxWidth | 16×16 画布、12px Arial，`fillText('MMMM',0,12,4)` 在 x≥5 仍有 89 个非透明像素；Chrome 为 0 | [fillText](../src/webgl_native.rs#L1139) 未读取第四个参数 |
| 空文字边界非零 | measureText('') 的实际上/下边界本地约为 11.6/2.88；Chrome 都为 0 | [measureText](../src/webgl_native.rs#L1141) 把字体度量充当字符串实际边界 |
| 非法 font 覆盖有效值 | `'12px Arial'` 后赋 `'invalid'`，本地接受该字符串；Chrome 保留原字体 | [font setter](../src/webgl_native.rs#L870) 未验证 CSS 字体格式 |
| arcTo 负半径未抛异常 | `arcTo(0,0,1,1,-1)` 本地接受，Chrome 抛 IndexSizeError | [arcTo](../src/webgl_native.rs#L1089) 将负半径截为零 |
| scale 缺参被当作等比缩放 | `scale(2)` 本地缩放为 2×2，Chrome 抛 TypeError | [scale](../src/webgl_native.rs#L1120) 自动用 sx 补 sy |
| Canvas 构造与尺寸缺参规则错误 | `new OffscreenCanvas()` 本地返回 300×150，Chrome 抛 TypeError；width=undefined 本地改为 300，Chrome 抛 TypeError | [JS 包装](../index.js#L9) 提供 HTML canvas 风格的缺省尺寸 |

## 本轮一致的检查

`negativeFillRect`、`negativeClearRect`、`gradientCreationTransform`、`gradientDrawTransform`、`zeroCanvasRead` 的结果与本次 Chrome/F12 一致。尤其是零尺寸画布读取，本次 Chrome 返回透明像素，本报告没有根据假设把它列为异常。

上一轮修复已验证的 47 项没有被本轮诊断替换。这些新增差异来自另一组边界用例；本轮未重建原生模块。

## 复现与证据

在项目根目录运行，使用已开启远程调试的现有 Chrome；F12 可以关闭：

```powershell
node capture-cdp.cjs tests/additional-cases.js cdp-additional-review
node tests/compare-additional.cjs
```

比较脚本会验证浏览器模式及测试源码 SHA-256，执行当前本地模块并逐项比较。检测到差异时退出码为 1；这代表已发现不一致，不是采集失败。

- 用例：[additional-cases.js](../tests/additional-cases.js)。
- 比较器：[compare-additional.cjs](../tests/compare-additional.cjs)，当前读取及输出 `out/cdp-additional-review-*.json`。
- 本次完整差异：[additional-review-results.json](additional-review-results.json)。
- 原始浏览器证据：`out/additional-review-browser.json`、`out/additional-review-f12.png`。
- 本地结果：`out/additional-review-local.json`；比较输出：`out/additional-review-diff.json`。

本次浏览器采集编号 `b8ba39eb823b4130b0697c6beb73185b`，时间 `2026-09-14T07:16:10.0375721Z`，进程 3668，标题 `DevTools - chrome://new-tab-page/`。没有使用新浏览器、Node.js DevTools 或历史浏览器数组。

原生模块 SHA-256 为 `5478C15749BC2EC8E493E38B8248D73C0188703A032064FB53F6AF38F414B5DD`，与上一轮已上传的修复产物相同。
