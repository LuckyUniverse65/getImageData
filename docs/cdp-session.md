# 共用一次 Chrome 调试连接

旧采集脚本在每组用例前连接 Chrome，结束时断开，完整回归会创建六条连接。现在 `capture-cdp.cjs` 将任务交给隐藏的 Node 后台服务 `cdp-session.cjs`，通过本机命名管道通信。服务保持一条浏览器 CDP WebSocket，多个命令和多轮测试共用它；每次测试仍创建并关闭独立的后台标签页。

首次连接仍受 Chrome 的远程调试授权控制。已经允许且连接持续有效时，后续测试不再创建新连接。Chrome 关闭、调试被撤销或后台进程退出后，无法保证此前授权继续有效；脚本不绕过 Chrome 权限，也不自动反复连接。

## 日常使用

在用户手动打开并开启远程调试的 Chrome 上执行：

```powershell
node test.js
node capture-cdp.cjs tests/fourth-round-cases.js cdp-fourth-round
```

服务不存在时，首次测试会启动它；服务空闲且尚未连接时，只发起一次连接，最多等待 120 秒。测试结束后后台进程有意保持运行，继续复用已获准的连接，不启动 Chrome，不使用鼠标或键盘，不注册开机启动。

```powershell
node capture-cdp.cjs --session-status
node capture-cdp.cjs --session-stop
node capture-cdp.cjs --session-start
```

- `status` 只读状态，不启动服务、不连接浏览器。
- `stop` 关闭本项目后台会话，不关闭 Chrome。
- `start` 启动/复用服务并建立一次连接。已有连接时直接返回；失败状态不会重试，需先显式 stop。

PowerShell 入口对应为 `canvas-task.ps1 -Action SessionStatus`、`SessionStop`、`SessionStart`。`Capture` 和 `Test` 的调用方式不变。`CHROME_DEBUG_PORT` 区分不同端口的服务；默认 9222。后台日志位于 `out/cdp-session.log`。

状态依次为 `idle`、`connecting`、`connected`；失败或断开后保留 `failed` / `disconnected`，普通采集只返回该错误，不反复弹出新的连接请求。准备重新连接时显式 stop/start。采集结果新增 `connectionId`，可用于核实不同测试是否使用同一个服务会话。

## 验证

```powershell
node --test tests/cdp-session.test.cjs
```

6 项测试覆盖并发启动只连接一次、连续采集保持连接、授权失败/断开后不重连、采集错误后释放队列、独立 Node 客户端共用服务、脚本/端口校验，以及取消等待授权。这些是模拟连接和本机进程通信测试，不代表 Chrome 已实际连接；实际状态以 `--session-status` 的 `connected` 为准。

2026-09-15 已完成真实 Chrome 验证：单独采集与随后完整回归共用同一 `connectionId`，216 项全部一致，测试后连接仍保持。采集证据见[实时验收报告](2026-09-15_fourth-round-verification-report.md)。

服务仅接受项目列出的 Canvas 验证脚本，不提供任意 CDP 命令转发，也不监听面向网页的 HTTP 控制端口。
