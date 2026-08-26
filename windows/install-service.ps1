# install-service.ps1 — Pasang WhatsApp Report Bot sebagai Windows Service (NSSM)
# Jalankan sebagai Administrator di Windows Server:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-service.ps1 [-ProjectDir C:\bot\whatsapp-report-bot] [-Port 3000] [-OpenFirewall]

param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$NodeExe   = '',
    [int]$Port          = 3000,
    [switch]$OpenFirewall
)

$ErrorActionPreference = 'Stop'
$ServiceName = 'WhatsAppReportBot'

# --- Validasi: harus Administrator ---
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'Jalankan ulang sebagai Administrator (Run as Administrator).'
    exit 1
}

# --- Validasi: folder proyek & file inti ---
if (-not (Test-Path (Join-Path $ProjectDir 'index.js'))) {
    Write-Error "index.js tidak ditemukan di '$ProjectDir'. Periksa -ProjectDir."
    exit 1
}

# --- Deteksi node.exe ---
if (-not $NodeExe) {
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $cmd) { Write-Error 'node.exe tidak ada di PATH. Install Node.js 20 LTS dulu.'; exit 1 }
    $NodeExe = $cmd.Source
}
$nodeVersion = (& $NodeExe --version) -replace 'v',''
if ([version]$nodeVersion.Split('.')[0..2] -join '.' -lt [version]'18.0.0') {
    Write-Error "Node $nodeVersion < 18. Install Node.js 20 LTS."
    exit 1
}

# --- Validasi: nssm.exe ---
$nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssm) {
    $localNssm = Join-Path $PSScriptRoot 'bin\nssm.exe'
    if (Test-Path $localNssm) { $nssm = Get-Item $localNssm }
}
if (-not $nssm) {
    Write-Error @'
nssm.exe tidak ditemukan.
1. Unduh NSSM: https://nssm.cc/download
2. Salin nssm.exe ke folder windows\bin\ atau tambahkan ke PATH.
'@
    exit 1
}
$nssmExe = if ($nssm.Source) { $nssm.Source } else { $nssm.FullName }

Write-Host "== Pasang service '$ServiceName' =="
Write-Host "   Project : $ProjectDir"
Write-Host "   Node    : $NodeExe ($nodeVersion)"
Write-Host "   NSSM    : $nssmExe"

# --- Hapus sisa instalasi lama bila ada ---
$existing = & $nssmExe status $ServiceName 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[i] Service lama ditemukan, hapus dulu..."
    & $nssmExe stop    $ServiceName | Out-Null
    & $nssmExe remove  $ServiceName confirm | Out-Null
}

# --- Buat folder log ---
New-Item -ItemType Directory -Force -Path (Join-Path $ProjectDir 'logs') | Out-Null

# --- Registrasi service ---
& $nssmExe install $ServiceName $NodeExe 'index.js'
& $nssmExe set $ServiceName AppDirectory $ProjectDir

# Logging + rotasi (10 MB per file)
$logOut  = Join-Path $ProjectDir 'logs\service.log'
$logErr  = Join-Path $ProjectDir 'logs\service-error.log'
& $nssmExe set $ServiceName AppStdout        $logOut
& $nssmExe set $ServiceName AppStderr        $logErr
& $nssmExe set $ServiceName AppRotateFiles   1
& $nssmExe set $ServiceName AppRotateOnline  1
& $nssmExe set $ServiceName AppRotateBytes   10485760

# Ketahanan: restart saat crash, jeda 10 detik, tanpa batas percobaan
& $nssmExe set $ServiceName AppExit         Default Restart
& $nssmExe set $ServiceName AppRestartDelay 10000

# Env khusus bot (port health server)
& $nssmExe set $ServiceName AppEnvironmentExtra "BOT_HEALTH_PORT=$Port"

# Start otomatis saat boot
& $nssmExe set $ServiceName Start SERVICE_AUTO_START

# --- Firewall opsional ---
if ($OpenFirewall) {
    New-NetFirewallRule -DisplayName "$ServiceName Health Port" `
        -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "[i] Firewall dibuka: inbound TCP $Port"
}

# --- Jalankan & verifikasi ---
& $nssmExe start $ServiceName
Start-Sleep -Seconds 5
$status = & $nssmExe status $ServiceName
Write-Host ''
Write-Host "== Status service: $status (SERVICE_RUNNING = 4? lihat dokumen) =="

$healthOk = $false
try {
    $h = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 10
    Write-Host ("Health : status={0} wa_connected={1} groups_served={2}" -f $h.status, $h.wa_connected, $h.groups_served)
    $healthOk = $true
} catch {
    Write-Warning "Health endpoint belum merespon (normal jika bot masih connecting). Cek log: $logOut"
}

Write-Host ''
Write-Host 'Selesai. Perintah berguna:'
Write-Host "  nssm status  $ServiceName     # lihat status"
Write-Host "  nssm restart $ServiceName     # restart bot"
Write-Host "  nssm stop    $ServiceName     # matikan bot (WAJIB sebelum failover ke Linux!)"
Write-Host "  nssm remove  $ServiceName confirm  # uninstall service"
