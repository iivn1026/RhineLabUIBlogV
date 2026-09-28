#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory = $true)][string]$AppOrigin,
    [string]$AppDirectory = (Join-Path $PSScriptRoot '..\..'),
    [string]$DataDirectory = 'C:\ProgramData\RhineBlog',
    [string]$NodePath = 'C:\Program Files\nodejs\node.exe',
    [string]$TaskName = 'RhineBlog'
)
$ErrorActionPreference = 'Stop'
$AppDirectory = (Resolve-Path -LiteralPath $AppDirectory).Path
$DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
$NodePath = (Resolve-Path -LiteralPath $NodePath).Path
$uri = [Uri]$AppOrigin
if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) {
    throw 'AppOrigin must be an HTTPS origin, for example https://blog.example.com'
}
$AppOrigin = $uri.GetLeftPart([UriPartial]::Authority)
if ($DataDirectory.StartsWith('\\') -or $DataDirectory -eq $AppDirectory -or $DataDirectory.StartsWith($AppDirectory + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'DataDirectory must be on a local persistent disk outside the release directory.'
}
if (-not (Test-Path -LiteralPath (Join-Path $AppDirectory 'dist\index.html'))) { throw 'Missing built frontend.' }
if ((& $NodePath -p 'process.versions.node.split(String.fromCharCode(46))[0]') -ne '24') { throw 'Install Node.js 24 LTS for all users first.' }
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw 'Task already exists. Use the update procedure in the deployment guide.'
}
New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $DataDirectory 'logs') -Force | Out-Null
# SIDs avoid dependence on the Windows display language.
& icacls.exe $DataDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' /Q
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the data directory.' }
# Existing database files must inherit the protected directory's permissions.
# Applying /inheritance:r recursively can leave pre-existing files with no ACEs.
Get-ChildItem -LiteralPath $DataDirectory -Force | ForEach-Object {
    & icacls.exe $_.FullName /inheritance:e /T /Q
    if ($LASTEXITCODE -ne 0) { throw 'Could not apply data file permissions.' }
}
& icacls.exe $AppDirectory /grant '*S-1-5-19:(OI)(CI)RX' /T /Q
if ($LASTEXITCODE -ne 0) { throw 'Could not grant application read access.' }
$configPath = Join-Path $DataDirectory 'runtime.json'
@{ AppDirectory = $AppDirectory; DataDirectory = $DataDirectory; NodePath = $NodePath; AppOrigin = $AppOrigin } |
    ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
$runner = Join-Path $AppDirectory 'deploy\windows\Start-BlogServer.ps1'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -ConfigPath "{1}"' -f $runner, $configPath
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $AppDirectory
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'Rhine blog Node server behind an HTTPS reverse proxy.' | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output 'Task installed. Check http://127.0.0.1:4173/healthz and then configure the HTTPS reverse proxy.'
