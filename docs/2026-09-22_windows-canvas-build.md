# Windows 本机 Canvas 构建、校验与分发

## 已准备好环境：一条命令

在项目根目录，保持要对齐的 Chrome 正在运行、CDP 已开启：

```powershell
npm run build:canvas
```

构建使用当前电脑的字体、GPU 和驱动，探测本机 Chrome 的实际输出，生成配置并编译，再对**最终候选二进制**进行实时浏览器对照。通过后生成：

```text
dist/
  canvas/
    canvas.node                 原生入口，内含 JS 接口实现和 Float16Array 兼容实现
    package.json                name 为 canvas，main 为 canvas.node
    environment.json            本机环境、字体、配置、测试结果与来源哈希
    THIRD_PARTY_NOTICES.txt      第三方声明
  canvas-0.1.0-local.<构建编号>.tgz
```

同时安装到本项目的 `node_modules/canvas`，在本项目可以直接使用：

```js
const { OffscreenCanvas } = require('canvas');
const canvas = new OffscreenCanvas(2, 1);
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 1, 1);
console.log(Array.from(ctx.getImageData(0, 0, 2, 1).data));
// [255, 0, 0, 255, 0, 0, 0, 0]
```

其他 Node 项目需要先安装本次输出的本地包。下面在消费项目目录执行，路径改为实际构建项目位置：

```powershell
$canvasArchive = Get-ChildItem 'D:\python\getImageData\dist\canvas-*.tgz' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
npm install $canvasArchive.FullName
```

`require('canvas')` 是 Node 的包名解析，单独把一个任意命名文件放进工作目录并不能建立这个包名。安装 `.tgz` 会完成包名解析；消费项目不用编译，不需要 JS 外壳，不需要 Rust、Skia 源码或那两个 ANGLE DLL。

## 支持范围和成立条件

- 支持 Windows 10 / Windows 11，x64。暂不支持 Windows Server、旧版 Windows、Linux、macOS、ARM64、x86；以后扩展需要独立适配和验收。
- 需要 Node.js 22 或更高版本。当前实际验证使用 Node 22.13.1；较新 Node 原生有 `Float16Array` 时优先使用，没有时使用二进制内嵌的 `@petamoriken/float16` 3.9.3。未宣称每个未来 Node 版本均已测试。
- 当前引擎源码基于 Chrome 153 同期的 Skia/Dawn。构建不会只因 Chrome 版本号不同就拒绝尝试；是否通过由本机实时对照决定。**不会自动下载任意 Chrome 对应源码、自动修复所有版本差异，也不会假装一次重编译就适配了所有 Chrome。**
- 产物的验证结论对应构建电脑、Chrome 版本、字体集合、驱动及报告中的测试范围。更新这些环境后重新运行命令。不同电脑可能生成不同配置；配置相同时二进制也可能相同，绘图仍使用运行时硬件和系统字体。
- 不捆绑字体文件。把本机产物复制到另一台电脑，不代表它与另一台电脑的 Chrome 一致；另一台电脑应重新构建和验证。
- 二进制中内嵌的是 JS 源码，由 Node-API 加载时执行。分发目录没有 JS 实现文件，但这不是源码加密或不可逆保护。

## 首次准备：环境与库

以下准备只需要首次完成，日常构建不下载或安装开发工具。

| 组件 | 用途 | 当前验证环境 / 要求 |
| --- | --- | --- |
| Windows x64 | 系统与 DirectWrite / Direct3D 11 | Windows 11 22631；Windows 10 路径尚未在第二台实体机实测 |
| Node.js 与 npm | 生成内嵌代码、执行构建流程和测试 | Node 22.13.1；要求 Node ≥22 |
| Git | 取得源码、记录依赖版本 | 安装后在 PATH 中可调用 |
| Rust / Cargo | 编译 Node-API 模块 | 当前 Rust/Cargo 1.92.0，MSVC x64 工具链 |
| Visual Studio C++ Build Tools | MSVC 头文件、静态运行库、Windows SDK | 当前 VS 18、MSVC 14.50.35717、SDK 10.0.26100.0；通过 vswhere 自动发现 |
| Chromium Clang | 编译 Skia 和项目 C++ | `llvmorg-24-init-3796-g20e97c4b-2`，含 clang-cl / lld-link |
| Python | Skia 的依赖同步及构建辅助脚本 | 当前 3.14.5 |
| GN / Ninja | 构建 Skia 静态库 | 当前本地 GN 与 Ninja 1.13.2 |
| CMake | 构建 Dawn/Tint | 当前 4.2.1；补丁关闭 C++ modules 扫描 |
| 本机 Chrome | 最终行为参照 | 当前验证 153.0.8010.48，已开启 CDP |

