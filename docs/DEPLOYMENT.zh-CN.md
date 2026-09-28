# Windows Server 与 Azure VM 部署

本指南部署的是需要 Node 后端的独立博客。以下 `example.com`、`C:\Sites\RhineBlog`、资源名均为占位示例。没有真实域名、云订阅、租户、IP 或管理员凭据，也不需要 Azure CLI 登录缓存。

## 1. 准备运行包

在构建机器的源码目录运行 `npm ci`、`npm run release`。将生成的 `release/rhine-blog-时间戳` **内部内容**复制到服务器 `C:\Sites\RhineBlog`，确保有 `dist/index.html`、`server/`、`content/`、`deploy/`。运行包不含数据库，也不会创建账户；包内后端只用 Node 内置模块，服务器无需 `npm ci`。

在服务器安装官方 Node.js 24.x LTS（面向所有用户），检查：

```powershell
& 'C:\Program Files\nodejs\node.exe' --version
```

准备一个由你控制的域名，将 A 记录指向服务器公网 IPv4；如果没有可用 IPv6，不要配置错误的 AAAA。安装来自官方渠道的 Caddy 2，以下例子把 `caddy.exe` 放在 `C:\Tools\Caddy\caddy.exe`。这些安装需要你在自己的服务器上执行；源码整理过程不会执行。

## 2. 安装 Node 开机任务

在服务器以管理员身份打开 PowerShell：

```powershell
Set-Location 'C:\Sites\RhineBlog'
.\deploy\windows\Install-BlogTask.ps1 `
  -AppOrigin 'https://example.com' `
  -AppDirectory 'C:\Sites\RhineBlog' `
  -DataDirectory 'C:\ProgramData\RhineBlog'
Invoke-RestMethod 'http://127.0.0.1:4173/healthz'
```

预期健康检查返回 `status: ok`。安装脚本只创建运行配置、目录 ACL 和名为 `RhineBlog` 的任务，以 **LOCAL SERVICE** 运行；没有生成或内置管理员密码。数据目录必须是发布目录以外的本地持久化目录，脚本会限制其访问权限，并赋予运行账户必要读写权限。已有同名任务时脚本拒绝覆盖，升级流程见维护文档。

`C:\ProgramData\RhineBlog\runtime.json` 保存 AppDirectory、DataDirectory、NodePath、AppOrigin。运行脚本设置 `NODE_ENV=production`、`HOST=127.0.0.1`、`PORT=4173`；不要把后端端口直接对公网开放。

创建首个管理员，密码两次隐藏输入：

```powershell
.\deploy\windows\Create-User.ps1 `
  -Username 'site_owner' -Role admin `
  -DataDirectory 'C:\ProgramData\RhineBlog'
```

此处 `DATA_DIR` 必须与开机任务相同。运行脚本需 Node 在 PATH；也可加 `-NodePath 'C:\Program Files\nodejs\node.exe'`。创建成功后无需重启服务，账户保存在同一数据库。

## 3. Caddy HTTPS 反向代理

把包内 `deploy/windows/Caddyfile` 复制到 `C:\ProgramData\RhineBlogProxy\Caddyfile`，将站点地址 `example.com` 替换为实际域名，保持与 `APP_ORIGIN` 的主机名一致。使用默认 443 时不加端口，不加路径。不要在网站目录放证书私钥。

```powershell
$proxyDir = 'C:\ProgramData\RhineBlogProxy'
New-Item -ItemType Directory -Path $proxyDir -Force | Out-Null
Copy-Item '.\deploy\windows\Caddyfile' (Join-Path $proxyDir 'Caddyfile')
# 现在编辑复制出来的 Caddyfile，将 example.com 换成自己的域名。
notepad.exe (Join-Path $proxyDir 'Caddyfile')
& icacls.exe $proxyDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' /T
& icacls.exe 'C:\Tools\Caddy' /grant '*S-1-5-19:(OI)(CI)RX' /T
& 'C:\Tools\Caddy\caddy.exe' validate --config (Join-Path $proxyDir 'Caddyfile') --adapter caddyfile
```

每条命令都应成功再继续，尤其 ACL 和 Caddy 验证。80/443 必须没有被 IIS 或其他服务占用；若已有站点，应先规划代理整合，不能直接抢占端口。本指南采用 Caddy，不同时安装另一套 IIS 代理。

放行 Windows 防火墙 80/443：

```powershell
New-NetFirewallRule -DisplayName 'RhineBlog HTTP HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80,443
```

先在前台运行并从外网访问验证：

```powershell
& 'C:\Tools\Caddy\caddy.exe' run --config 'C:\ProgramData\RhineBlogProxy\Caddyfile' --adapter caddyfile
```

DNS 与网络正确时 Caddy 自动申请并续期证书，80 用于 HTTP 验证／重定向。证书和日志保存在 Proxy 目录，目录 ACL 必须允许 LOCAL SERVICE 写入。确保 `https://example.com/healthz` 返回 ok，HTTPS 页面可选择游客且无混合内容错误。完成前台验证后按 Ctrl+C 停止，再注册开机任务（勿同时运行两个 Caddy）：

