# RhineLabUI 博客

基于 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的独立博客版本：用实时三维档案阵列浏览文章与照片，保留白底开场、玻璃解密、滚动标题和模型拆解交互，增加真实登录、后台内容维护与 SQLite 持久化。

**首次安装为空库，没有默认管理员、默认密码或演示账户。** 本目录不包含任何线上数据库、私人文章、照片、会话或云账户配置。源码用于自建 Node 服务，GitHub Pages 不能运行本项目后端。

## 效果与功能

- 五列循环三维档案：左右切列、上下选档，抽取后阅读详情，支持检索与 TXT 导出。
- 360° 模型查看：拖动旋转、方向键平移、滚轮缩放、拆解和重组、清晰／磨砂切换。
- Markdown 全文阅读：标题目录、表格、列表、引用、代码块；HTML 经 DOMPurify 清理。
- 画廊：照片保持比例放入档案外壳，管理员可以上传、替换和移除。
- 管理员维护档案与账户；普通账户只读并可收藏；游客只读。
- 收藏存于数据库，按账户隔离，刷新、重新登录及服务重启后保留。
- 音效、音乐、画质与减少动态效果设置。浏览器通常需要一次点击才允许播放声音。

空库不会出现示例文章；登录管理员并新建档案后，内容才会进入三维队列。`clearance`（显示标签）是文案，**不是文章访问权限**：游客进入后可读所有档案及其照片，本版本没有私密文章、注册、邮箱验证、评论或找回密码邮件功能。

## 环境要求

- **Node.js 24.x LTS**（`>=24.0.0 <25`），含 npm。后端使用内置 `node:sqlite`，不要沿用上游纯前端项目的 Node 版本要求。
- 安装依赖时需要访问 npm registry；`package-lock.json` 锁定具体版本。
- 支持 WebGL 2 的现代浏览器；本副本在 Windows、Node 24.18.0 和 Chromium 上做功能验证。
- 前端：TypeScript、Three.js、Vite、Rolling Number、Marked、DOMPurify。数据库无须单独安装。
- 普通使用不需要 Blender、Python、FFmpeg 或 Azure CLI。

## 安装与本地运行

下载本源码目录，在目录内打开 PowerShell：

```powershell
node --version
npm ci
npm run check
npm run build
npm start
```

访问 <http://127.0.0.1:4173/>，点击“游客浏览”可检查空库页面。停止服务按 Ctrl+C。`npm run preview` 与 `npm start` 一样运行完整后端，不是纯静态预览。若 PowerShell 阻止 `npm.ps1`，改用 `npm.cmd`，无须降低系统执行策略。

首次运行默认创建 `.local-data/blog.sqlite`；此目录已被 `.gitignore` 排除。生产环境请改用发布目录外的持久化目录，见下文。

## 创建首个管理员

先确认创建脚本和网站使用**同一个 DATA_DIR**。未设置时二者均使用项目下 `.local-data`。在另一个 PowerShell 窗口运行：

```powershell
.\deploy\windows\Create-User.ps1 -Username 'site_owner' -Role admin
```

`site_owner` 只是用户名示例，可自行更换；它不会自动创建。脚本两次隐藏输入密码，再通过 UTF-8 标准输入调用现有 `server/create-user.mjs`，不将密码写入命令行、配置、文件或输出。账户名须为 3–32 位英文字母、数字、下划线或短横线；密码为 8–128 字符。选择独立且足够长的密码，不要把真实密码写进命令历史。

自定义数据目录时明确指定，例如：

```powershell
$env:DATA_DIR = 'C:\ProgramData\RhineBlog'
.\deploy\windows\Create-User.ps1 -Username 'site_owner' -Role admin -DataDirectory $env:DATA_DIR
```

