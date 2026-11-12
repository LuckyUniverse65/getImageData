# Windows 本机构建与 Chrome 对齐

适用目标是当前 Windows 电脑的 Chrome 行为对齐。Linux 正常绘图和公开 npm 打包不需要执行这一流程。

## 准备与旧入口核对

要求 Windows 10/11 x64、Node 22+、MSVC x64 Rust/Cargo、VS C++ Build Tools/SDK、Chromium Clang、Python、GN/Ninja、CMake。原始通过环境的具体版本记录在工程 `docs/2026-09-22_windows-canvas-build.md`，不是所有新机器都必须使用相同安装路径。

先检查 `scripts/build-canvas.cjs`、`scripts/verify-machine.cjs`、`scripts/benchmark-demo.cjs`、`test.js` 的引用。会话结束时根 `demo.js/data.js` 已迁移或不存在，但部分脚本仍引用旧路径；实际示例在 `demo/`。恢复 Windows 完整构建前，要接通候选模块的 Node 入口及真正可在浏览器执行的探针，不能直接把含 `require('canvas')` 的 demo 当浏览器脚本。修正白名单使用方式后再启动完整任务。

上游固定 Skia 提交历史基线为 `4f574af2444846ceca4d277a8095c5d4229d175f`。读取 `snapshot/manifest.json`、`snapshot/windows-skia-args.gn`、`snapshot/skia-local.patch`；先 `git apply --check`，已应用时检查 reverse，避免重复补丁。迁移目录后重新生成 GN/CMake，不能复用旧绝对路径。

`scripts/configure-skia.cjs` 自动发现 VS/SDK，生成本机 GN 参数。绘图库包括 Skia、SkShaper、ICU bidi、Dawn 及 codec/allocator 静态库，精确列表以 `build.rs` 为准。PNG/JPEG/WebP/Wuffs 必须真正启用；`is_official_build` 加错误的 system codec 开关曾使编码器整体被关闭。历史 `snapshot/skia-args.gn` 不能替代当前 Windows 模板。

可配置 `CANVAS_SKIA_ROOT`、`CANVAS_SKIA_OUT`、`CANVAS_CLANG_ROOT`、`CANVAS_VCVARS`。构建前识别并清理此前手调的 backend/font/gamma 覆盖，不要静默把污染环境当校准结果。

## CDP 只复用有效连接

先执行只读状态查询：

```powershell
node capture-cdp.cjs --session-status
```

连接有效时复用。服务白名单在启动时加载，探针内容在采集时读取；优先使用 `scripts/capture-build-probe.cjs` 借用已有路径并在 finally 恢复，避免为新增路径重复重启连接；不要并发改同一个临时探针文件。

failed/disconnected 不自动循环 stop/start。需要恢复时解释真实状态，复用当前会话中已明确给予的恢复授权；缺少授权时让用户主动恢复。不要新开临时 Chrome/profile 来冒充本机参照，不重新开浏览器仅为了打包。连接 ID、Chrome 版本和探针哈希在同次验收中须一致。

## 正常构建

工具、库、路径和已授权 Chrome 会话准备好后：

```powershell
npm run build:canvas
```

流程应包含：环境检查与构建锁 → 本机字体/GPU/驱动收集 → Chrome 样本 → Graphite 与 raster 配置识别 → 默认字体/后端配置写入 → bundled 最终候选重编译 → 对最终候选实时对照 → Worker/GC/隔离包安装 → 成功后归档旧包并安装新本地包。

CPU fallback 是 GPU 表面失败或配置选择时的软件光栅路径。旧 Ganesh/ANGLE 是诊断路径，非 fallback；`libEGL.dll/libGLESv2.dll` 已移除，不作为新的运行依赖恢复。仅 WebGL renderer 字符串不能证明 Canvas 2D 的实际后端。

## 报告与成立范围

保留 `out/build-*/` 完整证据以及成功包的 `dist/canvas/environment.json`：

- `windows`：OS/CPU/显卡驱动及字体文件哈希。
- `chrome`：实际版本、连接与样本出处。
- `profile`、`nativeRuns`：默认配置、实际适配器/表面计数、真正使用的字体及版本。
- `tools/dependencies/sources/binarySHA256`：实际工具和源码/库/产物来源。
- `verification/packageSmoke`：候选验证、范围、误差和隔离加载结果。

可用字体清单不等于实际使用字体。相同配置可能生成相同二进制；不同电脑不必强求二进制不同。Chrome 版本不同时可尝试适配并实测，构建不会自动取得任意 Chrome 源码并修复全部行为。

失败不覆盖已验证分发包；陈旧构建锁只在确认对应进程结束后删除。`cargo build --release` + 拷贝 `webgl.dll` 只是开发模块重建，不是浏览器校准，也不是 npm 发布。