```powershell
if (Get-ScheduledTask -TaskName 'RhineBlogProxy' -ErrorAction SilentlyContinue) {
    throw 'RhineBlogProxy already exists; review the existing task before updating.'
}
$action = New-ScheduledTaskAction -Execute 'C:\Tools\Caddy\caddy.exe' `
  -Argument 'run --config "C:\ProgramData\RhineBlogProxy\Caddyfile" --adapter caddyfile' `
  -WorkingDirectory 'C:\ProgramData\RhineBlogProxy'
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'RhineBlogProxy' -Action $action -Principal $principal `
  -Trigger $trigger -Settings $settings
Start-ScheduledTask -TaskName 'RhineBlogProxy'
```

检查 `Get-ScheduledTask -TaskName RhineBlog,RhineBlogProxy`、Caddy 日志、HTTPS 健康检查；在维护窗口重启服务器后再确认两项任务自动恢复。Caddy 模板关闭管理 API，修改代理配置后先 `validate`，再停止和启动 `RhineBlogProxy` 任务使其生效。不要把用户登录密码或 Azure 凭据放入这两个任务的参数。

## 4. Azure Windows VM

通过 Azure 门户在自己的订阅中进行，无需复制任何他人的资源 ID：

1. 创建示例资源组 `rg-blog-example`，创建 Windows Server 2022/2025 VM（如 `vm-blog-example`），由 Azure 门户要求的流程设置你自己的系统管理凭据。**VM 系统账户与博客账户彼此独立**。
2. 选择持久化托管 OS 磁盘，公网 IP 使用静态分配；按区域价格和预期流量选择规格。SQLite、证书和备份放在托管 OS／数据磁盘；不要用 Azure 标为 Temporary Storage 的临时盘（常见 D:），也不要用临时 OS 盘保存这些数据。
3. 在关联 NSG 中允许公网 TCP 80/443；RDP 3389 仅允许你的管理来源 IP，或通过 Azure Bastion 连接。不要放行 4173。Windows 防火墙仍需独立放行 80/443。
4. 将域名 A 记录指向新公网 IP，检查 DNS 传播；将干净运行包传到 VM。安装 Node 24、Caddy，完成本指南第 1–3 节。
5. 从外部网络验证 HTTPS、游客空库、管理员登录、新建合成档案及普通账户权限。在实际站点上测试前先决定测试内容，完成后通过界面删除。
6. 设置备份外部保留策略，例如管理员管理的加密备份存储。保护数据库备份和 Caddy 证书目录，避免上传公共 Blob 容器或 GitHub。

重分配、改磁盘或重建 VM 前先验证可恢复的独立备份。Azure 临时盘丢失、删除带自动删除设置的托管盘、删除资源组都可能导致数据丢失，不能把源码副本当作内容备份。

## 5. 验收与故障定位

| 现象 | 检查 |
| --- | --- |
| 502 | Node 任务是否运行；本机 `/healthz`；`DATA_DIR/logs` |
| 登录提示来源不受信任 | 浏览器实际 origin 与 runtime.json 的 AppOrigin 是否一致，是否多了 www、端口、尾斜线 |
| HTTP 下登录状态丢失 | 生产 Cookie 带 Secure；必须通过正确 HTTPS 域名访问 |
| 空库但以为已有管理员 | 创建用户脚本和任务是否指向同一 DataDirectory |
| 证书申请失败 | A/AAAA、80/443 的 NSG 与 Windows 防火墙、端口占用、系统时间 |
| SQLite 无法写入 | LOCAL SERVICE 权限、本地持久化磁盘空间、目录路径 |
| 浏览器 3D 空白 | WebGL 2、GPU 驱动、浏览器控制台、GLB 是否被正确复制 |

后端默认按 TCP 对端地址限流（登录 10 分钟最多 15 次、游客进入最多 60 次），经本机反向代理后所有公网访客可能共用限额。小型站点可先按现实现运行；面向较大流量时需专门设计可信代理识别与边缘限流，不能直接信任任意传入的 `X-Forwarded-For`。

本副本已验证 Node 服务、生产 HTTPS Origin 校验、Secure Cookie 及运行包；任务脚本做语法和配置审查，**没有在本次整理中实际创建 Azure VM、申请证书或安装开机任务**。Caddy 和 Windows 系统集成需在你的目标服务器完成上述验收。未提供未经验证的 Linux、Docker 或无服务器部署脚本。

官方资料：[Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)、[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)、[Azure Windows VM](https://learn.microsoft.com/azure/virtual-machines/windows/quick-create-portal)、[Azure 托管磁盘](https://learn.microsoft.com/azure/virtual-machines/managed-disks-overview)。