需具备该目录读写权限。Windows Server 的受保护目录应在管理员 PowerShell 中操作。包装脚本兼容 Windows PowerShell 5.1 / PowerShell 7；若策略禁止执行，可对这一条受信任脚本使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Create-User.ps1 -Username site_owner -Role admin`。

自动化调用使用 `node server/create-user.mjs <用户名> admin`，由调用进程的标准输入提供密码并关闭输入流。脚本不接受密码位置参数，也不会生成密码；不要用包含明文密码的 `echo` 命令。`npm run user:add -- <用户名> admin` 也采用同一规则。默认角色为 `reader`，重复用户名会报错，不会重置已有账户。

## 登录、账户和收藏

每次打开或刷新页面均需重新登录或选择游客，旧页面身份会被撤销。服务端会话有效期为 12 小时，Cookie 为 HttpOnly、SameSite=Strict，HTTPS 生产环境还启用 Secure。共享浏览器中的多个标签页会共享 Cookie，刷新其中一个可能使其他标签页需要重新登录。

| 能力 | 管理员 | 普通账户 | 游客 |
| --- | --- | --- | --- |
| 浏览、检索、Markdown、画廊、模型与导出 | 是 | 是 | 是 |
| 持久化个人收藏 | 是 | 是 | 否 |
| 新建、编辑、删除档案及照片 | 是 | 否 | 否 |
| 创建普通账户、管理账户 | 是 | 否 | 否 |

管理员界面的“创建普通账户”和“账户管理”可以创建读者、删除其他账户、重置其他账户密码或修改自身密码。修改自己的密码需输入原密码；重置其他账户密码撤销该账户所有会话；修改自身密码保留当前会话并撤销其他会话。不能删除当前登录账户。普通账户暂不能自助修改密码，需联系站点管理员。新增管理员只能在服务器上调用创建脚本。

忘记唯一管理员密码时，拥有服务器权限的人可用上述隐藏输入脚本创建一个**不同用户名**的新管理员，登录后重置旧账户；核对完成后再处理临时恢复账户。不要修改源码设置通用密码，也不要删除数据库来“重置”。

收藏绑定数据库内部档案键：修改档案编号不会丢失收藏，删除档案会移除相关收藏；删除账户会删除其收藏。外观与音量等设备偏好仍保存在浏览器本地，与账户收藏不同。

## 编辑文章与照片

1. 管理员登录后选择栏目，点击“新建档案”，填写标题、副标题、分类、作者、日期、显示标签、HTTP/HTTPS 参考链接、摘要和段落。编号后缀可留空自动分配，或填写 `ARTICLE-001` 等唯一编号。
2. “档案摘要段落”用空行分段，至少一段；“阅读全文 · Markdown 正文”可填最多 100,000 字符。留空时全文使用摘要段落。支持 GFM 表格、代码块和标题目录，禁止执行脚本和 iframe。
3. 已有档案在详情页点“编辑”；保存立即对所有浏览者可见。并发修改会提示版本冲突，请刷新重新编辑。已有档案不能通过编辑器移动到另一栏目。
4. 默认第三列“画廊”可上传 JPG、PNG、WebP，原图最大 20 MB；浏览器缩放至最长边 2048 像素并转 JPEG，去掉原始 EXIF。服务端再验证 JPEG、最长边 4096 和 6 MB 限制。照片与文章一起存入 SQLite，不需要上传文件夹。
5. 删除档案会删除不再被引用的照片，恢复需要备份。Markdown 图片链接由浏览器请求，建议使用自己有权发布的图片；本系统不会把任意远程图片自动归档进数据库。

栏目显示名在 `content/column-labels.json`，内部分类在 `content/site.json`。保持五列且第三列仍为画廊；通常只改显示名即可。详见 [栏目配置](content/README.md)。这些 JSON 不用于保存文章，不会导入演示数据。

## 开发与验证

先完成一次构建，再用两个终端：

```powershell
# 终端一：开发时允许 Vite 页面作为请求来源
$env:APP_ORIGIN = 'http://127.0.0.1:5173'
npm start
# 终端二：前端热更新，端口被占用时直接报错
npm run dev -- --port 5173 --strictPort
```

开发浏览器访问 <http://127.0.0.1:5173/>。Vite 把 `/api` 转发给本机 4173；Origin 必须与浏览器地址一致，不要混用 `localhost` 和 `127.0.0.1`。恢复普通本地运行前，在后端终端运行 `Remove-Item Env:APP_ORIGIN -ErrorAction SilentlyContinue`。不要把开发服务器暴露到公网。

```powershell
npm run check                # 数据、权限、Markdown、备份、空库、模型及动画
npm run build                # 类型检查和生产构建
npx playwright install chromium
npm run test:accounts        # 账户管理与收藏浏览器回归
npm run test:reader          # Markdown 阅读与编辑浏览器回归
npm run release             # 检查、构建，生成白名单运行包
```

可设置 `BROWSER_EXECUTABLE` 指定已有 Chromium 可执行文件。测试使用系统临时目录与随机密码，结束后清理数据库，不接触站点数据。测试夹具仅供测试导入，不会在网站启动时加载。`release/` 生成目录被 Git 忽略；服务器运行包只需 Node 24，不需 npm 安装依赖。

本次整理的结果与验证边界见 [验证记录](docs/VERIFICATION.md)。交付源码目录已移除安装依赖和构建／测试产物；使用时按上述命令重新安装、构建即可。

`art/` 保留模型构建脚本，GLB 已随源码提供；未携带含历史环境信息的 Blender 二进制工程。`scripts/render-audio.mjs` 保留原创谱面与合成逻辑，可选 FFmpeg 用于重新编码，普通构建无须执行。该脚本会重写 `public/audio` 中的生成资源，生成前请自行保留改动。

## 生产部署与数据维护

推荐架构：浏览器 → HTTPS/Caddy → `127.0.0.1:4173` Node → 持久化 SQLite。可操作的 Windows Server 与 Azure Windows VM 步骤见 [部署指南](docs/DEPLOYMENT.zh-CN.md)，备份、升级、恢复见 [维护指南](docs/MAINTENANCE.zh-CN.md)。所有域名、目录和云资源名均为示例，部署前自行替换。

| 环境变量 | 默认值 / 含义 |
| --- | --- |
| `DATA_DIR` | 项目下 `.local-data`；生产须指向发布目录外的本地持久化盘 |
| `HOST` | `127.0.0.1`，仅反向代理访问后端 |
| `PORT` | `4173` |
| `APP_ORIGIN` | 开发可省略；生产必须 `https://example.com`，无路径、查询和尾部斜线 |
| `NODE_ENV` | 生产设 `production`，否则不会强制要求 HTTPS Origin |

