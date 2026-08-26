# backup.ps1 — Pengganti backup.sh untuk Windows
# Zip config.json + data.json + auth_info\ + package.json ke backups\, dengan retensi.
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\backup.ps1 [-ProjectDir C:\bot\whatsapp-report-bot] [-KeepDays 30]

param(
    [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [int]$KeepDays = 30
)

$ErrorActionPreference = 'Stop'

$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$backDir = Join-Path $ProjectDir 'backups'
$logFile = Join-Path $backDir 'backup.log'

New-Item -ItemType Directory -Force -Path $backDir | Out-Null

# --- Kumpulkan file yang ada saja ---
$sources = @('config.json', 'data.json', 'auth_info', 'package.json') |
    ForEach-Object { Join-Path $ProjectDir $_ } |
    Where-Object { Test-Path $_ }

if ($sources.Count -eq 0) {
    Write-Error "Tidak ada file sumber di '$ProjectDir'. Periksa -ProjectDir."
    exit 1
}

# --- Zip ---
$zip = Join-Path $backDir "report-bot-$stamp.zip"
Compress-Archive -Path $sources -DestinationPath $zip -Force
$sizeKb = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Host "[ok] $zip ($sizeKb KB)"

# --- Retensi: hapus arsip lebih tua dari KeepDays ---
$cutoff  = (Get-Date).AddDays(-$KeepDays)
$removed = @(Get-ChildItem -Path $backDir -Filter 'report-bot-*.zip' |
             Where-Object { $_.LastWriteTime -lt $cutoff })
foreach ($f in $removed) { Remove-Item $f.FullName -Force }
if ($removed.Count -gt 0) {
    Write-Host ("[i] {0} arsip lama (> {1} hari) dihapus" -f $removed.Count, $KeepDays)
}

# --- Log ringkas ---
Add-Content -Path $logFile -Value ("{0}  zip={1} ({2} KB)  hapus_lama={3}" -f `
    (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), (Split-Path $zip -Leaf), $sizeKb, $removed.Count)

Write-Host ''
Write-Host 'PERINGATAN: arsip berisi auth_info (kunci sesi WhatsApp).'
Write-Host 'Simpan/transfer arsip ini dengan aman; jangan dibagikan sembarangan.'
