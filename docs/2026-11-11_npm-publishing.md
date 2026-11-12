# lucky65_canvas 原生跨平台发布流程

公开包名 `lucky65_canvas`，维护者账号 `lucky65`。`0.3.0` 使用本项目完整原生 Linux 实现；不再通过 `@napi-rs/canvas` 提供 Linux 功能。

`0.3.0` 历史发布证据位于 `out/npm-release-z7Ujaj/publication.json`。以下流程面向兼容 glibc 2.31、自带 Linux 运行库与兜底字体的 `0.3.2`，版本状态及验收见 [Debian 11 兼容说明](2026-11-12_debian11-compatibility.md)。

## 构建和验收

Windows 输入为 `dist/canvas/canvas.node` 及已校验的 `environment.json`。Linux 从相同源码构建，流程见 [Linux 构建说明](2026-11-11_linux-support.md)。本机没有可用 Linux 时，使用已授权的测试分支：

```powershell
python scripts/linux-test-ci.py --action start
python scripts/linux-test-ci.py --action status
```

辅助脚本通过 Git 已保存的凭据操作 `codex/linux-canvas-validation-*` 分支，不打印或存储凭据，不更新 main。Actions 完成后下载 Linux 原生文件、构建信息和测试结果到 `dist/canvas-linux`。

Windows 项目根目录打包：

```powershell
npm run pack:npm
```

脚本验证 Windows 历史构建报告、Linux 实际测试结果及二进制、运行库、字体哈希，再创建 `dist/lucky65_canvas-0.3.2.tgz`，检查精确文件清单，在隔离目录中安装实际 tarball，并验证完整 API、绘图、编解码、Worker 和 ESM。Windows demo 的 9216 个 RGBA 值与原二进制比对。脚本仅打包测试，不发布。

将这一份精确 tarball 安装到 Linux 运行器测试：

```powershell
python scripts/linux-test-ci.py --action package
python scripts/linux-test-ci.py --action status
```

测试覆盖 Ubuntu 22.04/24.04 × Node 22.13.1/24 四组，以及没有系统 Fontconfig 和字体的 Debian 11 × Node 22.13.1/22、Debian 12 × Node 22.13.1/24 四组，共八组。精简容器断网安装本地 tgz，并将包设为只读后绘图；Debian 11 任务明确检查 glibc 2.31。安装使用 `--ignore-scripts --omit=optional`，确认不依赖安装脚本或可选后端。提交时的 tgz SHA-256 被记录，下载结果时再次核对，防止发布未经测试的另一份包。

包内文件：

```text
package.json
index.js
canvas-win32-x64.node
canvas-linux-x64-gnu.node
linux-libs/*.so.*
fonts/*.ttf
fonts/*.otf
README.md
build-info.json
THIRD_PARTY_NOTICES.txt
```

两个 `.node` 都嵌入接口 JS、矩阵实现及 Float16Array 兼容实现。没有 npm 运行时依赖和安装脚本。根工程保持 `private: true`，发布对象始终为验证过的 tgz。

`build-info.json` 仅发布构建摘要及测试计数，完整机器路径、硬件清单和历史 CDP 标识不进入 npm。第三方许可证保留，项目自身授权不在本次移植中擅自修改。

## 发布

只有 Linux 与 Windows 的实际安装验收通过后才发布：

```powershell
npm whoami --registry=https://registry.npmjs.org
npm publish ./dist/lucky65_canvas-0.3.2.tgz --access public --registry=https://registry.npmjs.org
```

npm 若要求网页双因素验证，按终端链接完成并继续；不需要将密码、令牌或恢复码交给助手。出现发布成功后，不重复上传同版本。查询精确版本及 latest，检查线上 `dist.integrity` 与已测试 tarball 一致，并进行 registry 安装测试。

`out/npm-release-*/verification.json` 记录本地打包验收，`publication.json` 记录线上版本、完整性及发布状态。`verification.json` 的 `published: false` 仅表示打包步骤自身不执行发布。
