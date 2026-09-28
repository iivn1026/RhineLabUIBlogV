param([Parameter(Mandatory = $true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$env:NODE_ENV = 'production'
$env:APP_ORIGIN = $config.AppOrigin
$env:DATA_DIR = $config.DataDirectory
$env:HOST = '127.0.0.1'
$env:PORT = '4173'
Set-Location -LiteralPath $config.AppDirectory
$logPath = Join-Path $config.DataDirectory ('logs\server-' + (Get-Date -Format 'yyyy-MM-dd-HHmmss') + '.log')
try {
    # PowerShell 5.1 treats native stderr as ErrorRecord; retain Node warnings in logs.
    $ErrorActionPreference = 'Continue'
    & $config.NodePath 'server/app.mjs' >> $logPath 2>&1
    $code = $LASTEXITCODE
    if ($code -eq 0) { exit 1 } # A long-running server exiting should be restarted.
    exit $code
} catch {
    $_ | Out-File -LiteralPath $logPath -Append
    exit 1
}
