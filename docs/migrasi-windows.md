# Migrasi Bot ke Windows Server

> Kembali ke [README utama](../README.md) · Skrip pendamping: [`windows/install-service.ps1`](../windows/install-service.ps1), [`windows/backup.ps1`](../windows/backup.ps1)

Arsitektur yang didukung panduan ini:

```
NORMAL   : Windows Server = UTAMA (NSSM service jalan 24/7)
           Linux          = STANDBY DINGIN (systemd disabled, tidak jalan)

FAILOVER : Stop Windows → salin data.json + auth_info dari Windows ke Linux
           → start systemd di Linux → selesai
FAILBACK : kebalikannya (stop Linux → salin data kembali → start service Windows)
```

## 1. Prasyarat

| Kebutuhan | Catatan |
|---|---|
| Node.js **20 LTS** | https://nodejs.org — install MSI default |
| NSSM | https://nssm.cc/download — salin `nssm.exe` ke folder `windows\bin\` atau tambahkan ke PATH |
| Akses RDP + Administrator | Untuk pasang service dan firewall |
| Folder proyek lengkap | Lihat tabel "File bawa" di bawah |

## 2. File yang Dibawa vs Ditinggal

**Bawa (WAJIB):**

| File/Folder | Alasan |
|---|---|
| `index.js`, `src/`, `test/` | Kode bot |
| `package.json`, `package-lock.json` | `npm ci` reproducible |
| `config.json` | Konfigurasi (link grup allowlist, dll.) |
| `data.json` | Grup terdaftar, setting per-grup, nama, laporan |
| `auth_info/` | **Sesi WhatsApp terenkripsi** — bawa agar **tidak perlu scan QR ulang** |
| `docs/`, `windows/` | Dokumentasi + skrip |

**Tinggalkan:** `node_modules/` (install ulang), `backups/`, `queue.jsonl`, `bot.lock`, `whatsapp-report-*.service`, `whatsapp-report-*.timer`, `backup.sh`

## 3. Langkah Migrasi

### A. Matikan bot Linux (WAJIB lebih dulu)

```bash
sudo systemctl stop whatsapp-report-bot
sudo systemctl disable whatsapp-report-bot   # cegah nyala sendiri saat reboot
sudo systemctl disable --now whatsapp-report-backup.timer  # timer backup linux juga
```

> Aturan emas: **hanya SATU instance aktif di seluruh dunia.** Dua sesi dengan nomor sama → konflik `replaced`, bisa terlogout.

### B. Salin folder proyek ke Windows Server

Contoh via WinSCP/scp (dari Linux):

```bash
tar --exclude='node_modules' --exclude='backups' --exclude='queue.jsonl' \
    -czf bot-migrasi.tar.gz whatsapp-report-bot
# lalu transfer bot-migrasi.tar.gz (WinSCP / scp) dan ekstrak di C:\bot\
```

Hasil akhir disarankan: `C:\bot\whatsapp-report-bot\`

### C. Install dependensi & test

Buka PowerShell di folder proyek:

```powershell
npm install        # atau: npm ci
npm test           # harus hijau seperti di Linux (90+ pass; gagal yang tersisa = kontrak test lama, bukan error baru)
```

### D. Uji konsol dulu (sebelum dijadikan service)

```powershell
node index.js
```

Harus langsung muncul `Login sebagai: 628...@s.whatsapp.net` **tanpa minta QR** → berarti sesi terbawa. Tekan Ctrl+C setelah yakin.

Jika diminta QR ulang: `auth_info/` tidak ikut tersalin — ulangi langkah B.

### E. Pasang sebagai service (NSSM)

PowerShell **as Administrator**, dari folder `windows\`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-service.ps1 `
    -ProjectDir C:\bot\whatsapp-report-bot -Port 3000 -OpenFirewall
```

Script akan: registrasi service `WhatsAppReportBot` → auto-start saat boot → auto-restart saat crash (jeda 10 detik) → log ke `logs\service.log` (rotasi 10 MB) → buka firewall TCP 3000 → jalankan service.

### F. Verifikasi

```powershell
nssm status WhatsAppReportBot                 # SERVICE_RUNNING
Invoke-RestMethod http://localhost:3000/health
Get-Content logs\service.log -Tail 20         # lihat log bot
```

## 4. Sinkronisasi Kode Linux ↔ Windows

Kedua mesin punya salinan sendiri. **Tidak ada yang otomatis.** Pilih salah satu metode:

### Metode A — Manual (cocok jika edit jarang)

Aturan arah salin:

| Yang diedit | Salin ke mana |
|---|---|
| Kode/`config.json` di **Windows** (utama) | Ke Linux hanya jika Linux perlu update standby |
| Kode/`config.json` di **Linux** | **Wajib** disalin ke Windows + restart service Windows, baru berlaku produksi |
| `data.json` | JANGAN pernah disalin dari standby ke utama — data mutakhir selalu milik mesin AKTIF |

Langkah salin (contoh Windows → Linux, dari Linux):

```bash
scp user@win-server:"C:/bot/whatsapp-report-bot/src/*" ~/whatsapp-report-bot/src/
sudo systemctl daemon-reload   # tidak wajib; bot standby memang mati
```

Setelah menyalin **ke mesin yang sedang jalan**, restart service penerima:

```powershell
nssm restart WhatsAppReportBot     # Windows
# sudo systemctl restart whatsapp-report-bot   # Linux
```

Checklist manual sync:
- [ ] Sumber edit jelas (Windows = utama)
- [ ] `npm test` lulus di penerima
- [ ] Service penerima di-restart
- [ ] `/health` normal

### Metode B — Git (cocok jika edit sering)

Satu repo kecil (bare repo di server kantor, atau GitHub/GitLab private).

`.gitignore` (buat di root proyek kedua mesin):

```gitignore
node_modules/
auth_info/
data.json
backups/
logs/
queue.jsonl
bot.lock
*.log
```

Workflow:

```bash
# di mesin tempat edit (mis. Windows)
cd C:\bot\whatsapp-report-bot
git add -A && git commit -m "perubahan X"
git push origin main