`.env.example` 只是模板，`npm start` **不会自动读取 `.env`**。若使用 `.env`，复制模板后执行 `node --env-file=.env server/app.mjs`；创建账户也需同一环境，例如 `node --env-file=.env server/create-user.mjs <用户名> admin`（密码仍从 stdin 提供）。Windows 开机任务使用持久化目录的 `runtime.json`，由运行脚本设置环境变量，不读取 `.env`。

数据库包括账户密码哈希、会话、文章、照片、收藏和审计记录；`blog.sqlite-wal`、`blog.sqlite-shm` 是 SQLite 工作文件。不要公开数据目录、备份、日志或 `runtime.json`。不要在进程运行时只复制主数据库作为备份，使用 `npm run backup` 的 SQLite 在线备份接口；备份本身也含敏感数据。

本次验证为本地 Windows 功能验证，未实际新建云主机或执行系统服务安装。其他操作系统、容器、无服务器与多实例部署未在本副本验证，不提供可直接照搬的支持承诺；SQLite 目录不要放在 Azure 临时盘、共享网络盘或临时容器文件系统。

## 来源与许可

保留原作者 **Copyright (c) 2026 LBEILC** 及 [MIT LICENSE](LICENSE)。这是博客改造版，不能把上游当前 README 的 PWA、壁纸等能力当成本版本功能。

本软件使用 **MiSans 字体（小米）**，字体遵循自有许可；Three.js、Rolling Number、Marked 和 DOMPurify 各自保留许可。三轨配乐来自原项目程序合成，视频采样逐字音效已移除，改为 Web Audio 合成音。

《明日方舟》、莱茵生命名称、标志、视觉设定等第三方元素不因 MIT 自动获得授权。本副本未找到相应权利人的独立再分发授权，保留非官方来源说明；用于公开展示、再分发或商业用途前应按自身用途核实，必要时替换这些元素。[第三方许可与归属](THIRD_PARTY_NOTICES.md) 和 [来源核查记录](docs/PROVENANCE.md) 列出已确认与尚未确认的范围。
