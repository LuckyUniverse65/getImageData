# OffscreenCanvas 第十一轮兼容性检测

2026-09-15，在提交 `00e381fee607692a563164b1fd42c962b149d488` 上新增 **34 项检测：9 项一致，25 项存在差异**。两次最终脚本的 Chrome 结果完全一致。本轮只增加诊断用例和文档，以下问题尚未修复；25 是失败用例数，不是独立缺陷数。

原有 **578 项回归全部通过**，demo 的 **9216 个 RGBA 值零差异**，渐变 GC 检查通过。生产源文件、`webgl.node`、`demo.js` 和 `test.js` 的哈希与第十轮验收一致。第十一轮诊断未纳入主回归的通过计数。

## 已确认问题

| 用例与触发方式 | 本地与 Chrome 的差异 | 实现路径与修复方向 |
| --- | --- | --- |
| `patternIdentity_fillStyle/strokeStyle`：赋值图案，再 save/restore | 本地 getter 返回字符串，`=== pattern` 为 false；Chrome 返回原图案对象，赋值与恢复后均为 true | [webgl_native.rs](../src/webgl_native.rs) 的 `Style::Pattern` 保存数据副本，`style_value` 将其序列化为颜色；需要保存对象引用与共享图案状态 |
| `patternCrossContextIdentity`、`patternInvalidAssignment_fillStyle/strokeStyle` | 跨上下文设置图案、赋值无效颜色后的身份检查均失败；跨上下文绘制像素实际一致 | 同一 getter 身份问题的扩展证据；不能仅凭身份失败断言无效颜色修改了实际绘制状态 |
| `patternSetTransformAPI` | 本地 `typeof p.setTransform` 为 undefined、tag 为 `[object Object]`；Chrome 为 function、`[object CanvasPattern]` | `create_pattern` 仅创建并包装普通对象，没有提供 CanvasPattern 的变换接口与对象标记 |
| `patternTransform_identity/translation/scale/singular/nonfinite/aliasConflict` | 本地均因缺少方法抛 TypeError；Chrome 支持有效矩阵、奇异矩阵及非有限值参数，冲突别名抛 TypeError | 需要补充矩阵字典转换、变换状态和 shader 局部矩阵。测试包含方法可用性，避免将“缺少方法”误当成别名校验通过 |
| `patternTransformAfterSave`、`patternFrozenTransform` | Chrome 在赋值、save 后修改图案矩阵，restore 后仍使用修改后的图案；冻结对象也可修改内部矩阵。本地因方法缺失失败 | 图案状态需要共享，不能只在赋值时复制；冻结普通属性不应阻止内部矩阵更新 |
| `patternSmoothing_true`：红蓝相邻图案经上下文放大 2.5 倍 | 16×12 图像有 384 个通道值不同；本地保持最近邻块状采样，Chrome 使用平滑采样。关闭平滑的对照一致 | [skia_backend.cpp](../src/skia_backend.cpp) 的 `skia_canvas_set_pattern` 固定使用默认 `SkSamplingOptions()`，未接入 `imageSmoothingEnabled` |
| `sourceReadbackOverride_drawImage/createPattern/transfer/blob`：覆盖源上下文的 getImageData，使其抛 RangeError | 本地调用被覆盖方法一次并失败；Chrome 不调用该方法，绘制、转移或编码正常完成 | [index.js](../index.js) 的 `#readPixels` 仍调用 `context.getImageData`；内部读取需要使用不可被外部属性替换的入口 |
| `sourceResizeOverride`：设置源上下文自有 `_resize` 方法，使其抛错 | 本地调用一次并抛 RangeError，尺寸保持 2×2；Chrome 忽略该自有属性，正常改为 3×2 并清空内容 | `#resize` 仍通过公开属性查找原生扩展方法 |
| `sourceTransferClearOverride`：设置源上下文自有 `_clearBitmap` 方法，使其抛错 | 本地抛 RangeError，目标透明、源图像未清空；Chrome 正常转移并清空源图像 | `transferToImageBitmap` 仍通过公开属性调用内部清理方法 |
| `fallbackFamilyList_Microsoft YaHei_normal/small-caps`：`17px Tahoma, "Microsoft YaHei"` 绘制 `A中a` | 宽度一致，本地 ascent 为 15，Chrome 为 14；每项 98 个通道值不同 | [skia_backend.cpp](../src/skia_backend.cpp) 的 `resolve_font` 在找到首个已安装字体后结束，`fallback_runs` 只获得该字体，无法继续按用户列表选取字形；本地转而采用 Noto Sans SC |
| `fallbackFamilyList_SimSun_normal/small-caps`：Tahoma 后指定 SimSun | 宽度一致，本地 descent 为 2，Chrome 为 1；每项 118 个通道值不同 | 同一字体列表回退问题；必须先检查后续显式候选，再采用系统回退 |

图案的 identity 和冲突别名用例中，部分像素数组仍然一致；失败来自接口或对象身份。非有限矩阵用例保存了 Chrome 的完整输出，不将它推断为“忽略参数”，具体转换规则需要在修复时核对。

## 一致项与检查范围

9 项一致包括关闭平滑的图案放大、Canvas 与已关闭 Bitmap 的图案快照、图案 alpha/阴影、显式追加 Noto Sans SC 的两种样式，以及混合拉丁文、间距标记和中文的普通、斜体与 small-caps 绘制。

图案绘制比较完整 16×12 图像（768 个 RGBA 值），字体绘制比较完整 64×40 图像（10240 个 RGBA 值）。差异计数是通道值数量，不是像素数量。字体 metrics 顺序为 width、left、right、ascent、descent。

未执行完整 Canvas 标准测试集，结论针对当前 Windows、Chrome 和字体环境。旧回归通过仅表示已有覆盖未退化。

## 证据与复现

[eleventh-round-review.json](eleventh-round-review.json) 包含逐项本地/浏览器结果、25 项差异、重复采集元数据、回归结果、文件和字体哈希。[用例入口](../tests/fourth-round-cases.js) 为 `runEleventhRoundCases`，[比较器](../tests/compare-eleventh-round.cjs) 检查源码哈希与完整用例集合，并在独立子进程中运行本地实现。

| 最终采集 | runId |
| --- | --- |
| 第十一轮独立采集 | `1c1387f2da48422bb8ff63e2975d8b2b` |
| 主回归附带重复采集 | `33d0e80a6f0145f8a0e551f253e6ef07` |
| demo 验证 | `e02bc96396b94e0eb3f59ddeff5d92bd` |

最终测试脚本 SHA-256 为 `D6022858EC67F0F24917D52A303447B7877DF54B012808BA33A80FA5E810AA1F`。编辑时出现过字符编码转换，已恢复前十轮用例并逐字节核对；本报告只采用恢复后的最终脚本采集和回归结果。

浏览器验证复用用户手动启动的 Chrome `153.0.8010.37`、端口 `9222`、连接 `f823af05-4dbf-4e1f-b5f5-31251732a225`，在后台页执行，没有操作鼠标、键盘或剪贴板，没有重启浏览器或调试服务。

在项目根目录、现有 Chrome 与持久 CDP 会话可用时执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Capture -ScriptPath tests/fourth-round-cases.js -OutputName eleventh-round
node tests/compare-eleventh-round.cjs
```

预期 `tested:34, matched:9, differing:25`，比较器退出 **1**，本地子进程退出 **0**。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

预期主回归退出 **0**：578 项通过，demo 零差异，GC 通过。第十一轮仅附带采集，不计入该通过数。