# di mesin lain (Linux standby / atau sebaliknya)
cd ~/whatsapp-report-bot
git pull
npm install      # hanya jika package-lock berubah
npm test
# restart service HANYA jika mesin itu sedang aktif
```

Catatan: `auth_info/` dan `data.json` sengaja TIDAK masuk git — keduanya rahasia/runtime, dipindahkan manual hanya saat failover (bagian 5).

## 5. Failover & Failback (Utama ↔ Standby)

### Failover: Windows mati → Linux ambil alih

1. Di Windows: `nssm stop WhatsAppReportBot`
2. Salin **data terbaru dari Windows ke Linux**: `data.json` + `auth_info\` (seluruh isinya) — timpa yang lama di Linux
3. Di Linux: `sudo systemctl start whatsapp-report-bot`
4. Verifikasi: `curl http://localhost:3000/health`

### Failback: kembali ke Windows

1. Di Linux: `sudo systemctl stop whatsapp-report-bot`
2. Salin `data.json` + `auth_info/` dari Linux ke Windows (timpa)
3. Di Windows: `nssm start WhatsAppReportBot`

Aturan sumber kebenaran selama standby:

| Data | Sumber kebenaran |
|---|---|
| Kode & `config.json` | Windows (utama); Linux hanya menerima |
| `data.json`, `auth_info/` | Mesin yang SEDANG AKTIF; mengalir aktif → standby saat failover |

## 6. Backup Terjadwal (Windows)

Task Scheduler harian jam 08:00 (jam server; sesuaikan bila TZ server bukan WITA), run as SYSTEM:

```powershell
schtasks /create /tn "WhatsAppReportBot Backup" `
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\bot\whatsapp-report-bot\windows\backup.ps1 -KeepDays 30" `
  /sc daily /st 08:00 /ru SYSTEM /rl HIGHEST /f
```

Uji manual sekali dulu: `.\backup.ps1` → hasil di `backups\report-bot-*.zip`.

> Arsip berisi `auth_info` (kunci sesi WA). Simpan aman; pertimbangkan salinan off-server berkala.

## 7. Troubleshooting Khas Windows Server

| Gejala | Penyebab & Solusi |
|---|---|
| `/health` tak bisa diakses dari komputer lain | Firewall: pastikan `-OpenFirewall` dipakai atau rule inbound TCP 3000 ada (`Get-NetFirewallRule "*WhatsApp*"`) |
| Bot tiba-tiba mati tanpa jejak | Defender/AV memblokir node/Baileys → tambah exclusion folder proyek; cek `logs\service-error.log` dan Event Viewer |
| `replaced` di log | Ada instance lain dengan nomor sama (Linux nyala? konsol manual?) — matikan satu |
| Setelah reboot service tidak jalan | `nssm status WhatsAppReportBot`; pastikan Start = `SERVICE_AUTO_START`; cek path di `nssm dump WhatsAppReportBot` |
| Scan QR diminta ulang | `auth_info/` rusak/tidak tersalin — pulihkan dari backup, atau pairing ulang |
| Jam summary/meleset | Bot memakai `Asia/Makassar` eksplisit (tak terpengaruh TZ server), tapi pastikan jam server benar (NTP): `w32tm /query /status` |
| Edit file `.ps1` diblokir | ExecutionPolicy: gunakan flag `-ExecutionPolicy Bypass` seperti contoh |
| `chmod 600 auth.key` tidak efektif | Normal di NTFS — amankan via ACL: folder proyek hanya untuk user service + Administrator |

## 8. Rollback ke Linux

1. Windows: `nssm stop WhatsAppReportBot`
2. Salin `data.json` + `auth_info/` terbaru dari Windows ke Linux (timpa)
3. Linux: `sudo systemctl enable --now whatsapp-report-bot`
4. Verifikasi health; service Windows biarkan stopped (atau `nssm remove WhatsAppReportBot confirm` untuk bersih total)
