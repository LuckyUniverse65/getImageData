# 构建备份、打包与正式发布

## 先确定权限与产物

按当前用户目标执行 GitHub 备份/CI/npm 发布。当前会话已明确授权的步骤继续完成，不重复问同一个权限；本 skill 的历史发布记录不授权新会话自动推送、登录或发布。不要把清理任务扩展到删除工具链或消费工程。

`git status` 核对用户文件和敏感配置。备份可追溯源码、配置、文档与必要二进制；`node_modules/third_party/target` 通常是本地依赖/缓存，不直接全部提交。清理前将唯一有效的构建报告、发布证据和需要保留的制品归档，保留现有编译所需环境。`git add -A` 前审查实际新增/删除和忽略规则，不能把“全部上传”理解为上传凭据或所有缓存。

## 版本同步与 Windows/Linux 输入

公开版本以 `npm/package.json` 为准。查官方 registry 后选择未发布版本；同步本地 Linux 包版本、CI 的 RELEASE_TARBALL、文档、以及任何验证助手中的固定版本。查找旧值定位后逐项判断，历史报告里的旧版本和哈希应保留。

打包输入：

- Windows `dist/canvas/canvas.node` 和 `environment.json`：成功状态、browserVerified、哈希对应。仅 Linux 改动可继续使用已验收 Windows 二进制；共享 Windows 行为变更则重建并验证 Windows。
- Linux `dist/canvas-linux/`：实际 Linux 构建/test-result、源码/二进制/随包文件哈希、glibcRequirements、字体和许可证完整。
- `npm/index.js/package.json/README.md`：声明和真实功能一致，根工程继续 private。

## 精确打包与安装测试

```powershell
npm run pack:npm
python scripts/linux-test-ci.py --action package
python scripts/linux-test-ci.py --action status
```

pack 脚本核对来源后生成 `dist/lucky65_canvas-<版本>.tgz`，检查文件白名单，在隔离消费目录安装这份 tgz 并跑 Windows API/绘图/编码/Worker/ESM。Linux package CI 安装同一份 tgz；SHA-256 在上传和下载报告时核对。完整 Linux 矩阵见 [Linux 说明](linux-build.md)。

CI 辅助脚本只操作 `codex/linux-canvas-validation-*` 测试分支，不自动更新 main。`out/linux-ci/run.json` 会被下一次任务覆盖，成功后归档有版本/用途的记录。结果必须属于本次 run、版本和 tgz，不能混用目录里上一版残留 JSON。

会话中 25 MB tgz 单次 GitHub API 上传返回过 401，而小请求身份仍有效；改为 4 MiB 分块、CI 合并并校验 SHA-256 后成功。遇到类似错误先区分有效登录、上传失败与真正凭据失效；不要把这一经验当作所有 401 的原因，也不要无限重试。

包内保留两个平台 `.node`、入口、说明、构建摘要、licenses、linux-libs 和 fonts。不要发布完整本机环境报告里的私有路径、硬件清单或 CDP 标识。改过 tgz 内容必须重跑对应安装验收；不能把测试后重新打的包当同一份发布。

## npm 身份与发布状态

以下是 PowerShell 示例，使用已经验证的实际路径替换版本变量：

```powershell
$releaseVersion = (Get-Content npm/package.json -Raw | ConvertFrom-Json).version
$releaseTarball = "./dist/lucky65_canvas-$releaseVersion.tgz"
npm whoami --registry=https://registry.npmjs.org
npm publish $releaseTarball --access public --registry=https://registry.npmjs.org
```

发布权限失败先核验 whoami 与版本是否已存在。会话中 PUT 404 实际对应已失效登录，whoami 返回 401；用 `npm login --auth-type=web --registry=https://registry.npmjs.org` 恢复。网页登录成功后 npm 仍可能单独要求本次发布验证，清楚说明这两个平台步骤不同。只给用户真实工具返回的验证链接，不记录密码/令牌/恢复码，不在 skill 保存过期认证 URL。

提交已被接受并返回 `+ 包名@版本` 后，即使显示 processing，也不要再次 publish 同一版本。定期只读查询精确版本、dist.integrity 和 latest；等待外部处理时报告“已提交，未公开”。一次权限失败不能直接声称发布完成。授权确需更新时把已经验收的具体 tgz 和错误原因交给用户，而不是再次索取泛化“全部权限”。

## 上线核验与归档

1. 查询官方 registry 的精确版本、latest、integrity，与本地测试的 tgz 比较。
2. 在独立消费目录从官方 registry 安装精确版本，检查 lockfile 来源和 integrity；比较两平台二进制及库/字体的 SHA-256。
3. 验证实际安装后的模块加载、像素、codec、Worker、ESM。线上包与 Linux 已测 tgz 完全相同时使用该 Linux 测试证据，不伪称在用户服务器上安装过。
4. 记录 publication.json：版本、时间、registry、观察到的 latest、tgz 哈希、integrity、CI URL、文件哈希、安装验收。verification.json 的 published:false 只表示 pack 自身未发布，不与后来 publication:true 冲突。
5. 更新工程 README 和发布文档的当前状态。若 GitHub README 没更新，核对仓库、目标分支、实际文件名和推送提交，不假定本地修改已出现在默认分支。

保留原生构建、Windows package smoke、每组 Linux 测试、精确 tgz 与发布记录之间的证据链。新任务从当前资料核验，不把 0.3.2 当永远的 latest。
