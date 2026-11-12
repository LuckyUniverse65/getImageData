# Linux 移植、运行库与 glibc

## 先确定目标环境

需要时收集 `cat /etc/os-release`、`ldd --version`、`node -v`、`uname -m`。0.3.2 发布基线是 Linux x64、glibc 2.31+、Node 22+，实际覆盖 Debian 11/12 和 Ubuntu 22.04/24.04；不包含 musl/Alpine、ARM64、x86、macOS。目标扩大时独立适配和验证。

Linux 使用原项目 Rust/C++/Skia/嵌入 JS 的 CPU 光栅路径，Fontconfig/FreeType 处理字体；诊断中 `selectedAdapter: null` 正常，不需要 GPU、桌面或 Chrome。不要换回接口不完整的 `@napi-rs/canvas` 适配层。

## 在最低支持环境编译

读取 `scripts/linux-builder.Dockerfile`、`scripts/build-linux.py`、`snapshot/linux-skia-args.gn`。0.3.2 使用 Debian 11/Node 22.13.1、Clang 14、Rust 1.99.1；这些是已验证组合，不要仅修改入口中的最低版本字符串。

在 Linux 构建机的项目根目录：

```bash
docker build -f scripts/linux-builder.Dockerfile -t canvas-bullseye-builder scripts
docker run --rm -v "$PWD:/workspace" -w /workspace \
  -e CANVAS_SKIA_OUT=/workspace/third_party/skia/out/canvas-linux-glibc231 \
  canvas-bullseye-builder python3 scripts/build-linux.py
```

已有完整且匹配的构建环境可直接 `npm run build:linux`。Windows 主机没有可用 Linux 时，在已授权的测试分支运行 `python scripts/linux-test-ci.py --action start`，再用 `--action status` 获取验收产物；这会写 GitHub 并触发 CI，不是只读诊断。Windows 测试不能替代 Linux 测试。

使用独立 Skia 输出目录。来自 Ubuntu/glibc 2.35 的旧静态对象不能直接用于声称支持 glibc 2.31 的新包。Skia、绑定和所有非 glibc 动态依赖一起检查；`verify_glibc` 用 readelf 查看未定义 GLIBC 符号版本，超过基线即失败。还需在真实最低环境加载运行；符号检查不是全部 ABI 验证。

## 把运行依赖打包齐全

`scripts/bundle-linux-runtime.py` 通过 ldd 收集非 glibc 动态依赖闭包，复制到 `linux-libs/`，保留 SONAME 文件名并记录 SHA-256；再次检查依赖均解析到包目录。典型包括 Fontconfig、FreeType、Expat、UUID、libstdc++、libgcc_s、libpng、zlib、Brotli。

保留系统 glibc、加载器及 libm/libdl/libpthread/librt，不捆绑或替换它们。发行模块使用 `$ORIGIN/linux-libs` 的 DT_RPATH，原实现使用 `--disable-new-dtags` 让间接依赖也能解析；不要假设只给直接依赖设置 RUNPATH 就解决整个闭包。新库含 RPATH/RUNPATH 时需检查来源，不能盲拷。

包内字体为 DejaVu Sans/Serif/Sans Mono 与 Noto Sans CJK SC。Noto Sans2.004 的字体位置是 `Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`，许可在仓库根 `LICENSE`，不是 `Sans/LICENSE`。同时收集系统库版权文件和相关许可，不只放字体二进制。

`src/linux_fontconfig.h` 按 `.node` 所在目录找 fonts；保留可用系统配置、同名字体优先，无配置时建立基础配置并注册缺失字体。不需要 `LD_LIBRARY_PATH` 或安装后下载。必须保留整个包的 `linux-libs/`、`fonts/`，不能只复制 `.node`。兜底字体不是全 Unicode 覆盖，不保证跨字体环境像素一致。

## 实际验收

先测原生模块：

```bash
node --expose-gc scripts/test-native-api.js ./dist/canvas-linux/canvas.node > dist/canvas-linux/test-result.json
node scripts/test-bundled-linux.js ./dist/canvas-linux/canvas.node dist/canvas-linux/test-result.json
```

再测精确 npm tgz，按 `.github/workflows/linux-package-validation.yml` 的当前矩阵：Ubuntu 22.04/24.04 × Node 22.13.1/24，加 Debian 11 × Node 22.13.1/22 和 Debian 12 × Node 22.13.1/24。调整支持范围后同步测试矩阵与结果收集器，不能继续硬编码旧的四组或六组。

精简容器先确认无系统 Fontconfig/字体，断网安装本地 tgz（禁安装脚本/可选依赖），将包设为只读，跑完整接口、中文绘制、字体实际使用、编解码及 Worker。Debian 11 明确核对 bullseye 与 glibc 2.31。当前 chmod 测试在容器 root 下执行，仅代表测试中未依赖写包目录，不应夸大为完整非特权只读文件系统验收。

## 已遇到的问题

| 现象 | 处理依据 |
| --- | --- |
| `libfontconfig.so.1` 缺失 | 包含完整动态依赖闭包与字体，不能只让用户再装 apt 包来声称已自包含 |
| Debian 11 glibc 2.31 被拒绝 | 在 Debian 11 重编译并验证整个闭包，更新 loader 支持声明；不单独升级系统 glibc |
| apt 已安装工具被升级到下载 404 的旧安全包 | 当前固定构建镜像用 `--no-upgrade` 复用已有工具；新依赖仍检查实际可用性，不禁用签名或随意混入新发行版源 |
| 缓存 Git 仓库 UID 与容器不同 | 老 Git 可能不接受 `-c safe.directory`；已在临时构建镜像中为明确的依赖路径配置 global safe.directory，避免修改用户全局配置或信任所有目录 |
| 字体加入后像素变化 | 记录实际字体和前后输出；缺字修复可能合理改变结果，不能通过删字体掩盖问题 |