Visual Studio Installer 中安装 **Desktop development with C++**，至少包含 x64/x86 MSVC 工具链和 Windows 10/11 SDK。Rust 使用官方 rustup 的 MSVC 工具链：

```powershell
rustup default stable-x86_64-pc-windows-msvc
rustup target add x86_64-pc-windows-msvc
node --version
npm --version
rustc --version
cargo --version
git --version
python --version
cmake --version
```

若需要严格复现本次编译器，可安装 `rustup toolchain install 1.92.0-x86_64-pc-windows-msvc`，在项目设置 `rustup override set 1.92.0-x86_64-pc-windows-msvc`。版本更新后仍需要重新验证。

### 项目和上游源码

迁移时带上本轮项目源码。`third_party/`、`node_modules/`、`target/`、`out/`、`dist/` 被 Git 忽略，**仅克隆本项目不包含构建所需的上游库**。

最快的准备方式是带上当前已构建的 `third_party/skia` 和 `third_party/chrome153-clang`，然后执行 `npm ci`。库不绑定某一块显卡，模块运行时选择本机适配器；日常命令会重新编译本项目 C++ / Rust。若在新路径重建上游库，必须重新生成 GN 和 CMake 构建目录，不能沿用旧目录内的绝对路径。

也可以从源码准备。在项目根目录执行：

```powershell
npm ci
git clone https://skia.googlesource.com/skia.git third_party/skia
git -C third_party/skia checkout 4f574af2444846ceca4d277a8095c5d4229d175f
python third_party/skia/tools/git-sync-deps
git -C third_party/skia apply --check ../../snapshot/skia-local.patch
git -C third_party/skia apply ../../snapshot/skia-local.patch
python third_party/skia/bin/fetch-gn
python third_party/skia/bin/fetch-ninja
```

`git-sync-deps` 按 Skia 的 DEPS 拉取 Dawn、HarfBuzz、ICU、libjpeg-turbo、libpng、libwebp、Wuffs、zlib、分配器等源码，需要网络。首次同步可能较慢。补丁仅应用一次；如果已有这些修改，先用 `git -C third_party/skia apply --reverse --check ../../snapshot/skia-local.patch` 检查，不要重复应用。

历史固定依赖版本在 [snapshot/manifest.json](../snapshot/manifest.json)。本次每次构建会另外记录**实际** Skia/Dawn revision、GN 参数和链接库 SHA-256，旧快照不能代替当前报告。

Chromium Clang 可以复制已有目录；从官方构建存储重新取得时使用以下固定版本：

```powershell
New-Item -ItemType Directory -Force third_party/chrome153-clang | Out-Null
Invoke-WebRequest -UseBasicParsing `
  'https://commondatastorage.googleapis.com/chromium-browser-clang/Win/clang-llvmorg-24-init-3796-g20e97c4b-2.tar.xz' `
  -OutFile third_party/chrome153-clang.tar.xz
tar -xf third_party/chrome153-clang.tar.xz -C third_party/chrome153-clang
third_party/chrome153-clang/bin/clang-cl.exe --version
```

保留 Python、CMake、Ninja 所在目录在 PATH。使用 Skia 下载的 Ninja 时，可在当前 PowerShell 会话加入：

```powershell
$env:PATH = (Join-Path $PWD 'third_party/skia/third_party/ninja') + ';' + $env:PATH
node scripts/configure-skia.cjs
ninja -C third_party/skia/out/canvas2d-clang skia skshaper skunicode_bidi skunicode_core
```

`configure-skia.cjs` 根据已安装的 Visual Studio、SDK 和项目实际路径生成 `args.gn`，已有配置会先备份。模板为 [windows-skia-args.gn](../snapshot/windows-skia-args.gn)。可以先执行 `node scripts/configure-skia.cjs --print` 查看配置。

本轮已验证当前现成依赖下的一键构建，并测试了配置自动发现；**未在空白机器上重新下载、从零编译全部上游库**。上面是归档的初始化步骤，不应把它描述为已经完成的第二台电脑实测。

本次网络环境对上述 Chromium Clang 下载地址的 HEAD 检查超时，未确认该地址当前可达；已有工具链可直接使用，重新下载需要能访问 Google 构建存储的网络。

### 必须具备的静态库

默认位于 `third_party/skia/out/canvas2d-clang/`：

