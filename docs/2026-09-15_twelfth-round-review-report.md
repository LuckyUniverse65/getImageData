# OffscreenCanvas 第十二轮兼容性检测

2026-09-15，在提交 `24450e87f87d59b0ab4422ce7b1e2a3f5c741f94` 上新增 **35 项检测：18 项一致，17 项存在差异**。两次 Chrome 采集结果完全一致。本轮仅增加诊断用例和报告，生产实现未修改，以下问题尚未修复。17 是失败用例数，不等于独立缺陷数。

原有 **632 项回归全部通过**，demo 的 **9216 个 RGBA 值零差异**，渐变及图案 GC 检查通过。生产源文件、原生模块、demo、主测试入口和图案 GC 脚本的哈希与第十一轮验收一致；前十一轮用例逐字节保持不变。第十二轮尚未计入主回归通过数。

## 已确认问题

| 触发与证据 | 本地 / Chrome 差异 | 实现路径与修复方向 |
| --- | --- | --- |
| `textPropertyState_letterSpacing/wordSpacing/fontKerning`：设置、save/restore、无效赋值和 resize | 本地初值为 undefined，属性不随 save/restore 或 resize 恢复，无效字符串也被保留；Chrome 默认分别为 `0px`、`0px`、`auto`，恢复已保存值、忽略无效值、resize 后恢复默认值 | [webgl_native.rs](../src/webgl_native.rs) 的 Canvas2D/CanvasState 和属性注册未包含这些状态；需要接入解析、存储、save/restore/reset |
| `textPropertyDraw_letterSpacing_2px/-1px`：20px Arial 绘制 `ABC` | 本地两次宽度都为 `41.123046875`；Chrome 分别为 `47.123046875`、`38.123046875`，像素分别有 345、275 个通道值不同 | 字距未传入字形定位和度量；不能仅修正 getter 或最终宽度，还需要更新每个字形位置及边界 |
| `textPropertyDraw_wordSpacing_3px/-1px`：20px Arial 绘制 `A B C` | 本地宽度均为 `52.236328125`；Chrome 为 `58.236328125`、`50.236328125`，像素分别有 380、277 个通道值不同 | 词距未参与空格定位；测量和绘制需要保持一致 |
| `textPropertyDraw_fontKerning_none`：20px Arial 绘制 `AVATAR` | 本地宽度 `74.08203125`，Chrome `80.01953125`；800 个通道值不同。auto/normal 对照一致 | [skia_backend.cpp](../src/skia_backend.cpp) 的 shaping 使用全局默认 kerning 设置，未读取上下文的 `fontKerning` |
| `bidi_*`：17px Arial、textAlign=left，分别在 ltr/rtl 下绘制希伯来文 U+05D0/U+05D1/U+05D2 及混合文本 `ab אב 12` | 4 项宽度相同，但字形边界和绘制不同：纯希伯来文两项各 183 个通道值不同，混合文本 ltr/rtl 分别有 288、466 个通道值不同 | `shape_text_blob` 固定使用 LTR 的 `TrivialBiDiRunIterator`，并调用不重排的 shaping 路径；需要按文本与 direction 生成双向分段并按视觉顺序排列 |
| `italicFallback_Arial_Microsoft YaHei`、`italicFallback_Arial_Noto Sans SC`、`italicFallback_Tahoma_SimSun`：斜体基础字体加显式中文回退，绘制 `A中a` | metrics 完全相同，但像素分别有 116、118、103 个通道值不同 | 基础字体的 `resolve_font` 会处理合成斜体，回退分段换字体时未完整重建相应绘制配置；需核对实际斜体与合成斜体、SkFont skew 及位图配置，现有证据不将三项归结为单一已证实根因 |
| `samplingQualityState`：设置 imageSmoothingQuality=high，save 后设 low，再 restore、无效赋值和 resize | 本地结果为 undefined/low/invalid/invalid；Chrome 为 low/high/high/low | imageSmoothingQuality 未注册为上下文状态。六个棋盘缩小绘制对照虽一致，但不足以证明所有采样质量行为已实现 |
| `patternPrototypeContract`：检查 CanvasPattern 原型描述符 | 本地 setTransform 不可枚举，Chrome 可枚举；本地 Symbol.toStringTag 是 getter，Chrome 是值为 CanvasPattern 的不可写数据属性 | [index.js](../index.js) 使用普通 class 默认描述符，需要按 Web IDL 接口特征定义属性；此项为接口可观察行为差异，不是像素失败 |

纯希伯来文三个字符的宽度为 `25.56640625`。本地 actual left/right 为 `[0,25.78466796875]`，Chrome 为 `[1,25.99560546875]`。混合文本宽度均为 `66.04931640625`；本地在两种 direction 下 left/right 均为 `[0,65.5947265625]`，Chrome ltr 为 `[0,66.478515625]`，rtl 为 `[-1,65.5947265625]`。

文字用例比较完整 96×48 图像，即 18432 个 RGBA 通道值。metrics 顺序为 width、left、right、ascent、descent；差异计数是通道值数量，不是像素数量。

## 一致项与范围

18 项一致包括 drawImage 和图案在 low/medium/high 下的棋盘缩小对照 6 项，copy 合成时的旋转、剪切、反射、奇异图案矩阵 4 项，源 Canvas resize 后的图案快照 1 项，零字距/词距以及 auto/normal kerning 4 项，以及其余 3 个斜体回退字体组合。

本轮没有发现这些对照的差异，但采样图像较简单，不能以 6 项像素一致代替 imageSmoothingQuality 的完整实现验证。未执行完整 Canvas 标准测试集；结论针对当前 Windows、Chrome 和字体环境。

## 证据与复现

[twelfth-round-review.json](twelfth-round-review.json) 保存完整逐项本地/Chrome 结果、17 项差异、像素计数、重复采集元数据、632 项回归、GC 结果及文件/字体哈希。[用例入口](../tests/fourth-round-cases.js) 为 `runTwelfthRoundCases`，[比较器](../tests/compare-twelfth-round.cjs) 校验源码哈希和完整用例集合，在独立子进程运行本地实现。

| 采集 | runId |
| --- | --- |
| 第十二轮独立采集 | `ee3e7c8c54214e3597d2f6425c013860` |
| 主回归附带重复采集 | `1abfd34cd6864c7ca8707af4f1887195` |
| demo | `79e9f60cb0294e49a4bfdd59d2ab5a00` |

最终脚本 SHA-256 为 `595C35D90DDC0474BF0DA49EB89636512983F9DDB04780C8E790CCB91A5F8096`。浏览器验证复用用户手动启动的 Chrome `153.0.8010.37`、端口 `9222`、连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，在后台测试页执行，没有操作鼠标、键盘或剪贴板，没有重启浏览器或调试服务。

在项目根目录、现有 Chrome 与持久 CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName twelfth-round
node tests/compare-twelfth-round.cjs
```

预期 `tested:35, matched:18, differing:17`，比较器退出 **1**，本地子进程退出 **0**。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

预期主回归退出 **0**，632 项通过，demo 零差异，渐变/图案 GC 通过；第十二轮仅附带采集，不计入该通过数。
