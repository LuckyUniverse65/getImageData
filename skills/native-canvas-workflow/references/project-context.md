# 项目地图与会话决策

本资料整理自 getImageData 项目会话与截至 2026-11-12 的代码、文档。版本和环境是历史基线；每次使用读取当前清单、源码及报告。

## 用户实际目标

- Node.js 可直接 `const {OffscreenCanvas} = require('canvas')`，实例互不干扰；后来公开包定名为 `lucky65_canvas`，可用 npm 别名继续保留 `require('canvas')`。
- Windows 根据本机字体、实际渲染后端及 Chrome 样本构建和校验，报告字体、GPU/驱动、Chrome 和源码/二进制来源。预编译 npm 安装不自动在消费电脑校准 Chrome。
- Linux 完整移植原有实现，正常绘图即可，不要求跨平台逐像素一致。最终把缺失运行库、兜底字体和 glibc 2.31 兼容一并落实。
- 代码示例优先 `.js`；既有 `.cjs` 构建工具无需为此批量改名。用户只要代码或修改说明时，不改外部消费项目。当前工程内的集成文件用于示例和验证。
- “复用 Canvas”指复用画布实例，并非只复用 worker，也不是缓存某一次绘图结果。性能需求不能擅自改变后端和像素语义。
- 用户不希望重复 CDP 授权。复用当前有效连接；npm 登录与发布验证由平台要求，不能用 skill 代替本人验证。

## 三种入口

| 入口 | 位置 | 注意 |
| --- | --- | --- |
| 开发模块 | `index.js` + 根目录 `webgl.node` | `cargo build --release` 后 Windows DLL 拷贝成 `webgl.node` 只更新这里 |
| Windows 本机包 | `dist/canvas/canvas.node`、`environment.json`，安装到 `node_modules/canvas` | Cargo `bundled` 内嵌接口 JS、DOMMatrix 和 Float16Array；本机构建验证后安装 |
| 公共 npm 包 | `npm/` 为发布输入，`scripts/pack-npm.js` 生成 tgz | 小型 `index.js` 选择平台 `.node`；不是被删掉的绘图 JS 实现，也不是源码加密 |

根 `package.json` 保持私有，公开版本取 `npm/package.json`。别把根工程当 npm 发布对象。

## 源码职责

| 位置 | 职责 |
| --- | --- |
| `index.js` | Web IDL 转换、品牌校验、接口形状、图像/位图与编码入口 |
| `src/dommatrix.js` | 矩阵/点对象、可变与只读语义 |
| `src/webgl_native.rs` | Node-API、原生转发函数、对象生命周期与嵌入代码加载 |
| `src/skia_backend.cpp` | Skia 绘图、字体整形、像素、编解码和后端 |
| `src/canvas_css.rs` | 颜色与字体语法解析 |
| `src/render_diagnostics.h`、`src/linux_fontconfig.h` | 实际渲染诊断；Linux 字体配置及包内字体注册 |
| `build.rs`、`scripts/prepare-native.cjs`、`scripts/bundle-canvas.cjs` | 原生链接、平台配置、JS/Float16Array 嵌入 |
| `snapshot/` | 固定依赖、补丁、平台 GN 参数和 API 合约 |
| `scripts/test-native-api.js`、`snapshot/native-api-contract.json` | 完整 API 形状及实际调用验收 |

## 已实现范围和边界

0.3.2 基线为 41 个顶层导出、两种 2D 上下文各 44 个方法。方法/参数完整表在工程 `npm/README.md`，不要另造一套列表；未来以合约与实际导出核对。

包含 OffscreenCanvas、本地 HTMLCanvasElement、图像/位图、Path2D、矩阵/点、Float16Array、PNG/JPEG/WebP、诊断，以及原有 WebGL 兼容类型。WebGL 不是完整 GPU WebGL。HTMLCanvasElement 没有原生 `toDataURL/toBlob`；不提供其他 canvas 包的 `createCanvas/loadImage/registerFont`。

`@petamoriken/float16@3.9.3` 是构建输入，嵌入二进制；Node 22 缺少原生 Float16Array 时使用，存在原生实现时优先原生。`@napi-rs/canvas` 曾用于 0.2.0 Linux 适配，但因接口缺失被完整原生移植替代，不是当前发行版后端。

`src/png.js` 与 ANGLE 的 `libEGL.dll/libGLESv2.dll` 已删除；旧交接文档仍提到这些文件和“待完成嵌入”，不要把历史描述恢复成当前实现。
