# 文档来源与历史边界

以下路径相对项目根目录。skill 提供可直接执行的决策流程，工程文档保存细节和原始证据；找不到原文时明确缺少依据，不能编造已执行结果。

## 文档索引

| 工作 | 工程资料 |
| --- | --- |
| 最新 API、安装与平台边界 | `readme.md`、`npm/README.md`、`snapshot/native-api-contract.json` |
| 原始目标、21–23轮演进、旧待办 | `docs/2026-09-22_session-handoff.md`，只当历史，不把已完成任务再执行 |
| Windows 工具链、校准和证据字段 | `docs/2026-09-22_windows-canvas-build.md`、对应 verification.json、`snapshot/` |
| 持久连接与授权语义 | `docs/cdp-session.md`、`docs/cdp-verification.md`、`tests/cdp-session.test.cjs` |
| 编码失败及 fallback 删除 | `docs/2026-09-22_png-encoding-null.md`、`docs/png-removal-verification.json` |
| 2D host 类型分离 | `docs/2026-09-17_canvas-context-separation.md`、`tests/context-hosts.test.cjs` |
| 复杂数值/颜色/文本/几何回归 | `docs/2026-09-14_*` 至 `docs/2026-09-17_*` 的 review/fixes 报告，按主题用 rg 查找，配对其探针与比较器 |
| 新接口、返回对象与函数身份 | `docs/2026-09-21_twentyfirst-round-fixes-report.md`、`...twentysecond-round-features-report.md`、`...twentythird-round-function-identity-report.md` |
| 手动接入既有 DOM | `docs/2026-10-20_5sFramework-canvas-replacement.md`、工程 `integration/`；旧绝对路径和行号重新定位 |
| 完整 Linux 原生移植 | `docs/2026-11-11_linux-support.md` |
| 运行库和字体闭包 | `docs/2026-11-12_linux-bundled-runtime.md`，0.3.1 历史验收 |
| Debian 11 最低基线 | `docs/2026-11-12_debian11-compatibility.md` |
| 发布操作 | `docs/2026-11-11_npm-publishing.md`、当前 CI/workflow 与 pack 脚本 |

检索示例：`rg -n 'alpha|premultipl|float16|font|GC|溢出|裁剪' docs -g '*report.md'`。不要用所有旧报告的测试数量相加冒充当前验收数量。

## 需要避免的历史回退

| 阶段 | 当时发生的事 | 现在的含义 |
| --- | --- | --- |
| 原始 Windows 阶段 | 默认 Graphite/Dawn/D3D11，与本机 Chrome 153 对照；ANGLE 用于诊断 | Chrome 版本与机器是特定基线；CPU fallback 不等于 Ganesh |
| PNG/DLL 清理与 bundled | 删除 JS PNG fallback 和 ANGLE DLL；内嵌接口及 Float16Array，输出本机环境报告 | 旧交接中的“待删除/待嵌入/Node22降级选项”已被后续实现取代 |
| demo/接入/性能 | 常驻服务、直接替换 Canvas 路径、分离服务持有 Canvas | 原生函数不可结构化克隆；保留每次真实绘图与状态重置 |
| npm 0.2.0 | Linux 曾用 napi-rs/canvas 替代适配，原 API 不齐全 | 已否决，不能当作完整移植捷径 |
| npm 0.3.0 | 同一 Rust/C++/Skia/JS 原生移植，41 导出/44 方法 | 仍依赖系统 Fontconfig，glibc 基线为 2.35 |
| npm 0.3.1 | 10 个动态库、4 个字体随包，精简容器可运行 | 没有消除 glibc 2.35 下限，不能只删除检查 |
| npm 0.3.2 | Debian11 重编译，检查全部 GLIBC 需求，8组 Linux 验收 | glibc 2.31+；不是所有 Linux/CPU 架构都支持 |

## 最近已发布版本的历史锚点

0.3.2 在本次会话中已公开并核验：

- 原生构建：GitHub Actions `43168390974`。
- 八组安装测试：GitHub Actions `43169892389`。
- 仓库：`LuckyUniverse65/getImageData`；公开包 `lucky65_canvas`，当时维护者账号 `lucky65`。
- tgz SHA-256：`51736401374562d28f860ce859386a425a5205b366d7a237a360abe8295839df`。
- 当前证据归档于 `docs/releases/0.3.2/`，包含 `verification.json`、`publication.json`、`native-debian11-run.json` 和 `package-debian11-run.json`。清理前路径分别是 `out/npm-release-I8NOgu/` 与 `out/linux-ci/`。
- 当前安装包与构建产物保存在 `dist/`；历史浏览器基线及恢复命令见 `docs/2026-11-12_project-archive.md`。归档保留当时证据中的原始路径，并不表示旧临时目录仍存在。

以上用于查找/验证历史，不是下次发布的固定版本、永久账号授权或当前 registry 状态。
