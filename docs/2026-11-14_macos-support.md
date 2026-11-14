# macOS 原生 Canvas 适配

`0.4.0` 为 macOS 增加原项目的完整原生实现，包含 Intel x64 和 Apple Silicon arm64。使用 Skia CPU 光栅化、CoreText 系统字体，不要求 Chrome、GPU、Fontconfig 或 Homebrew 运行库。不以另一套 Canvas 库替换接口，也不承诺与 Chrome 逐像素一致。

当前状态：原生构建和 Windows/Linux/macOS 安装验收全部通过；npm 登录返回 401，正在等待维护者恢复登录，0.4.0 尚未公开。可使用仓库内已经验收的 tgz；发布状态见 `docs/releases/0.4.0/release-status.json`。

## 安装和使用

源码仓库内已有构建产物时，可先用本地包安装，无需等待 npm 公开发布：

```bash
npm install ./dist/lucky65_canvas-0.4.0.tgz
```

公开发布后安装：

```bash
npm install lucky65_canvas@0.4.0
```

```js
const { OffscreenCanvas } = require('lucky65_canvas');
const canvas = new OffscreenCanvas(200, 60);
const ctx = canvas.getContext('2d');
ctx.font = '24px sans-serif';
ctx.fillText('Hello 中文', 8, 38);
console.log(ctx.getImageData(0, 0, 200, 60).data.length); // 48000
```

旧代码使用 `require('canvas')` 时用 `npm install canvas@npm:lucky65_canvas@0.4.0`。npm 安装包直接携带两个 macOS `.node`，安装时不编译、不下载额外二进制。

| 项目 | 范围 |
| --- | --- |
| macOS | 编译最低目标 14.0；实际 CI 在 macOS 15 上验收 |
| CPU | Intel x64、Apple Silicon arm64，按 Node 的 `process.arch` 选择 |
| Node | 22+；安装验收覆盖 22.13.1 和 24 |
| 渲染 | Skia CPU；系统 CoreText 字体与字符回退 |
| 动态库 | 仅 `/usr/lib/` 与 `/System/Library/` 的系统库和框架 |
| 接口 | 与现有 Windows/Linux 相同的 41 个导出、44 个 2D 上下文方法 |

macOS 14 的 GitHub runner 已不可用，因此“14.0 最低编译目标”不代表已经在 macOS 14 实机测试。Rosetta 下的 x64 Node 会加载 x64 模块；此次两种架构分别在对应原生机器上测试，未额外测试 Rosetta 转译。Windows/Linux 的 ARM64 仍不支持。

## 从源码构建

初次需要 Xcode Command Line Tools（Apple Clang、macOS SDK、`ar`、`otool`、`lipo`）、Git、Python 3.9+、Ninja、Node 22+、npm、Rust/Cargo。不要混用 Rosetta 和本机架构的 Node/Python/Rust。CI 使用 Rust 1.99.1 与 Node 22.13.1；Skia 固定到 `4f574af2444846ceca4d277a8095c5d4229d175f`。

可用以下命令准备缺少的工具；已有工具无需重复安装。`xcode-select --install` 可能弹出系统安装窗口，Homebrew 和 rustup 按各自官方安装方式先安装。

```bash
xcode-select --install
brew install node@22 python ninja
export PATH="$(brew --prefix node@22)/bin:$PATH"
rustup toolchain install 1.99.1 --profile minimal
rustup default 1.99.1
```

将 Node 22 的 `bin` 加入 PATH，确认 `node -v`、`npm -v`、`python3 --version`、`ninja --version`、`rustc --version`、`xcrun --show-sdk-path` 正常。已搭建环境后，在项目根目录用一条命令构建并验证：

```bash
npm run build:macos
```

该流程拉取固定 Skia 和所需依赖，执行 `npm ci`、GN/Ninja、Cargo bundled 构建，并运行完整 API 与中文字体测试。首次需要网络下载源码及 JS 构建依赖；消费端安装不需要这些工具。`CANVAS_BUILD_JOBS` 可调整 Ninja 并行数，默认 3。

输出在 `dist/canvas-darwin-arm64/` 或 `dist/canvas-darwin-x64/`，包含 `canvas.node`、`package.json`、`build-info.json`、`test-result.json`、许可证。可直接 `require('./dist/canvas-darwin-arm64')`；要在本地项目保留 `require('canvas')`，按当前架构安装这个目录，例如 `npm install ./dist/canvas-darwin-arm64`。

## 字体和结果来源

泛型字体映射为 Helvetica（sans-serif）、Times（serif）、Menlo（monospace）、Helvetica Neue（system-ui）、Apple Chancery（cursive）、Papyrus（fantasy）。中文等缺失字符通过 CoreText 字体匹配回退，常见为 PingFang。已安装字体、字体版本、系统和 Skia 实现均会影响结果。

需要查看实际字体时，在加载模块前设置诊断开关：

