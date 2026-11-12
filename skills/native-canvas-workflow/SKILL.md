---
name: native-canvas-workflow
description: "维护 getImageData / lucky65_canvas 原生 Node.js Canvas 项目：Chrome 行为对齐、Rust/C++/Skia 构建、Windows 本机校准、Linux glibc 兼容与依赖打包、Canvas 复用与框架接入、回归验收和 npm/GitHub 分发。用于该项目及同类原生 Canvas 移植维护，不用于普通网页绘图。"
---

# 原生 Canvas 项目工作流

把会话中的实现经验用于当前代码和当前环境。先确认用户这次要做的工作，再选择下面的流程；不要因为加载了本 skill 就重新编译、连接 Chrome、修改消费项目或发布软件。

## 开始工作

1. 确定项目根目录，读取其现行指令、`git status --short`、`package.json`、`npm/package.json`、`readme.md`。以下代码路径均相对项目根目录，不相对 skill 安装目录。
2. 用 [项目地图与会话决策](references/project-context.md) 区分源码入口、本地分发包、公开 npm 包。确认实际 `require.resolve()` 指向；改源码不等于更新已安装模块。
3. 查用户当前目标：Windows 要求与当前电脑 Chrome 对齐；Linux 目前要求完整保留原项目接口并正常绘图，不要求与 Chrome/Windows 像素一致。这两类验收不可互相替代。
4. 修改前保存可恢复的基线。已有备份/推送授权时落实到可追溯提交；未授权外部写入时先保存本地基线，不把历史会话中的发布许可当作永久授权。不要用整树覆盖、`git reset --hard` 清除其他用户改动。
5. 历史文档只能提供线索。先核对当前路径和源码，再采用旧命令；尤其不要照搬交接文档中已完成的“待办”。

## 按任务读取

| 任务 | 必读资料 | 结果判据 |
| --- | --- | --- |
| 修复像素、参数、原型、异常、编码或 GC | [行为修复与回归](references/behavior-and-regression.md) | 对目标行为有探针/基线，受影响行为及必要回归通过 |
| Windows 一条命令本机构建、Chrome 校准 | [Windows 构建与 CDP](references/windows-build.md) | 最终候选二进制通过当前机器实际 Chrome 对照，证据与哈希对应 |
| Linux 移植、缺 `.so`、glibc 报错 | [Linux 构建与兼容](references/linux-build.md) | 最低 glibc 环境实际安装运行，依赖闭包与字体齐全 |
| demo 慢、HTTP 服务、复用 Canvas、接入既有 DOM | [性能与集成](references/performance-and-integration.md) | 正确区分冷启动/绘图/IPC，状态隔离和原有接口语义保持 |
| 打包、发布、GitHub 保存、发布状态核验 | [分发与发布](references/release.md) | 同一份精确 tgz 通过安装验收，线上版本及完整性实际核对 |
| 找历史结论或解释方案演进 | [文档与证据索引](references/sources-and-history.md) | 标明结论的版本、机器、测试范围和当前是否仍成立 |

## 跨流程不变量

- 保留用户选定的原生实现，不擅自换成另一个库来凑可用接口；原项目的完整接口也不等于浏览器所有标准均已实现。
- 对齐任务以同一目标 Chrome 的实际证据为准，不能只按规范猜测，也不能硬编码参考像素或测量值。
- CPU/GPU、字体、驱动、色彩空间变化都可能改变输出。优化或移植后按目标环境重新验证，不用一个 demo 推断所有绘图一致。
- 复用有效的 CDP 会话与既有授权；Linux 常规构建、npm 打包不需要 Chrome。失效连接不自动循环重连。
- 不靠删版本检查解决 ABI 错误，不让用户单独替换系统 glibc 来迁就发行包。编译环境、模块和动态依赖必须一起兼容目标基线。
- 不把 Canvas、上下文或模块导出的原生函数当作可克隆的 `workerData`。复用实例的进程持有所有权，调用方传参数、接收数据。
- 改源码后重新生成受影响产物；打包后再改内容则重新打包并验证该新 tgz。旧验证不能套用到新二进制。
- `npm publish` 返回成功、仓库公开、线上安装核验是三个不同状态。报告实际状态；接受发布后不要再次上传同一版本。

## 证据复核与交付

已有发布证据时可运行随 skill 提供的只读检查器：

```text
python <skill目录>/scripts/audit_release.py --project <项目根目录> --verification <verification.json> --ci <package-run.json>
```

它校验本地 tgz、构建源哈希和基础验收记录，不联网，不发布，不代替目标平台运行测试。可追加 `--publication <publication.json>` 核对已记录的线上验证；这也不代表刚刚查询了 registry。

最后说明改了什么、在哪些环境验证、使用哪份产物、是否已公开；给当前版本可执行的安装命令。把复现步骤与限制写回项目 `docs/`，用相对路径引用工程资料。后续更新此 skill 时同步项目副本与安装副本，并重新验证结构和脚本。
