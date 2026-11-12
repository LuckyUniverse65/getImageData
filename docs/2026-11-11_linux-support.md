# Linux 完整原生移植与构建

## 本次修正

`0.2.0` 的 Linux 实现使用 `@napi-rs/canvas` 适配，缺少原项目接口，没有满足完整移植要求。`0.3.0` 改为直接编译本项目的 Rust、C++/Skia 和嵌入式 JS，删除替代后端及可选 npm 依赖。Windows 仍使用此前验收过的二进制。

目标是保留现有项目的全部 41 个公开导出及两种 2D 上下文的 44 个方法。完整 API 说明见 [npm README](../npm/README.md)。这里的“完整”指原项目现有能力：原本没有实现的浏览器功能不会因移植而新增，例如真正的 GPU WebGL 渲染、HTML Canvas 的 toDataURL/toBlob。

## 支持环境

`0.3.2` 起支持 Linux x64、glibc 2.31+，面向 Debian 11+ 和 Ubuntu 20.04+；Node.js 22+。0.3.0/0.3.1 仍要求 glibc 2.35+。不支持 Alpine/musl、ARM64、x86、macOS。Windows 支持范围仍是 Windows 10/11 x64，不包括 Windows Server。新版本构建、验收及发布状态见 [Debian 11 兼容说明](2026-11-12_debian11-compatibility.md)。

Linux 绘图使用 Skia CPU，不需要 GPU、显卡驱动、桌面、X11、Chrome 或 CDP。`0.3.1` 随包携带 Fontconfig 及依赖库，读取本机字体，缺少时使用包内兜底字体。不同字体、平台和渲染实现会改变像素；本次不要求 Linux Chrome 或 Windows 像素完全一致。

## 安装 npm 预编译包

```bash
npm install lucky65_canvas@0.3.2
```

`0.3.1` 起无需用 apt 安装 Fontconfig 或字体。保留整个包内的 `linux-libs/`、`fonts/` 目录；原生模块通过相对路径加载运行库，不能只复制 `.node`。包内提供 DejaVu Sans/Serif/Sans Mono 和 Noto Sans CJK SC。`0.3.2` 系统要求为 glibc 2.31+、x64、Node 22+。

包内包含两个原生二进制，入口按平台选择；Skia、图片编解码、JS 接口和 Float16Array 兼容实现已内置。安装时无需 C++、Rust、源码编译或可选 npm 后端。

```js
const { OffscreenCanvas } = require('lucky65_canvas');
const canvas = new OffscreenCanvas(2, 1);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 1, 1);
console.log([...ctx.getImageData(0, 0, 2, 1).data]);
// [255, 0, 0, 255, 0, 0, 0, 0]
```

原有项目需要 `require('canvas')`：执行 `npm install canvas@npm:lucky65_canvas@0.3.2` 即可。

## 从源码一条命令构建

