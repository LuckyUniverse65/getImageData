# OffscreenCanvas 第十三轮兼容性检测

2026-09-16，在 `fe259fcffc58d4cc7433d80e45ebd31830eebd45` 上新增 **57 项检测：25 项一致，32 项存在差异**，两次 Chrome 实时采集结果完全一致。32 是失败用例数，不是独立缺陷数。本轮为诊断，生产实现及原生模块未修改，以下差异尚未修复。

原有 **702 项回归全部通过**，demo 的 **9216 个 RGBA 值零差异**，渐变和图案 GC 检查通过。前十二轮用例逐字节保持不变。第十三轮仍未计入主回归通过数；主入口会附带采集，但差异由独立比较器报告。

## 问题与修复入口

| 类别 / 失败用例数 | 触发与实测证据 | 实现路径与判断 |
| --- | --- | --- |
| 零尺寸文字测量 / 7 | 0×0、0×48、112×0；17px Arial、letterSpacing=1px 测量 Ab c，本地宽度 40.8，Chrome 38.0166015625，且本地字形边界全为 0。small-caps Tahoma 的 Chrome 宽度为 33.78515625，本地仍为 40.8。正常画布 resize 到零期间同样出现测量退化。 | [webgl_native.rs](../src/webgl_native.rs) 的 measureText 在 native 为空时使用字符数×字号×0.6，并跳过真实字形和字体度量；[skia_backend.cpp](../src/skia_backend.cpp) 的 skia_canvas_create 在尺寸为零时返回空指针。文字布局应独立于像素表面存在。 |
| 双向文字与字体回退结合 / 1 | rtl 下使用 Arial + Microsoft YaHei 绘制 ab、希伯来字母、中文及数字的混合文本，宽度均为 83.04931640625，但边界不同，588 个通道值不同。对应 ltr 与无中文控制一致。 | font_runs_blob 先按逻辑顺序划分回退字体，再各自 shaping 和拼接；各分段内部的 bidi 重排不足以保证跨字体分段的完整视觉顺序。需要先保留整段 bidi 关系再排布字体子段。 |
| 特殊字符及阿拉伯文字距 / 8 | 字距 2px 时，零宽空格、word joiner、ZWJ、方向标记、软连字符多计 2px；阿拉伯文 سلام 本地 30.97705078125、Chrome 24.97705078125。ZWJ 和软连字符在零字距下度量相同，但像素仍分别有 50、120 个通道值不同。 | PositionedRunHandler::spacing 对每个字形簇无条件加字距，缺少零宽字符和连写脚本规则。零字距下的像素问题应另查 make_shaped_text_blob 的直接字形绘制分支，不能归因于字距累加这一处。 |
| 缺少文字属性 / 5 | fontStretch、fontVariantCaps、textRendering 的默认值均为 undefined，save/restore、无效赋值和 reset 不生效。condensed 与 small-caps 绘制也不同：AVabc 的宽度分别为本地 55.95703125 / Chrome 45.91796875，以及本地 55.95703125 / Chrome 58.056640625。 | 原生属性表尚未注册这三项，JS 赋值成为普通字段。需要加入状态、字体选择/字形特性及布局选项。textRendering=optimizeSpeed 的单个绘制控制虽一致，不能证明其余模式已实现。 |
| 字距序列化、单位及负值边界 / 2 | 0.123456789px 的 Chrome getter 为 0.123457px；1.23456789em 为 1.23457em，但当前代码返回全部小数。Chrome 接受 2lh、2rlh，当前保留原 3px。letterSpacing=-40px 时宽度一致为 -92.59912109375，actualBoundingBoxLeft 本地 62.93798828125、Chrome 92.59912109375。 | [canvas_css.rs](../src/canvas_css.rs) 的 spacing 使用 f64 默认格式化，单位表缺少 lh/rlh；负字距还需对应 Chrome 负宽度 ShapeResult 的墨迹边界处理，不能只改 getter。两项中各包含多个边界输入。 |
| drawImage 缩放及质量档位 / 9 | 13×11 的彩色、部分透明图像放大到分数坐标矩形：low/medium 各 1839 个通道值不同，high 为 2521；缩小三档各 81。不透明图像缩小/放大仍有 27/112 个差异，关闭平滑后仍有 112。源像素、原尺寸整数复制及三档图案采样一致。 | skia_canvas_draw_rgba_image 使用非预乘 RGBA 上传、线性/最近邻采样和 drawImageRect；不同于已有图案路径。透明预乘、分数目标矩形边缘与采样需要分别核查，目前不能把全部差异归结为一个原因。image_quality 只保存于 Rust 状态，尚未传入绘制；本地 high 与 low 完全相同，而 Chrome 放大时二者相差 2289 个通道值，质量选项未生效已得到实证。 |

普通文字图像为 112×48，逐个比较 21504 个 RGBA 通道值；采样图像为 32×24，比较 3072 个通道值。上述数值是通道值数量，不是像素数量。度量序列为 width、actual left/right/ascent/descent、font ascent/descent。

## 一致控制与结论范围

25 项一致包括：其余五项 bidi/字体组合；零字距下的部分零宽字符、方向标记、阿拉伯文；组合重音和 emoji 的两档字距；Tahoma、Courier New、Consolas 的 auto/none kerning；optimizeSpeed 的当前绘制；三档图案采样；源图像像素；原尺寸整数 drawImage。

图像差异不能由源数据不同解释，因为源像素逐通道相同。也不能全部归因于 alpha 插值，因为不透明和最近邻对照仍有差异。当前证据确认 drawImage 路径和质量选项存在问题，但尚未唯一定位所有像素差异的原因。本轮没有执行完整 Canvas 标准测试集，结论针对当前 Windows、安装字体及 Chrome 版本。

## 验证与复现

全部浏览器验证复用用户手动启动的 Chrome **153.0.8010.48**、端口 **9222**、连接 **3f3dfe73-4928-4759-ad39-cd214de31a22**。没有重启 Chrome 或 CDP 服务，没有操作鼠标、键盘或剪贴板。

| 采集 | runId |
| --- | --- |
| 第十三轮独立采集 | `73095c16d2a04cde91b001a5a02a54ad` |
| 完整回归中的重复采集 | `53e9ba03504f43bc8fc63c2a49a545dd` |
| demo | `b13f09b264704400884953f16fbc38e7` |

脚本 SHA-256：`DFDD0E10239EC7C80F1DB9E7BC43A80681DFD1122A313794B67BC1EEFC60ED29`。独立本地子进程正常退出 0；比较器因已确认差异退出 1，未发生崩溃。

[thirteenth-round-review.json](thirteenth-round-review.json) 保存完整本地/Chrome 结果、32 项差异、重复采集元数据、702 项回归、GC 结果、生产文件和诊断脚本哈希。生产文件哈希与第十二轮验收一致。

在已有 Chrome 和持久 CDP 连接可用时运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName thirteenth-round
node tests/compare-thirteenth-round.cjs
```

预期 tested=57、matched=25、differing=32，比较器退出 1。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

预期原有 702 项通过、demo 零差异、GC 通过，退出 0；新诊断不计入此通过数。[用例入口](../tests/fourth-round-cases.js) 为 runThirteenthRoundCases，[独立比较器](../tests/compare-thirteenth-round.cjs) 校验浏览器来源、脚本哈希和完整用例集合。
