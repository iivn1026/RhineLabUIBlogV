param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_-]{3,32}$')][string]$Username,
    [ValidateSet('admin', 'reader')][string]$Role = 'reader',
    [string]$DataDirectory,
    [string]$NodePath = 'node.exe'
)
$ErrorActionPreference = 'Stop'
$app = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$secret = Read-Host 'Password (8-128 characters, hidden)' -AsSecureString
$confirm = Read-Host 'Repeat password (hidden)' -AsSecureString
$ptr = [IntPtr]::Zero
$confirmPtr = [IntPtr]::Zero
$process = $null
try {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $confirmPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ($plain -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPtr)) { throw 'Passwords do not match.' }
    if ($plain.Length -lt 8 -or $plain.Length -gt 128 -or $plain.Contains("`r") -or $plain.Contains("`n")) { throw 'Password must contain 8-128 characters on one line.' }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = @(Get-Command $NodePath -CommandType Application)[0].Source
    $info.WorkingDirectory = $app
    $info.Arguments = 'server/create-user.mjs {0} {1}' -f $Username, $Role
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    if ($DataDirectory) { $info.EnvironmentVariables['DATA_DIR'] = [IO.Path]::GetFullPath($DataDirectory) }
    $process = [Diagnostics.Process]::Start($info)
    # Write UTF-8 bytes directly: Windows PowerShell 5.1 lacks StandardInputEncoding.
    $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.BaseStream.Flush()
    $process.StandardInput.Close()
    $plain = $null
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'User creation failed. See the server error above.' }
} finally {
    $plain = $null
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    if ($confirmPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPtr) }
    $secret.Dispose()
    $confirm.Dispose()
    if ($process) { $process.Dispose() }
}