```text
skia.lib                     skshaper.lib
skunicode_bidi.lib           skunicode_core.lib
icu_bidi.lib                 dawn_combined.lib
allocator_shim.lib           allocator_core.lib
allocator_base.lib           raw_ptr.lib
libjpeg.lib                  libjpeg12.lib
libjpeg16.lib                libpng.lib
libwebp.lib                  libwebp_sse41.lib
wuffs.lib                    zlib.lib
```

Skia 提供绘图、颜色转换和编解码；Dawn 提供 D3D11 后端；HarfBuzz/SkShaper 与 ICU bidi 处理文字整形和双向布局；其余为图像编解码、压缩及分配器依赖。Wuffs 的当前实现可能在相关编解码目标中共同链接，不要随意删库。

系统链接库由 Windows SDK 提供：`dwrite`、`ole32`、`uuid`、`user32`、`gdi32`、`winmm`、`windowscodecs`、`usp10`、`advapi32`、`onecore`、`delayimp`、`dxguid`、`d3d11`、`dxgi`。无需把系统 DLL 复制进分发包。

编解码 GN 参数必须启用 PNG/JPEG/WebP 和 Wuffs，并将 `skia_use_system_libjpeg_turbo/libpng/libwebp` 设为 `false`。旧 [skia-args.gn](../snapshot/skia-args.gn) 是编解码关闭时的历史快照，不能拿来替代新的模板。

新模块已删除 Ganesh/ANGLE 调用及导入库链接。上游模板保留当前已验证的 Skia 构建选项，即使静态库中含有 Ganesh 代码，新模块也不再调用它；最终包不含 `libEGL.dll`、`libGLESv2.dll`。清理时也重新构建了根目录的开发用 `webgl.node`，随后删除这两个旧 DLL；根目录开发模块与分发模块均不再依赖它们。

### 非默认安装路径

构建支持这些环境变量，值必须指向已准备好的依赖：

| 变量 | 指向 |
| --- | --- |
| `CANVAS_SKIA_ROOT` | Skia 源码根目录 |
| `CANVAS_SKIA_OUT` | 上述 `.lib` 与生成头文件所在的构建目录 |
| `CANVAS_CLANG_ROOT` | 内含 `bin/clang-cl.exe`、`bin/lld-link.exe` 的目录 |
| `CANVAS_VCVARS` | `vcvars64.bat` 的完整路径；未设置则用 vswhere 查找 |

`npm run build:canvas` 会明确指出缺少哪个文件。为了避免受历史调参污染，构建前必须清除手动设置的 `CANVAS_RASTER_SURFACE`、字体/Gamma 等运行时覆盖变量；构建脚本会检测并拒绝这些遗留覆盖，而不是悄悄忽略。

## Chrome 和 CDP：只保持一条连接

使用自己正常使用的 Chrome/profile，按 Chrome 支持的方式开启远程调试，默认端口 9222。不同版本可使用启动参数或其内置远程调试设置；新版 Chrome 对默认 profile 的启动参数存在限制，不要为绕过限制换一个字体/设置不同的临时 profile 来充当本机参照。

```powershell
node capture-cdp.cjs --session-status
```

尚无会话时，一键流程会启动隐藏的持久 CDP 服务，首次连接可能需要你在 Chrome 中允许一次。以后所有采集和验证复用同一连接；每个探针只创建并关闭自己的后台标签页。**脚本不会重启 Chrome、重启服务、断开重连或循环申请权限。** Chrome 本身关闭、重启或撤销授权后，原连接已失效，此时需要用户主动恢复，工具不会冒充已有授权自动重连。

非默认端口/profile 可设置 `CHROME_DEBUG_PORT`、`CHROME_DEVTOOLS_ACTIVE_PORT_FILE`。构建用新探针时临时复用已有白名单路径，在 `finally` 中恢复原文件，因此不必为了添加白名单重启服务。不要同时从其他进程修改这条探针路径。

构建会检查各次采集的 Chrome 版本、连接 ID、测试源码 SHA-256；同一构建中版本或连接改变会失败。

## 一条命令内部做了什么

