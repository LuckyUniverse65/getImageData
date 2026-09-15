# 第四轮修复实时验收

2026-09-15，使用用户手动打开的 Chrome 153.0.8010.37，经 9222 CDP 完成全部实时验证：**216 项一致，demo 的 9216 个 RGBA 值零差异，渐变 GC 检查通过**。此前 29 个失败用例及新增 12 项边界检查均已通过，第四轮验收完成。

## 最后一项差异及修复

首次新采集发现 `textEmBaselinesFractionalArial` 在 `17.3px Arial` 下仍差 1/64 像素：空文本 top 基线度量为本地 `-13.421875`、Chrome `-13.40625`。其他 57 项一致。

原因是 [skia_canvas_typo_metrics](../src/skia_backend.cpp) 用原始字号归一化 OS/2 升降部，而字形绘图与度量使用 `resolve_font` 返回的字号。该字号已经过 Blink 字体缓存的百分之一像素精度处理。修复后使用 `font.getSize()` 作为 em 高度，再按 1/64 像素取整，使 top / middle / bottom 与字形共享同一字号。没有更改测试输入或加入数值容差。

算法参照 Chromium 对应版本的 [FontCacheKey](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.37/third_party/blink/renderer/platform/fonts/font_cache_key.h) 及 [SimpleFontData](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.37/third_party/blink/renderer/platform/fonts/simple_font_data.cc)。其余第四轮修改见[修复记录](2026-09-14_fourth-round-fixes-report.md)。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 原有用例 | 47/47 一致 |
| 第二轮 | 45/45 一致 |
| 第三轮 | 65/65 一致 |
| Unicode 独立防崩溃检查 | 1/1 一致 |
| 第四轮，含新增边界 | 58/58 一致 |
| demo.js | 9216 个 RGBA 值，0 差异，源码未修改 |
| 渐变强制 GC | 通过 |
| release 构建 | 成功，保留原有 11 条警告 |
| 完整测试及第四轮比较器 | 均退出 0 |

机器证据包含全部 Chrome 返回值、采集时间、运行编号、源码/原生产物 SHA-256 和比较结果：[fourth-round-verified.json](fourth-round-verified.json)。第四轮最终运行编号为 `3370bf97e77b47408a25c3837046964e`；原生模块 SHA-256 为 `DFEDC462D4F60C8D4D8E180C7AF63D7DB2BED40857F2AC2BCC931D15138C46BF`。

## 持久连接实测

本次首先恢复了一次已获用户允许的连接，随后单独采集第四轮、执行完整回归，均复用 `f823af05-4dbf-4e1f-b5f5-31251732a225`。完整回归中的六份采集记录具有同一个 `connectionId`，测试结束后仍保留后台连接。没有自动重连、启动新 Chrome 或操作鼠标、键盘、剪贴板。

连接生命周期与重启方式见[持久会话说明](cdp-session.md)。Chrome 重启或撤销调试权限后，服务不会反复尝试连接；那时仍可能需要一次新的浏览器授权。

## 复现

在当前项目目录、工具链齐全且现有 Chrome 调试会话有效时运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-fourth-round.cjs
node capture-cdp.cjs --session-status
```

这些结果证明已覆盖行为与当前 Chrome、字体和图形后端一致；完整 CSS Color、复杂文字及逐字形回退、其他 TextMetrics、Path2D、CanvasPattern 变换、跨线程 transferable 和完整 WebGL 仍未完整覆盖。
