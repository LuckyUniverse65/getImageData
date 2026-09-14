# 使用现有 Chrome 的 CDP 复核

> 历史复核记录：文中的 25 项差异和退出码描述属于修复前版本。后续修复已通过 92 项 CDP 对照，详见[当前修复报告](2026-09-14_offscreen-fixes-report.md)。本页保留此前采集编号和结论。


2026-09-14，连接用户手动开启远程调试的 Chrome 153.0.8010.37，端口 9222。默认测试已从桌面 F12 输入改为 CDP；F12 可以关闭。

## 操作方式

`capture-cdp.cjs` 使用 Node.js 22 内置 WebSocket，读取现有 Chrome profile 的 DevToolsActivePort，或查询本机调试端口。不会启动或重启浏览器。Chrome 的远程调试授权由用户手动完成。

连接后通过 Target.createTarget(background=true) 创建独立后台测试页，以 Runtime.evaluate 执行项目中的测试脚本，用 awaitPromise/returnByValue 直接读回数据。测试结果带本次运行编号与源码 SHA-256。结束或测试抛异常时，只关闭本次创建的标签页并断开连接。

不使用 SendInput、鼠标点击、剪贴板、标签页激活或已有页面导航。浏览器仍是用户原来的 Chrome/profile。旧桌面脚本保留为历史工具，node test.js 及 canvas-task.ps1 的 Capture/Test 不再调用它。

## 结果

| 检查 | 本次 CDP 结果 |
| --- | --- |
| 原有兼容性用例 | 47 / 47，与本地一致 |
| 渐变强制 GC | 通过 |
| demo | 9216 个 RGBA 值，0 个差异 |
| 第二轮边界检查 | 30 项中 5 项一致、25 项有差异 |
| 与先前 F12 比较 | 相同源码的全部 30 项浏览器返回值完全一致 |

因此，第二轮的 25 项差异在无桌面输入干扰的环境下仍然存在。本次仅切换验证通道并复核，绘图实现和原生模块未改变；新增缺陷尚未修复。结果及代码位置见[第二轮报告](additional-review.md)。

## 复现

保持用户 Chrome 运行，并启用 9222 远程调试：

```powershell
node test.js
node capture-cdp.cjs tests/additional-cases.js cdp-additional-review
node tests/compare-additional.cjs
```

最后一条命令当前退出码为 1，表示复现了 25 项差异。不是连接失败。

如需不同端口，设置 CHROME_DEBUG_PORT；如使用非默认 Chrome profile，设置 CHROME_DEVTOOLS_ACTIVE_PORT_FILE 指向该 profile 的 DevToolsActivePort。HTTP /json/version 返回 404 时，脚本可从该文件连接 WebSocket。连接或命令超时会报错，不回退到桌面操作或启动新浏览器。

## 本次证据

- 主回归：`out/cdp-verification-result.json`。
- 原始浏览器返回值：`out/cdp-compatibility-browser.json`、`out/cdp-demo-browser.json`、`out/cdp-additional-review-browser.json`。
- 第二轮当前差异：`out/cdp-additional-review-diff.json`。
- 可提交的本次摘要：[cdp-verification.json](cdp-verification.json)。
- 主回归采集编号：`774882e947d44c34a5df9ffadfabb126`。
- demo 采集编号：`c9bb96775e7e45ac924edb403fed9c89`。
- 第二轮 CDP 编号：`a3c47ea8a9754f9b81209b82cb9b0d3f`，时间 `2026-09-14T07:35:37.131Z`。
- 对照 F12 编号：`b8ba39eb823b4130b0697c6beb73185b`。

运行记录包含 Chrome 版本、源码哈希、运行编号和临时后台标签页 ID。没有将浏览器参考像素写回绘图实现。