```js
process.env.CANVAS_DIAGNOSTICS = '1';
const canvasAPI = require('lucky65_canvas');
const ctx = new canvasAPI.OffscreenCanvas(200, 60).getContext('2d');
ctx.font = '24px sans-serif';
ctx.fillText('Hello 中文', 8, 38);
console.log(JSON.parse(canvasAPI.getRenderDiagnostics()));
```

`usedFonts` 记录实际字族、PostScript 名和字体版本。CPU 后端的 `selectedAdapter: null` 正常；本次未启用 Metal，GPU 驱动并非该路径的绘图后端。报告不会伪造 Chrome 版本或本机 Chrome 校准结果。

## 实现与验收路径

- `build.rs`：macOS 编译及 Apple 系统框架链接，不使用 GNU 的链接参数。
- `src/webgl_native.rs`：通过进程 `dlopen/dlsym` 查找 Node-API；macOS 使用系统提供的接口。
- `src/skia_backend.cpp`：独立 CoreText 字体管理器，Linux 继续 Fontconfig，Windows 继续 DirectWrite。
- `scripts/build-macos.py` 与 `snapshot/macos-skia-args.gn`：固定依赖和架构、部署目标、源码/二进制哈希、动态依赖审查。
- `scripts/pack-npm.js`：要求两个架构的原生测试通过且源码/二进制哈希匹配，才把它们加入 npm 包。
- `scripts/test-native-api.js`、`scripts/test-macos.js`：API/绘图/PNG-JPEG-WebP/位图/float16/P3/GC/Worker、重复绘图确定性与实际中英文字体。
- `tests/package-loader.test.js`：平台分发、旧系统和旧 Node 拒绝行为，不替代 macOS 实机测试。

实际 CI 由 `.github/workflows/macos-canvas-validation.yml` 与 `macos-package-validation.yml` 执行。发布包先在 Windows 安装测试，再将同一 SHA-256 的 tgz 上传到 macOS 两架构 × 两 Node 版本和现有 Linux 八组矩阵。只在这些结果齐全后记录已完成验收/发布；本地 Windows 运行不能替代 macOS 测试。

首轮真实编译发现 Apple SDK 的全局 `Style` 类型与项目内部类型同名；已将内部类型改为 `CanvasPaintStyle`，保持绘图语义不变。共享代码变更后重新编译 Linux，同时通过 Windows `cargo check --release --features bundled`；发布包继续使用已有 Chrome 校验的 Windows 二进制，并重新执行安装回归。

## 2026-11-14 原生验收证据

macOS 原生构建与验收：[Actions 43593479305](https://github.com/LuckyUniverse65/getImageData/actions/runs/43593479305)。Linux 最终源码回归：[Actions 43593532672](https://github.com/LuckyUniverse65/getImageData/actions/runs/43593532672)。本地记录位于 `docs/releases/0.4.0/{macos,linux}-native-run.json`，各平台详细报告位于对应 `dist/canvas-*/`。

| 平台 | 系统版本 | Node | 原生 SHA-256 |
| --- | --- | --- | --- |
| macOS arm64 | 15.8.2 | 22.13.1 | `c9e8bf6c682121c0cc2b3f0990a8e969050e389802dd18966c3cdeabdbcde252` |
| macOS x64 | 15.7.9 | 22.13.1 | `f101a95b15519ffea39d7d8c5a5a2300da1ceb15803209e69435e394b390fb05` |

两架构均通过 41 导出、44 方法、PNG/JPEG/WebP、位图、float16、P3、30 轮生命周期、4 个 Worker 和中英文文字绘制。实际文字字体为 Helvetica、PingFang SC；PingFang 版本 `20.0d21e3`。Helvetica 未从字体表读出版本，因此诊断返回空字符串，不补造版本号。

两个 Mac 的本次 demo 输出 SHA-256 均为 `1044aa6fc717425f861625374efbbbdd511a89bd29a5e502cf2ba5317457d6ca`；这只证明本次示例和环境，不代表全部跨架构绘图永远相同。Windows demo 继续为 `13e5a02ac5a22db0361f7e10b4278ecab36e8776bcd61d5451c5f1f56c740348`，Linux 原生示例继续为 `848dab3bcaa919e27fcf4ac9bed84a72db26698c6f63b930fd791a91072cb881`。

实际安装包 `dist/lucky65_canvas-0.4.0.tgz` 大小 30,227,335 字节，SHA-256 为 `f09df302b58210469e98db57e035a260357cfb889088d725ba5ccc596404faca`。打包及 Windows 安装报告位于 `docs/releases/0.4.0/verification.json`。最终 npm 公开状态以单独发布记录为准；打包成功不代表已经公开。

最终同一 tgz 的四组 macOS 安装验收：[Actions 43597001618](https://github.com/LuckyUniverse65/getImageData/actions/runs/43597001618)，Intel/Apple Silicon × Node 22.13.1/24，全部通过。八组 Linux 安装回归：[Actions 43596955653](https://github.com/LuckyUniverse65/getImageData/actions/runs/43596955653)，全部通过。对应 `*-package-run.json` 与每组完整报告均归档到 `docs/releases/0.4.0/`，可核对 run、版本、tarballSHA256 和实际测试环境。
