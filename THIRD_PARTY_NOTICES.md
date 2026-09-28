# 许可与第三方归属

## 原工程与本分发版

原工程：[LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)。保留 **Copyright (c) 2026 LBEILC** 与完整 MIT [LICENSE](LICENSE)。原作者身份、第三方版权署名和许可联系信息不属于需删除的部署者个人信息。

2026-09-28 核查原仓库提交 `ee5779741c6c0c916e416705fa634c7abf905c73` 的 LICENSE 与 README。其 README 明确将作者创作且有权授权的代码、建模脚本、文档、Blender 源工程、GLB、原创配乐及音效等纳入 MIT，同时排除第三方权利；两个生产 GLB 被明确点名。本副本是早期源码快照上的博客改造，不能视为上游该提交的完整镜像。来源与散列证据见 [PROVENANCE](docs/PROVENANCE.md)。

## 分发资源清单

| 资源 | 归属 / 许可 | 本副本处理 |
| --- | --- | --- |
| 作者自行创作的代码、建模脚本、两个 GLB 模型与原创三轨配乐 | LBEILC，MIT；第三方元素除外 | 保留 LICENSE 与来源；GLB 和 Ogg 与上述提交逐字节一致 |
| `src/brand.ts`、启动标志、favicon、界面和模型中的莱茵生命元素 | 《明日方舟》相关权利人；非本项目 MIT 授权范围 | 保留非官方归属，不声称获得官方许可 |
| `public/fonts/MiSans-*.woff2` | MiSans，小米；MiSans 字体知识产权许可协议 | 保留四个上游字体原文件、NOTICE 和许可 PDF，设置界面也注明使用 MiSans |
| `@kitlangton/rolling-number` 0.4.1 | Kit Langton，MIT | 完整许可见 `public/licenses/rolling-number.txt` |
| `three` 0.183.2 | three.js authors，MIT | 完整许可见 `public/licenses/three.txt` |
| `marked` 18.0.14 | 包内所列作者／贡献者，MIT | 完整许可见 `public/licenses/marked.txt` |
| `dompurify` 3.4.16 | Cure53 和包内所列贡献者，MPL-2.0 OR Apache-2.0 | 分发 Apache-2.0 与 MPL-2.0 两份原文，见 `public/licenses/dompurify*.txt` |
| 画廊测试 JPEG | 此整理版生成的 64×48 纯色矩形 | 仅作自动测试夹具，不是用户照片，不进入生产运行包 |

以上依赖的精确安装版本以 `package-lock.json` 为准。构建工具、测试工具及其传递依赖遵循各自包内许可证；本目录不分发 `node_modules`。Vite 构建会将 `public/licenses` 原文复制到生产静态资源目录，以便构建包也保留署名。运行后端使用 Node 内置模块，Node 自身遵循其发行许可。

MiSans 协议要求软件注明使用该字体、保留版权和协议，禁止对字体／组件改编或二次开发，也限制将字体单独再分发、转许可或售卖。本项目将字体作为应用组成部分使用，未裁剪、修改字形或改写字体文件；这不授予把字体单独作为字体包再分发的权利。完整条款以 [MiSans-license.pdf](public/fonts/MiSans-license.pdf) 为准。字体与原项目历史提交一致；官方初始下载版本和格式生成流程未独立审计，不将上游来源说明冒充字体厂商的再次授权。

## 尚未确认的第三方权利

视觉参考是《明日方舟》特别映像「莱茵生命：访问」[BV1rr4y1b7sz](https://www.bilibili.com/video/BV1rr4y1b7sz/)。项目与官方无隶属关系；名称、标志、设定、原作视觉设计、原 PV 及原声的权利归各自权利人。本次未找到这些元素的独立再分发许可，原作者的 MIT 只能覆盖其有权授权的内容。公开展示、再分发或商业用途应根据具体使用场景核实相关授权，必要时替换标志和原作视觉元素。不要将本文件表述为官方认可或法律授权保证。

本副本未分发原视频、原片输入采样、提取后的 PCM、采样预览、私人截图／照片或历史发布包。原采样逐字音已改为 Web Audio 程序合成；三轨原创配乐保留原作者谱面。没有纳入 Novecento 字体，因此不会因上游其他版本使用该字体而假称本副本拥有其授权。

后续添加照片、文章、字体或音乐时，其许可需单独确认，不能自动套用根目录 MIT。
