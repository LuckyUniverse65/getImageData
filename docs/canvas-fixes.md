# OffscreenCanvas 修复与验证记录

日期：2026-09-14。修复前基线：`84575300d87e517020f034cc96b4c99b528fb7c4`。

本次修改 JS 包装、Rust Node-API 绑定、Skia C++ 后端及测试入口，并重新构建了 `webgl.node`。原始 `demo.js` 和修复前的 `snapshot/` 保持不变。

## 修复内容

| 问题 | 修改 | 验证 |
| --- | --- | --- |
| 路径随后续变换错误移动 | 路径记录其局部坐标空间；CTM 改变时重新换算既有路径。绘制、裁剪、命中测试使用一致的坐标规则。 | 平移、缩放、混合变换、save/restore、裁剪和命中测试。 |
| 渐变赋值后更新失效 | Rust 使用共享渐变数据，并持有 JS 对象引用；保存状态共享该引用，getter 返回原对象。 | 动态色标、多上下文共享、保存恢复、色标异常，以及独立 Node 进程强制 GC。 |
| resize 重建上下文 | JS 调用原生上下文的原位 resize；重新分配 surface 并重置状态，对象身份不变。 | 相同尺寸重置、清除旧像素与状态、零尺寸后恢复、`context.canvas` 身份。 |
| reset 留下基础裁剪 | Skia 保留一个受保护的初始 save frame；reset 恢复该层、重置矩阵，再建立干净的工作层。 | 未调用 save 的 clip、嵌套 save、变换、路径清空与多余 restore。 |
| 导出伪 PNG 并清空画布 | 新增 PNG 编码器；Blob 导出从当前像素快照生成图片。位图转移仅清空像素，保留上下文状态；补充 Graphite 图像上传以便 drawImage 消费位图。 | 原生浏览器解码与 Node 独立 PNG 解码、透明度、异步快照、状态保留和零尺寸异常。 |
| 圆弧忽略逆时针参数 | 将方向传入 C++，归一化有向角度；独立圆弧使用 drawArc，连接其他线段时使用路径。 | 顺/逆时针 arc、ellipse、完整圆周、负角度、旋转椭圆、连接线段及负半径异常。 |
| getImageData 尺寸与异常错误 | 参数按有限有符号整数范围转换，小数向零截断；负尺寸调整起点，零尺寸抛 IndexSizeError，非有限输入或缺参抛 TypeError。 | 正/负尺寸、小数、越界透明填充、NaN 和缺参。 |
| 验证脚本输出协议不匹配 | data.js 最后一行输出完整像素 CSV；test.js 同时运行本地检查和现有 F12 对比，移除新启动浏览器的路径。 | 34 项兼容性结果及 demo 的 9216 个 RGBA 值对比。 |

## 本次验收结果

执行命令：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\canvas-task.ps1 -Action Test
```

所有浏览器数据均来自用户手动打开的 Chrome/F12，未使用新启动的浏览器或历史参考数组作为浏览器结果。

| 项目 | 结果 |
| --- | --- |
| 浏览器 | Chrome 153.0.8010.37，`user-visible-f12` |
| 兼容性用例 | 34 / 34，与 F12 结果一致 |
| 渐变强制 GC | 通过 |
| demo | 9216 个值，0 个差异 |
| 兼容性采集编号 | `3c73f50dc09f426b945b7b535ae4920a` |
| demo 采集编号 | `b5680784e36f4b56a3625114df3a4d62` |

本机证据文件：

- `out/verification-result.json`：汇总结果。
- `out/compatibility-browser.json`、`out/compatibility-f12.png`：兼容性数据和 F12 截图。
- `out/demo-browser.json`、`out/demo-f12.png`：本次 demo 数据和 F12 截图。
- `out/local-cases.json`：独立 Node 执行结果。
- `out/readback-browser.json`、`out/readback-f12.png`：越界读取专项复核。

每次采集记录运行编号、时间、浏览器版本和测试源码 SHA-256。`out/` 为本地输出目录，不默认提交到 Git。

## Chrome 越界读取差异

在同一个 F12 中复核：24×24 画布的 `(0,0)` 绘制一个红色像素后，`getImageData(-1,-1,2,2)` 的正确结果应为三个透明像素加一个红色像素。

本次 Chrome 153 默认 GPU 路径返回了四个红色像素；另一个部分越界矩形还返回了异常边缘数据。`willReadFrequently: true` 的 CPU 路径则返回正确透明填充。完全位于画布外的读取，两条路径都返回透明。

本地实现保留正确透明填充。`outOfBoundsRead` 用例明确以同一手动 Chrome/F12 的 CPU 读取为参照；其余用例及 demo 使用默认后端。本项目不复现 GPU 越界读取的异常数据。

## 支持范围

- Blob 导出支持 PNG。请求 JPEG、WebP 或未支持的 MIME 时回退为 `image/png`；不承诺与 Chrome PNG 压缩字节完全相同，验证的是解码后的像素。
- 位图为本地兼容对象，提供尺寸、像素、`drawImage` 使用及 `close()`；不是浏览器原生跨线程 transferable。
- 当前 F12 自动化要求一个已打开的独立 DevTools Console 窗口，执行时短暂聚焦并使用剪贴板，结束后恢复。未加入自动启动或重启 Chrome 的逻辑。
- 本次不扩展完整 CanvasPattern、所有浏览器图像源、奇异矩阵下的全部边界行为或 WebGL pipeline。
- 编译通过；编译器仍报告基线已有的未使用代码等警告。

后续回归使用 `node test.js`；只验证本地行为使用 `node test.js --local`。历史交接文件 `HANDOFF.md` 描述的是基线，其旧测试方式以当前 README 为准。
