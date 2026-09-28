# 来源核查记录

核查日期：2026-09-28。只读检查公开上游材料，不创建远程仓库或推送。

## 已确认

- 公开原项目为 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)，GitHub 仓库信息标为 MIT；本地随附 LICENSE 署名 LBEILC。
- 读取 `main` 时得到提交 **ee5779741c6c0c916e416705fa634c7abf905c73**。核查其 [LICENSE](https://github.com/LBEILC/RhineLabUI/blob/ee5779741c6c0c916e416705fa634c7abf905c73/LICENSE) 与 [README 的开源许可说明](https://github.com/LBEILC/RhineLabUI/blob/ee5779741c6c0c916e416705fa634c7abf905c73/README.md#开源许可)。本地与上游 LICENSE 在仅统一 CRLF/LF 后完全一致，本地文件原样保留。
- 上游明确授权其有权授权的自制 GLB、Blender 脚本、原创音乐等；同时明确排除《明日方舟》及其他第三方权利。不能从 MIT 推论所有资产均可无限制使用。
- 两个 GLB、三个 Ogg、MiSans 许可 PDF 与上述提交同路径文件 SHA-256 完全一致。GLB 内无图片、外部 buffer URI 或文件级 extras；音频 Vorbis 注释只有 FFmpeg 编码器信息。
- 四个完整 MiSans WOFF2 在上游较新提交中已换成另一套分片文件，因此先前同路径下载返回 404。进一步查询公开 Git 历史，确认本副本四个文件的 Git blob SHA-1 与历史提交 **9f6d3a2fea8b3eec87775e9805a94b286cffeaf5** 完全一致。该提交位于字体优化提交 `20d355377c524a85a06e7e2e61109a536391bd43` 之前。不能把路径变动误判为本地私有素材。
- MiSans PDF 全文已读取；四个 WOFF2 的字体名称表均标为 Version 4.009，包含小米与 Hanyi Fonts 的原始信息，无部署者元数据。字体原文件、版权通知、协议与运行时设置中的字体说明保留。官方来源链接沿用上游 NOTICE，未声称重新获得厂商授权。

## 范围与限制

输入是已有博客修改的源码快照，未提供 Git 元数据，无法证明整个目录精确对应原仓库的哪一次提交。本次只对明确列出的文件做散列或文本核对，没有编造快照提交号，也没有将其等同于最新上游。

官方字体最初下载版本及 WOFF2 生成过程未独立审计；本副本保持其上游字节内容。品牌、标志和原作视觉设计的独立再分发许可仍未确认，具体边界见根目录 THIRD_PARTY_NOTICES.md。原视频短音不再分发。

## 资源 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| `public/assets/archive-cassette.glb` | `dda42b9b3b471d11c69820a64084d254a64b27761287ab0e35dd8387ec0a0bed` |
| `public/assets/archive-assembly.glb` | `d411170676f55a327c286e67e462f98b446667811c725318bab85657eaee06ec` |
| `public/audio/atmosphere.ogg` | `a7c18ef30f096cae6056ca2db284f820a925fc4e7383bd2bf57f78cd9401dbcf` |
| `public/audio/motif.ogg` | `3503d692874e626112bcfb077d89239653eb28713182b6468b862d7f22572162` |
| `public/audio/pulse.ogg` | `fd8d82990d9eea07e83430042f1f3b772c6e07319f28561426122b49536fc012` |
| `public/fonts/MiSans-license.pdf` | `4a93a27cd2bd81b3b5ecfd0a853144a876fa26938a93a68443c67d74172fcb86` |
| `public/fonts/MiSans-Bold.woff2` | `1c5a7515b61bc82baaa2e2c2fdae2032479fb9a99e09d4d021dc17314fc5939b` |
| `public/fonts/MiSans-Demibold.woff2` | `7afe3737efaf6a137db0ef4857fbe4033a8802756485ebc7f008e96a4bdedcf2` |
| `public/fonts/MiSans-Light.woff2` | `2d1502a1cf0e41917844b512fb64be547cfb737e593d0da782c6b6762ea71c33` |
| `public/fonts/MiSans-Regular.woff2` | `d704c1a932c0bd7e8a071d276cd81c0ed0c9fecfa26ac234f4bed0559fe1cb2d` |

## 分发整理原则

仅白名单复制 `src`、后端源码、配置、必要生产资源、明确测试与模型脚本；文档、部署模板和发布打包器按实际代码重写。未复制真实数据库或 WAL、密码哈希、会话、照片、私人文章、备份、Azure 登录资料、缓存、部署补丁或嵌入载荷、历史发布包、截图、日志和本地开发历史。

原作者与第三方版权姓名、许可联系邮箱是合法署名材料，保留；站点部署者用户名、域名、IP、云标识与本机目录不进入分发内容。测试账户密码每次随机生成，数据库置于临时目录并清理；新安装没有默认账户或内容。发布包采用单独的运行文件白名单。