1. 检查 Windows/Node 架构、现成工具和静态库；建立构建锁。
2. 读取 CPU、显卡清单、驱动、系统版本；对系统及用户字体目录中的字体文件计算 SHA-256。
3. 用现有 CDP 连接读取实际 Chrome 版本，采集图形与通用字体样本。
4. 编译候选 `.node`，尝试 Graphite/Dawn/D3D11 与 CPU 光栅配置，用样本识别可匹配的后端和通用字体映射。字体识别比较栅格像素，文字宽度另行记录，不能因像素相同就假设所有文字度量相同。
5. 将识别出的默认后端和字体映射写入本机配置，重新编译最终候选。字体文件仍在系统中；不会把测试像素硬编码成绘图输出。
6. 使用最终候选二进制运行本地用例，用当前 Chrome 重新运行相同用例并比较。日常验收不使用另一台机器保存的 demo 像素作为成功依据。
7. 检查 Worker 并发、原生对象 GC；在临时消费目录只放分发文件，以 `require('canvas')` 验证接口、独立实例、Float16Array、PNG/JPEG/WebP、Worker，并检查没有加载两个 ANGLE DLL。
8. 验收通过后打包 `.tgz`、更新 `dist/canvas`、安装到本项目的 `node_modules/canvas`。原有 `dist/canvas` 放入 `dist/archive/`；不会覆盖另一种来源的同名 `canvas` 包。

正常构建命令使用 Cargo 的 `bundled` feature。手动 `cargo build --release` 仍生成给源码 `index.js` 使用的底层开发模块，不等于完成了分发打包或 Chrome 验收。

## 报告、判定和失败处理

每次完整证据在 `out/build-<构建编号>/`，成功报告同时随包保存在 `dist/canvas/environment.json`。失败也写报告，返回非零退出码，不将未通过测试的候选当作新分发版本。

本次已完成的构建、字体/GPU、产物哈希、6108 项对照以及 `.tgz` 安装验证另外归档在 [本机验证记录](2026-09-22_windows-canvas-build-verification.json)。该记录不会因 `dist/` 被清理而丢失。

报告字段包括：

- `windows.os/cpu/graphics`：Windows 版本、CPU、系统显卡清单、驱动版本和日期。
- `chrome`：CDP 实际连接的 Chrome 版本、revision、采集编号、连接 ID、浏览器语言、WebGL renderer。**WebGL renderer 不能单独证明 Canvas 2D 使用了哪个后端。**
- `profile`：编译进本次产物的后端及通用字体映射。
- `nativeRuns`：原生模块实际创建的 Graphite/软件表面数量、实际选中的 Dawn 适配器，以及测试过程中实际选用的字体家族、PostScript 名、字重、样式、字体内版本号。
- `windows.fontFiles`：安装字体文件清单、路径、大小、SHA-256。与 `nativeRuns.usedFonts` 区分；校准过程中扫描过的候选字体也单独位于 `calibration`，不是正式测试使用的字体清单。
- `dependencies/tools/sources/binarySHA256`：实际库版本、构建配置、库/源码/二进制哈希和编译器信息。
- `verification`：每项差异、容差项、Chrome 采集来源、demo 差异，以及 `browserVerified`。
- `packageSmoke`：隔离加载测试、Float16Array 使用原生还是内嵌实现、进程实际加载的库。

验收标准沿用现有回归：8 位像素和一般接口值精确比较；已有半精度跨色域用例仅 RGB 允许 `1e-5` 绝对误差，alpha 不放宽。错误处理比较错误类型，既有函数自有属性等偏差仍见交接文档。构建报告的 `verified` 表示列出的回归和隔离加载通过，**不等于证明所有字体、所有绘图指令或所有未来 Chrome 都完全一致**。

本次字体识别另记录了一处 `Noto Serif SC` 样本的宽度差异：栅格像素一致，但 `Canvas 123`、16px 的测量宽度本地为 `85.69526672363281`、Chrome 为 `84.67127990722656`。它不会被改成假值，也没有混入“精确通过”的 6108 项用例计数。不同电脑以自身报告为准。

若失败：

- 缺工具/库：按错误路径补齐首次准备，不必重复安装已有组件。
- 无法找到匹配后端/字体：检查目标 Chrome profile、字体安装和驱动，查看 `calibration`；现有引擎不匹配时需要源码适配，不能只改版本标签。
- 实时测试不一致：查看 `verification.json` 的具体用例及本地/Chrome 值，修复后重新执行命令。
- CDP 已断开：流程停止，不会反复请求权限；确认浏览器准备好后由用户主动恢复会话。
- 构建意外终止留下 `out/canvas-build.lock`：先确认其中 PID 对应构建已经结束，再删除这个锁文件；不要删除正在使用的锁。

`src/png.js` 已删除。PNG/JPEG/WebP 由原生 Skia 编码；失败语义和例子见 [PNG 编码说明](2026-09-22_png-encoding-null.md)。
