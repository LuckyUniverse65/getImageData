# Debian 11 / glibc 2.31 兼容构建

`lucky65_canvas@0.3.2` 已发布，适用于 Linux x64、glibc 2.31+、Node 22+。Debian 11 用户无需单独升级系统 glibc。0.3.0/0.3.1 的二进制仍要求 glibc 2.35+，不能靠修改入口检查获得兼容性。

## 安装

在现有项目目录执行：

```bash
npm install lucky65_canvas@0.3.2 --registry=https://registry.npmjs.org
node -p "require('lucky65_canvas/package.json').version"
```

版本应显示 `0.3.2`。业务代码继续使用 `require('lucky65_canvas')`，升级后重启已有 Node 服务或 Worker，使其加载新版模块。若原项目使用 `require('canvas')`，改用别名安装命令 `npm install canvas@npm:lucky65_canvas@0.3.2 --registry=https://registry.npmjs.org`，业务代码无需改包名。

## 实现

原生模块、Skia 静态库及运行时所需动态库统一采用 Debian 11 构建环境。构建脚本通过 `readelf` 检查 `.node` 和所有随包动态库的未定义符号版本，发现高于 GLIBC_2.31 的需求时直接失败。`build-info.json` 记录各文件要求的 glibc 版本及 SHA-256；打包步骤要求这份检查记录。

继续提供原项目 41 个导出、两种 2D 上下文的 44 个方法、编解码、字体及 Worker 功能，继续随包提供 Fontconfig 依赖及中西文兜底字体。Windows 使用原来已验收的二进制。

## 构建

构建机安装 Docker，取得项目源码，在项目根目录执行以下命令（Linux shell）：

```bash
docker build -f scripts/linux-builder.Dockerfile -t canvas-bullseye-builder scripts
docker run --rm -v "$PWD:/workspace" -w /workspace \
  -e CANVAS_SKIA_OUT=/workspace/third_party/skia/out/canvas-linux-glibc231 \
  canvas-bullseye-builder python3 scripts/build-linux.py
```

首次命令会准备 Node 22.13.1、Debian 11、Clang 14、Rust 1.99.1、Ninja、Python 3、字体库及基础字体；源码和字体下载需要网络。使用独立的 Skia 输出目录，避免复用 glibc 2.35 环境的旧对象文件。具体构建镜像定义为 `scripts/linux-builder.Dockerfile`。

在该容器中执行 `scripts/test-native-api.js` 与 `scripts/test-bundled-linux.js` 验证原生模块后，下载或保留 `dist/canvas-linux` 全目录。维护者在 Windows 工程中执行 `npm run pack:npm`，与已验收的 Windows 模块一起生成发布包。

## 验收范围

发布包安装测试覆盖 Ubuntu 22.04/24.04 × Node 22.13.1/24，以及精简 Debian 11 × Node 22.13.1/22、Debian 12 × Node 22.13.1/24，共八组。Debian 11 任务显式核对系统代号 bullseye 与 glibc 2.31。精简容器没有系统 Fontconfig 或字体，断网安装 tgz 后验证绘图、中文字体、编解码和 Worker。

当前状态：`0.3.2` 已在 npm 官方仓库公开，latest 已指向该版本。Debian 11 原生构建、Windows 安装测试、八组 Linux 安装测试全部通过。官方仓库安装包的 integrity 与已验收 tgz 一致；两个原生模块、十个动态库、四个字体共 16 个文件的 SHA-256 全部匹配，线上安装后的 Windows 绘图、编解码、Worker、ESM 测试通过。

- [Debian 11 原生构建与测试](https://github.com/LuckyUniverse65/getImageData/actions/runs/43168390974)：glibc 2.31、Node 22.13.1、Clang 14.0.6。
- [八组 Linux 安装验收](https://github.com/LuckyUniverse65/getImageData/actions/runs/43169892389)：全部通过，Debian 11 的实际 glibc 为 2.31；包内字体、绘图、PNG/JPEG/WebP、完整接口、四个 Worker 和 ESM 导入均通过。
- 原生模块最高 GLIBC 符号版本为 2.30，随包动态库均不超过 2.31；支持下限仍以实际验收的 2.31 为准。
- Windows demo 的 9216 个 RGBA 值与原版一致，原生接口、编解码、Worker、ESM 验证通过。
- Linux demo 在 Ubuntu 运行器上为 `848dab3bcaa919e27fcf4ac9bed84a72db26698c6f63b930fd791a91072cb881`，精简容器上为 `8dbefa5294711cf10184078d349200a3a1b6c24c361f1d76d372bd74b663c342`；分别与 0.3.1 对应测试环境的结果一致。这只说明该示例未出现回归，不代表不同字体环境的任意绘图都会相同。
- 本地证据：`out/linux-ci/native-debian11-run.json`、`dist/canvas-linux/build-info.json`、`out/npm-release-I8NOgu/verification.json`。
- 精确安装包：`dist/lucky65_canvas-0.3.2.tgz`，25,286,968 字节，SHA-256 为 `51736401374562d28f860ce859386a425a5205b366d7a237a360abe8295839df`；CI 记录为 `out/linux-ci/package-debian11-run.json`。
- 正式发布及线上安装证据：`out/npm-release-I8NOgu/publication.json`。
