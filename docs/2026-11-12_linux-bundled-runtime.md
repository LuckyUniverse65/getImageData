# Linux 运行库与字体打包（0.3.1）

本文记录 0.3.1 的历史构建与验收。glibc 2.31 / Debian 11 的 0.3.2 适配与最新状态见 [Debian 11 兼容说明](2026-11-12_debian11-compatibility.md)。

0.3.0 在精简 Linux 上可能报 `libfontconfig.so.1: cannot open shared object file`，原因是原生模块仍需要系统提供 Fontconfig。0.3.1 将它及非 glibc 依赖和兜底字体随 npm 包分发。

## 安装与范围

```bash
npm install lucky65_canvas@0.3.1
```

使用 `const { OffscreenCanvas } = require('lucky65_canvas')`。旧代码需要 `require('canvas')` 时安装 `npm install canvas@npm:lucky65_canvas@0.3.1`。

支持 Linux x64、glibc 2.35+、Node 22+，例如 Ubuntu 22.04+ 和 Debian 12+；Windows 10/11 x64 继续使用已验收的原生模块。不支持 Alpine/musl、ARM64、x86、macOS、Windows Server 或旧版 Windows。Linux 不需要 apt 安装字体库、桌面、GPU、Chrome、Rust 或编译器。

## 包含内容与加载

`linux-libs/` 包含 Fontconfig、FreeType、Expat、UUID、libstdc++、libgcc_s、libpng、zlib、Brotli 解码库及 common 库。构建脚本通过 `ldd` 收集完整非 glibc 动态依赖，逐文件记录 SHA-256；实际清单在包内 `build-info.json` 的 `linux.bundledFiles`。

原生模块的 ELF RPATH 为 `$ORIGIN/linux-libs`，用于查找直接和间接依赖，不需要设置 `LD_LIBRARY_PATH`。glibc、动态加载器及其 libm/libdl/libpthread/librt 仍由系统提供，未打包。

`fonts/` 包含 DejaVu Sans、DejaVu Serif、DejaVu Sans Mono 和 Noto Sans CJK SC Regular（Sans2.004）。保留系统字体配置；缺少配置时使用包内基础配置。系统已有同名字体时优先使用，缺少时注册包内字体。字体路径按 `.node` 所在目录解析，工作目录变化不影响查找。Noto 字体提供中文兜底，但并非覆盖所有 Unicode 字符。

必须完整部署 npm 包，不能只复制 `.node` 或删除 `linux-libs/`、`fonts/`。第三方许可证随包放入 `THIRD_PARTY_NOTICES.txt`。不执行安装后下载，也不要求对包目录有写权限。

## 绘图结果与接口

保留原项目 41 个顶层导出和两种 2D 上下文的 44 个方法，包括 PNG/JPEG/WebP、位图转移、float16/display-p3、worker 及原有 WebGL 兼容接口。Linux 使用 Skia CPU；WebGL 仍不提供完整 GPU 渲染。

新增兜底字体可使此前缺字的文字正常显示，也可能改变文字宽度和像素。不同机器的系统字体仍可导致结果不同，不承诺与 Windows/Chrome 相同。设置 `CANVAS_DIAGNOSTICS=1` 后绘图，再调用 `JSON.parse(getRenderDiagnostics())` 可查看实际字体及版本。

## 构建与验收

准备好 Ubuntu 22.04 构建环境后执行 `npm run build:linux`；工具和依赖准备见 [Linux 构建说明](2026-11-11_linux-support.md)。该命令构建原生模块并收集运行库与字体，发布 tarball 使用 `npm run pack:npm`。

验收包括 Windows 原始 demo 像素对比、完整接口及编解码测试、Ubuntu 22.04/24.04 × Node 22/24 四组安装测试，以及 Debian bookworm-slim × Node 22/24 两组精简容器测试。精简容器先确认没有系统 Fontconfig 和字体，再断网安装实际 tgz，将包设为只读后运行绘图、中文字体及 worker 测试。

历史验收结果：`lucky65_canvas@0.3.1` 已在 npm 官方仓库公开，发布核验当时 latest 为 `0.3.1`。Windows 安装测试、六组 Linux 安装测试全部通过。已从官方仓库重新安装，确认线上 integrity 与已验收 tgz 一致，并核对两个原生模块、十个动态库、四个字体共 16 个文件的 SHA-256；Windows 绘图、编解码、Worker、ESM 测试通过。

- [原生构建与接口测试](https://github.com/LuckyUniverse65/getImageData/actions/runs/43077161285)。
- [六组 Linux 安装测试](https://github.com/LuckyUniverse65/getImageData/actions/runs/43080279190)，包括 Node 22/24 无系统字体及 Fontconfig 的精简容器；容器仅发现包内四种字体，实际中文字体为 Noto Sans CJK SC。
- Windows demo 的 9216 个 RGBA 值与原版一致；Ubuntu 上也保留旧 Linux demo 哈希。精简容器缺少 Ubuntu 的其他系统字体，demo 哈希不同，属于字体环境差异。
- 已验收 tgz：`dist/lucky65_canvas-0.3.1.tgz`，25,480,707 字节，SHA-256：`3b0e35305c1237e628c63aff90446383f97dada32fae81ecf33ed0a2ba6d50cf`。
- 本地验收记录：`out/npm-release-i4Xxdj/verification.json`、`out/linux-ci/native-bundled-run.json`、`out/linux-ci/package-bundled-run.json`。
- 线上安装核验与发布记录：`out/npm-release-i4Xxdj/publication.json`。
