# 持久化、备份、升级与恢复

## 数据在哪里

默认 `.local-data/blog.sqlite`；生产示例为 `C:\ProgramData\RhineBlog\blog.sqlite`，由 `DATA_DIR` 或 Windows 任务的 `runtime.json` 指定。账户及 scrypt 密码哈希、会话、文章、照片 BLOB、每账户收藏、审计都在数据库里。SQLite 使用 WAL 模式，运行时还可能有 `blog.sqlite-wal` 与 `blog.sqlite-shm`。它们与数据库都不能提交到 Git。

Windows 任务的 `logs/` 是运行日志，需自行定期保留与轮换；`backups/` 默认也在同一数据目录。Caddy 证书和代理日志在 `C:\ProgramData\RhineBlogProxy`。源码、前端 dist、锁文件、栏目配置与数据库各自备份；仅备份源代码不能恢复文章。

## 在线一致性备份

在有数据目录权限的 PowerShell 中运行：

```powershell
Set-Location 'C:\Sites\RhineBlog'
$env:DATA_DIR = 'C:\ProgramData\RhineBlog'
npm run backup
```

也可执行 `node server/maintenance.mjs backup`。脚本调用 Node SQLite 的在线备份 API，输出带时间戳的 `DATA_DIR/backups/backup-*.sqlite`，可在网站运行时执行。**不要在运行中单独复制 blog.sqlite 或遗漏 WAL**。备份文件包含敏感数据，应保持私有、加密保存并复制到独立可靠存储；本地同盘副本不能抵御整机或磁盘丢失。脚本不会自动外传、加密、定时备份或删除旧备份，需要部署者安排计划和保留周期。

定期把备份恢复到隔离测试目录验证管理员登录、文章、照片和收藏。复原测试含真实数据时仅绑定本机，不能发布成另一个公开测试网站。

## 升级（使用固定应用路径）

1. 在构建机器验证新源码并 `npm run release`，将新运行包内部内容放到服务器的**新目录** `C:\Sites\RhineBlog-next`。不要复制任何 `.local-data`，不要覆盖持久化数据目录。
2. 记录当前 Node 版本、`runtime.json` 和栏目配置，执行一次在线备份。备份成功且可读取后进入维护窗口。
3. `Stop-ScheduledTask -TaskName 'RhineBlog'`；确认任务停止且 `Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue` 无监听，再继续。若仍有监听，先确认对应进程并正常停止它，不要盲目结束同机其他 Node 服务。Caddy 暂时返回 502 是维护期预期状态。
4. 将旧 `C:\Sites\RhineBlog` 改名保存为一个未使用的版本目录，将 `RhineBlog-next` 改名为 `RhineBlog`。两次移动都应使用明确路径并确认目标不存在。数据目录 `C:\ProgramData\RhineBlog` 不动，任务的应用路径因此保持有效。
5. 给新应用目录授予运行账户读权限：`icacls.exe C:\Sites\RhineBlog /grant '*S-1-5-19:(OI)(CI)RX' /T`。检查新 `content/` 与前端 `dist/` 同步；若自定义显示名，应在构建前合入新源码，而不是部署后只改半份配置。
6. `Start-ScheduledTask -TaskName 'RhineBlog'`，依次验证本地 `/healthz`、HTTPS 登录、原文章与照片、个人收藏。现有 SQLite 表结构会在启动时补齐所需表与索引，不会重新播种演示内容。
7. 保留旧运行包与升级前数据库备份直到新版本稳定。程序回滚需考虑数据库格式兼容性；若不兼容，使用匹配旧程序的备份恢复，升级后新增的数据需先单独保存。

本流程不需要重新执行 Install-BlogTask；该脚本会拒绝覆盖同名任务。若要改应用路径、数据目录或域名，应同时维护任务 Action、运行配置和 Caddy 配置，并停服核对新旧路径，不能只改一个文件。

## 从备份恢复

恢复会使站点回到备份时刻。先验证选中的备份、计划好停机窗口；如果还能运行，先对当前状态再备份一次。

1. 停止 `RhineBlog` 任务并确认 4173 不再监听。不要在 Node 仍打开数据库时替换文件。
2. 将整个现有数据目录改名为一个**不存在的私有保留目录**，保留其中的数据库、WAL、SHM、配置及备份用于回退；不要把旧 WAL/SHM 与待恢复的新数据库混用。
3. 在原路径重新建立数据目录与 `logs/`，将选择的在线备份复制为 `blog.sqlite`；复制原先已核对的 `runtime.json`。不要从保留目录复制旧 WAL 或 SHM。
4. 重新设置目录 ACL（管理员 PowerShell）：

   ```powershell
   $dataDir = 'C:\ProgramData\RhineBlog'
   & icacls.exe $dataDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' /T
   ```

5. 恢复的数据库可能包含备份时仍有效的会话，启动服务前建议清空会话。在应用目录、正确的 `DATA_DIR` 下执行下列固定 SQL（不修改账户密码）：

   ```powershell
   $env:DATA_DIR = 'C:\ProgramData\RhineBlog'
   @'
   import {openStore} from "./server/store.mjs";
   const db = openStore();
   try { db.exec("DELETE FROM sessions"); } finally { db.close(); }
   '@ | node --input-type=module
   ```

6. 启动任务，验证 HTTPS、登录、文章、照片、收藏；保留旧目录直到确认恢复成功。恢复后的密码是备份时的密码，有需要再通过账户管理重置。

数据目录、其私有保留目录和备份都必须放在网站静态根目录之外。Caddy 证书恢复与数据库恢复分开处理，证书目录也不能进入公开源码。

## 其他维护命令

`maintenance.mjs clear-archives --confirm-delete-all` 是破坏性维护命令：先备份，再删除全部档案、照片、会话和相关审计，账户保留，档案收藏随档案删除。必须先停服。本命令不用于普通初始化、升级或恢复，不需要为了首次运行执行它。

本项目没有自动数据清理、定时备份、容量告警或日志轮换服务；随着照片增加，应监控磁盘使用量、备份体积与恢复耗时。
