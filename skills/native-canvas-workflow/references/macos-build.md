# macOS 原生构建与验收

0.4.0 为 macOS 新增原有 Rust/C++/Skia/内嵌 JS 的完整接口；Windows/Linux 的 ARM64 不因此获得支持。目标是正常绘图、接口一致，不要求与本机 Chrome 像素相同。

macOS 用 Skia CPU 和 `SkFontMgr_New_CoreText(nullptr)` 访问系统字体，不引入 Fontconfig/FreeType `.so`，也不启用 Metal。`selectedAdapter: null` 是 CPU 路径的正常结果。查看当前 `scripts/prepare-native.cjs` 的泛型字体映射，用诊断 `usedFonts` 核对真实回退字体，不凭字族请求判断实际命中。

构建入口 `npm run build:macos` 仅允许在 Mac 执行，避免在 Windows 上意外转入 Chrome 校准。准备 Xcode Command Line Tools、Git、Node22+、Python3.9+、Ninja、Rust/Cargo，保持 Node/Python/Rust 的架构一致。输出 `dist/canvas-darwin-x64/`、`dist/canvas-darwin-arm64/`，分别使用独立 Skia 缓存。配置与流程见 `scripts/build-macos.py`、`snapshot/macos-skia-args.gn`、`build.rs` 和工程 `docs/2026-11-14_macos-support.md`。

macOS 链接不能照搬 GNU `--start-group`、`-z defs`、`$ORIGIN` 或 `-lstdc++`；使用 Apple 静态归档链接、libc++ 以及 CoreText/CoreGraphics/CoreFoundation/ApplicationServices/AppKit 系统框架。Node-API 使用进程 `dlopen/dlsym`，macOS 不需要单独链接 libdl。

检查 `lipo -archs`、`otool -L`、`otool -l`，确保架构、最低部署版本与系统动态依赖匹配。`otool -L` 中自身 dylib 的 install name 应通过 `otool -D` 辨认，不误判成外部依赖。不能仅看产物扩展名就宣称兼容；两个架构都需真实运行完整 API、字体、编码、Worker 测试，再安装同一份 tgz 测试 CommonJS/ESM。

0.4.0 设定 macOS 14.0 为编译兼容目标。会话中 GitHub `macos-14` ARM runner 返回配置不受支持，改用 `macos-15`（arm64）、`macos-15-intel`（x64）。因此实测范围是 macOS15，而不是已经验证过macOS14或Rosetta。下一次先检查当前 runner 可用性，不能把标签永远固定成假设。

读取当前 `.github/workflows/macos-canvas-validation.yml`、`macos-package-validation.yml` 和 `scripts/macos-test-ci.py`。CI 辅助脚本仅操作专用测试分支；`--action start` 编译，`--action status` 读取结果并下载验收产物，`--action package` 安装精确 tgz。这些操作遵循当前用户的构建/远端写入授权，不因加载 skill 自动启动。

npm 入口按 `process.arch` 选择模块；Rosetta 的 x64 Node 应选 x64。拒绝旧 Darwin 版本、Windows/Linux ARM64 等不支持组合。平台分发模拟测试不能替代真 Mac 运行。发布前保留两个架构的源哈希、二进制哈希、OS/Node版本、实际字体和安装矩阵证据。公开状态以当次 registry 核验为准。