发布版应使用 [Debian 11 构建容器](2026-11-12_debian11-compatibility.md#构建)，其 Dockerfile 安装了 Clang 14 与固定 Rust 工具链。已有 Debian 11 构建环境时可直接执行下述 npm 命令。不要在新系统直接链接系统库后声称兼容旧 glibc；构建脚本会拒绝高于 GLIBC_2.31 的符号依赖。

手动准备时需要 Node.js 22+、npm、Rust（含 cargo）、Python 3、Git，以及 Clang 14、Ninja、字体运行库和字体。以下 apt 命令只准备基础依赖；Debian 11 的 Clang 14 安装来源和具体步骤以 Dockerfile 为准。

```bash
sudo apt-get update
sudo apt-get install -y build-essential ninja-build python3 git libfontconfig1 fonts-dejavu-core
```

Rust 通过 rustup 官方安装；Node/npm 使用官方发行版或已有环境。确认 `node --version`、`npm --version`、`rustc --version`、`cargo --version`、`clang++ --version` 可执行。

在项目根目录执行：

```bash
npm run build:linux
```

也可以沿用 `npm run build:canvas`，脚本会识别 Linux 平台。

该命令运行 `scripts/build-linux.py`，拉取固定 Skia 提交 `4f574af2444846ceca4d277a8095c5d4229d175f`，按其 DEPS 拉取 CPU 构建所需固定依赖，取得 GN，使用 `snapshot/linux-skia-args.gn` 和 Ninja 编译静态库，执行 `npm ci` 安装构建时 Float16Array 依赖，然后用 Cargo 编译完整 `.node`，收集非 glibc 动态库及许可证，并下载固定 Sans2.004 版本的 Noto CJK 字体。首次构建需要访问 Git、Google Chromium/Skia 下载服务及 npm；已有源码和中间产物会增量复用。可设置 `CANVAS_BUILD_JOBS` 调整并行编译数，默认 2。构建机需为 Debian/Ubuntu，打包脚本使用 dpkg 查询运行库许可证；0.3.2 发布版在 Debian 11 容器中构建，并检查所有原生文件的 GLIBC 符号需求不高于 2.31。

构建后执行验收（CI 会自动执行）：

```bash
node --expose-gc scripts/test-native-api.js ./dist/canvas-linux/canvas.node > dist/canvas-linux/test-result.json
node scripts/test-bundled-linux.js ./dist/canvas-linux/canvas.node dist/canvas-linux/test-result.json
```

产物位于 `dist/canvas-linux/canvas.node`，该目录附带本地包清单，可执行：

```bash
npm install ./dist/canvas-linux
node -e "const {OffscreenCanvas}=require('canvas'); console.log(new OffscreenCanvas(1,1).getContext('2d').getImageData(0,0,1,1).data)"
```

`dist/canvas-linux/build-info.json` 记录 Skia 提交、编译器、Rust、glibc、动态库依赖、源文件、二进制、随包动态库与字体 SHA-256。Skia 的编码库、HarfBuzz、ICU bidi、FreeType 等静态链接；Fontconfig 及它需要的动态 FreeType/C++ 等非 glibc 库从包内 `linux-libs/` 加载，glibc 由系统提供。静态 FreeType 版本取自 Skia 的固定 DEPS；Fontconfig 头文件固定为 2.15.0 对应提交 `00fbdb00e3efafbde7cac84d70678ff87dbed866`，构建脚本自动获取，无需额外安装这两者的系统开发包。

## 平台实现变化

| 位置 | Linux 实现 |
| --- | --- |
| `build.rs` | clang++/ar 编译 C++，链接 Skia 静态库及系统字体库 |
| `src/webgl_native.rs` | dlopen/dlsym 从 Node 进程取得 Node-API 符号 |
| `src/skia_backend.cpp` | 保留同一绘图代码，CPU 构建排除 Dawn/D3D11，使用 Fontconfig/FreeType |
| `src/render_diagnostics.h` | 通过 Skia 可移植 UTF-16 转换读取字体版本 |
| `scripts/prepare-native.cjs` | Linux 默认 raster 和系统通用字体；嵌入同一 JS/矩阵/Float16Array 实现 |
| `npm/index.js` | 检查 Node/架构/glibc 后加载对应原生文件 |

## 运行环境诊断

```bash
CANVAS_DIAGNOSTICS=1 node -e "const c=require('lucky65_canvas'); const g=new c.OffscreenCanvas(200,50).getContext('2d'); g.font='20px sans-serif'; g.fillText('Canvas',0,30); console.log(JSON.parse(c.getRenderDiagnostics()))"
```

输出包括可用字体、实际用到的字体及版本、软件渲染表面计数。Linux 的 `selectedAdapter: null` 表示没有使用 GPU，不是渲染失败。需要固定字体文件时，在启动 Node 前设置 `CANVAS_FONT_FILE=/absolute/path/font.ttf`。`0.3.1` 自带中文兜底字体，系统已有同名字体时优先使用系统版本。详见 [运行库打包说明](2026-11-12_linux-bundled-runtime.md)。

## 验收和证据

完整测试由 `scripts/test-native-api.js` 执行，以 Windows 原包生成的 `snapshot/native-api-contract.json` 为接口基准，检查 41 个导出、原型方法、参数数量及属性访问器，并实际调用两种 2D 上下文的全部 44 个方法。另测 PNG/JPEG/WebP 同步编解码及 Blob、bitmaprenderer、HTML 转离屏画布、ImageBitmap 转移与裁剪、RGBA8/float16/display-p3、矩阵、字体、原有 WebGL 兼容调用、生命周期及四个 worker。

Linux 使用 GitHub Actions 的真实 Ubuntu 运行器构建和测试；本机 Windows 测试不能替代 Linux 测试。运行状态记录在 `out/linux-ci/run.json`，成功后下载原生文件及测试报告到 `dist/canvas-linux/`。完整 tarball 还需要在 Linux 隔离安装并重复上述功能验收，发布证据单独记录。

## 0.3.0 历史发布结果

`lucky65_canvas@0.3.0` 已正式发布。以下为该版本的历史证据；0.3.1 的打包及验证见 [运行库打包说明](2026-11-12_linux-bundled-runtime.md)。0.3.0 的线上 dist.integrity 与两平台验收的精确 tgz 一致；从官方 registry 重新安装后，两个原生文件的 SHA-256 均与验收产物一致，Windows 绘画、编解码、Worker 和 ESM 检查通过。

- [最终原生构建与完整接口测试](https://github.com/LuckyUniverse65/getImageData/actions/runs/43065659720)：Ubuntu 22.04、glibc 2.35、clang 14，全部通过。
- [npm 安装测试矩阵](https://github.com/LuckyUniverse65/getImageData/actions/runs/43066505417)：Ubuntu 22.04/24.04 × Node 22.13.1/24，四组全部通过。每组验证 41 个导出、两种 2D 上下文的全部 44 个方法，以及文中列出的行为和四个 worker；安装禁用了脚本和可选依赖。
- Windows 共享源码重新编译后完整接口测试通过，demo 的 9216 个 RGBA 值与原版一致。npm 内保留原来已验收的 Windows 二进制。
- 发布包 SHA-256：`2de0c77c6412be99b92685ca486835e2b1f50df2bdebb3f5d3056b748ff8d5f8`。
- 本地证据：`dist/canvas-linux/build-info.json`、`dist/canvas-linux/test-result.json`、`out/linux-ci/native-final-run.json`、`out/linux-ci/run.json`、`out/npm-release-z7Ujaj/verification.json`、`out/npm-release-z7Ujaj/publication.json`。

`0.2.0` 的 Linux 适配版额外提供过 `GlobalFonts`、`Image`、`loadImage`，这些不是原项目的接口；`0.3.0` 统一为原项目的 41 个导出。图片加载使用 `createImageBitmap` 或同步 `decodeImage`，字体选择使用系统字体和 `CANVAS_FONT_FILE`。
