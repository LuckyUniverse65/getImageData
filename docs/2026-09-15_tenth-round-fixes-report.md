# OffscreenCanvas 第十轮修复验收

2026-09-15，第十轮检测中的 **17 个失败用例全部修复**。在原有 46 项上增加 29 项相关边界验证，第十轮 **75 项全部与 Chrome 一致**，并已纳入主回归。完整 **578 项通过**，demo 的 **9216 个 RGBA 值零差异**，渐变 GC 检查通过。

## 修复内容

| 触发方式与证据 | 修复后的行为 | 实现位置 |
| --- | --- | --- |
| freeze 后修改 Canvas 尺寸、关闭 ImageBitmap；此前抛错且 Canvas 原生状态已部分更新 | 尺寸和像素状态使用私有字段，冻结外部对象不阻止内部更新；支持重复关闭、修改高度和转移位图 | [index.js](../index.js)：私有字段、`imageSourceState`、内部像素读取 |
| 自有 width/height/data 属性遮蔽图像源；包括抛错 getter | drawImage/createPattern 使用内部尺寸与像素快照，不调用公开 getter；覆盖 Canvas、Bitmap 及冻结对象 | [index.js](../index.js)：`checkImageSource` 与绘制参数适配 |
| HSL 灰色阴影和三类渐变偏 1；shadowColor 的百分比 alpha getter 不正确 | 颜色状态同时保留序列化信息与绘制用浮点分量，浮点颜色跨 Rust/C++ 边界传递；save/restore 保留阴影精度 | [webgl_native.rs](../src/webgl_native.rs)：`css_style`、`drawing_color`、渐变色标和阴影状态；[skia_backend.cpp](../src/skia_backend.cpp)：浮点颜色入口 |
| 带注释、指数、none 的 HSL numeric alpha 错误量化 | 区分简单语法和通用解析路径，通用路径保留浮点 alpha；补充角度单位、正号、小数、尾部空白及注释对照 | [canvas_css.rs](../src/canvas_css.rs)：`hsl_color` |
| Tahoma 中 `a` + U+093E + `B` 的普通与 small-caps 绘制不一致 | 间距标记不再无条件继承前一字符的回退字体和缩小字号；非间距与包围标记继续保持原有分组 | [skia_backend.cpp](../src/skia_backend.cpp)：`combining_mark`、`fallback_runs`、`synthetic_caps_runs` |
| Tahoma 绘制中文时实际 ascent 和像素不同 | 按当前简体中文环境对应的 Blink 顺序尝试 Noto Sans SC、Noto Sans CJK SC、Microsoft YaHei、SimSun；候选必须存在且包含字形，之后才使用通用 DirectWrite 回退 | [skia_backend.cpp](../src/skia_backend.cpp)：`fallback_runs` |
| SimSun 绘制与度量不一致 | 按 Blink 规则允许嵌入位图，Calibri/Courier New 保留排除规则；对启用嵌入位图且具有 EBLC 表的字体保留 GDI 度量，避免线性度量强制切回轮廓宽度 | [skia_backend.cpp](../src/skia_backend.cpp)：`use_embedded_bitmaps`、`use_linear_metrics`、字体分段与度量入口 |
| 新增 createPattern 边界测试发现绘制透明，原生日志提示无法转换为 Graphite 图像 | 创建图案 shader 前将图像上传到当前 recorder 的纹理；四种 repetition 模式均逐通道验证通过 | [skia_backend.cpp](../src/skia_backend.cpp)：`skia_canvas_set_pattern` |

17 是原始失败用例数，不代表独立缺陷数。Graphite 图案上传是本轮扩展验证发现并一并修复的额外问题。

## 验证与证据

| 检查 | 结果 |
| --- | --- |
| 第十轮原始用例 | 46/46 一致，原始 17 项差异全部消除 |
| 新增边界 | 29/29 一致：图像源属性遮蔽 4 项、冻结状态 2 项、阴影恢复 1 项、HSL 语法 10 项、SimSun 字号与 small-caps 8 项、图案重复模式 4 项 |
| 完整主回归 | 578 项，`browserVerified:true`，各轮失败列表为空 |
| demo | 9216 个 RGBA 通道值，差异 0 |
| GC | 渐变 GC 检查通过 |
| 本地比较器 | 独立子进程退出 0，75 项匹配，比较器退出 0 |
| 构建 | release 编译成功；编译器仍报告已有未使用代码等警告 |

最终主回归和第十轮采集 runId 为 `eb1c500b2a3d4bdaaf097f3582a5e849`，demo runId 为 `f03f9c3c5ddc4ae998e1d451dd9b09d9`。所有浏览器验证都复用用户手动启动的 Chrome `153.0.8010.37`、端口 `9222`、连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，在后台测试页执行，没有操作鼠标、键盘或剪贴板，没有重启浏览器或 CDP 服务。

[tenth-round-fixes.json](tenth-round-fixes.json) 保存完整第十轮浏览器与本地结果、原始失败用例修复映射、主回归结果、采集元数据、生产文件及测试源码 SHA-256、字体信息和参考源码哈希。[tenth-round-review.json](tenth-round-review.json) 继续保留历史失败证据。测试没有放宽像素容差。

## 参考实现

核对了对应 Chrome 版本的以下源码，下载副本的 SHA-256 记录在验收 JSON 中：

- [Windows 字体回退列表](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/platform/fonts/win/font_fallback_win.cc)
- [Windows SkFont 配置](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/platform/fonts/win/font_platform_data_win.cc)
- [嵌入位图排除列表](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/platform/fonts/bitmap_glyphs_block_list.cc)
- [字形宽度读取](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/platform/fonts/shaping/harfbuzz_face.cc)
- [CSS 快速解析](https://github.com/chromium/chromium/blob/153.0.8010.37/third_party/blink/renderer/core/css/parser/css_parser_fast_paths.cc)

## 复现与范围

在项目根目录运行，保持现有 Chrome 和持久 CDP 会话可用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
node tests/compare-tenth-round.cjs
```

主回归自动采集包含第十轮的当前测试源码，检查源码哈希和完整用例集合，并保存 `out/cdp-tenth-round-{browser,local}.json`。比较器保存 `out/cdp-tenth-round-diff.json`。三条命令均应退出 0。

验收针对当前 Windows、Chrome、简体中文字体环境。中文回退使用简体中文候选顺序，尚未实现按页面语言切换日文、韩文或繁体中文回退列表。未执行完整 Canvas 标准测试集；本报告的通过结论仅覆盖上述用例与环境。
