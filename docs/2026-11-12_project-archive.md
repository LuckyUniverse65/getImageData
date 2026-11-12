# 项目 skill、清理与 GitHub 归档

本次整理以已经发布并完成安装验收的 `lucky65_canvas@0.3.2` 为基线。没有重新编译或发布 npm，也没有重新连接 Chrome/CDP；历史验收记录不代表本次重新执行了所有平台测试。

## skill

项目副本位于 [skills/native-canvas-workflow](../skills/native-canvas-workflow/SKILL.md)，包含七份按任务读取的参考资料和只读发布证据核验脚本。内容结合项目会话、交接报告、现有代码及发布记录，覆盖行为修复、Windows 本机构建、Linux 完整移植、glibc 2.31、运行库/字体打包、性能、Canvas 复用、框架集成、测试和发布。

复制整个目录到 Codex 的 `~/.codex/skills/native-canvas-workflow/` 后，新会话可用 `$native-canvas-workflow` 调用。本机已经安装并逐文件核对 SHA-256；项目副本随 GitHub 保存。后续更新须同步两份。

skill 结构校验、内部 Markdown 链接检查和 UI 元数据检查通过。证据核验脚本用当前发布文件运行通过，也确认损坏安装包会被拒绝。

清理后重新执行 `node --expose-gc scripts/test-native-api.js ./dist/canvas/canvas.node` 通过：41 个导出、44 个上下文方法、PNG/JPEG/WebP、位图转换、float16、P3、30 轮生命周期和 4 个 Worker。9216 个 demo RGBA 值的 SHA-256 仍为 `13e5a02ac5a22db0361f7e10b4278ecab36e8776bcd61d5451c5f1f56c740348`。这次直接加载 `.node`，未重新验证 npm 消费入口的 ESM 导入；该项的原发布验收保留在版本证据中。

## 保留的当前产物与证据

| 路径 | 内容 |
| --- | --- |
| [dist/lucky65_canvas-0.3.2.tgz](../dist/lucky65_canvas-0.3.2.tgz) | 实际发布并验收的同一份 npm 安装包 |
| [dist/canvas/](../dist/canvas/) | 已校验的 Windows 构建产物及环境报告 |
| [dist/canvas-linux/](../dist/canvas-linux/) | Debian 11 构建的模块、10 个动态库、4 个字体、许可证与构建/测试报告 |
| [releases/0.3.2/](releases/0.3.2/) | 发布记录、打包验收、原生构建 CI、安装 CI 和八组 Linux 安装测试 |
| [releases/0.3.0/](releases/0.3.0/)、[releases/0.3.1/](releases/0.3.1/) | 对应旧版本的验收和发布证据；不再保留旧安装包 |
| [archive/2026-11-12-regression-evidence.zip](archive/2026-11-12-regression-evidence.zip) | 172 份旧浏览器基线、差异报告与 Windows 构建记录，归档前后逐文件核对哈希 |
| [archive/2026-11-12-cleanup.json](archive/2026-11-12-cleanup.json) | 实际删除路径、文件数、字节数、归档 SHA-256 和保留类别 |

0.3.2 安装包 SHA-256：`51736401374562d28f860ce859386a425a5205b366d7a237a360abe8295839df`。

原 `out/npm-release-I8NOgu/{verification,publication}.json` 已迁至 `docs/releases/0.3.2/`；对应 `out/linux-ci/` 记录也已迁入该目录。旧版发布文档中的临时目录和证据 JSON 内的绝对路径保留为历史来源，以本归档索引查找现有文件。

从项目根目录执行本地证据核验，无需网络、Chrome 或 Linux：

```powershell
python skills/native-canvas-workflow/scripts/audit_release.py --project . --verification docs/releases/0.3.2/verification.json --ci docs/releases/0.3.2/package-debian11-run.json --publication docs/releases/0.3.2/publication.json
```

核验版本、tgz 完整性、源码与二进制哈希、随包依赖和 ABI 下限。它核对已保存的测试记录，不会重新查询 npm，也不替代目标平台实际运行。

旧比较器仍使用 `out/` 路径。需要重放历史比较时，可以先在新克隆或空的 `out/` 环境恢复归档：

```powershell
Expand-Archive -LiteralPath docs/archive/2026-11-12-regression-evidence.zip -DestinationPath .
```

归档内路径包含 `out/` 前缀，因此解压目标是项目根目录。已有同名新结果时先保留它们，不使用 `-Force` 覆盖。历史 Chrome 基线只用于历史回放，不能冒充当前电脑的新 Chrome 校准结果。

## 删除范围与保留边界

删除约 2.16 GB（2.01 GiB）的旧散落文件：重复 npm 安装/测试目录、过时替代后端、未完成虚拟机下载、旧安装包、临时补丁脚本、下载的参考代码、构建中间文件和技能校验临时依赖。旧证据压缩归档约 28.1 MB；精确统计见清理清单。

源码、测试、集成示例、用户修改的 demo、现有根目录 `webgl.node`、构建脚本、上游配置快照和项目文档保留。历史交接文档及旧测试工具是可追溯资料，不能仅因年代较早而判为垃圾。

已搭建的 `third_party/` 上游源码、工具链、静态库及 `node_modules/` 本地运行依赖继续保留，避免破坏当前编译和演示环境。它们与本机编辑器/权限设置、凭据一样不提交 GitHub；GitHub 保存项目源码、脚本、配置快照、文档、skill、当前可安装产物和归档证据。其他电脑准备完整构建环境仍按构建文档操作；直接使用可安装已发布 npm 包。

清理本身没有修复 README 已说明的旧 Windows 完整校准入口中 `demo.js` / `data.js` 路径问题。不能把本次发布证据复核描述为该旧全量流程已重新通过。
