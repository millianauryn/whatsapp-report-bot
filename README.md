# Bot Laporan WhatsApp

Bot WhatsApp untuk mengumpulkan laporan dari peserta grup dengan **jadwal 2xsebulan** (ditetapkan otomatis per grup). Bot melacak siapa yang sudah lapor / belum, mengingatkan lewat **DM pribadi**, dan memberi tahu real-time saat tenggat lewat. Semua waktu mengikuti **zona WITA** (Asia/Makassar) — sesuai jam di HP pengguna.

Dibangun dengan [Baileys](https://github.com/WhiskeysSockets/Baileys) (protocol WhatsApp Web). Gratis, tanpa biaya bulanan.

# Daftar Isi

- [Fitur](#fitur)
- [Persyaratan](#persyaratan)
- [Instalasi & Menjalankan](#instalasi-menjalankan)
- [Konfigurasi](#konfigurasi-configjson)
- [Jadwal Per Grup](#jadwal-per-grup)
- [Cara Ganti Tenggat](#cara-ganti-tenggat-resmi-dan-setup-group)
- [Referensi Lengkap: Setting Group & Cara Ganti Tenggat](#referensi-lengkap-setting-group--cara-ganti-tenggat)
- [Cara Bot Masuk Grup](#cara-bot-masuk-grup-hanya-link-yang-diizinkan)
- [Perintah](#perintah-di-grup-awalan-)
- [Alur Otomatis](#alur-otomatis-per-jadwal-grup)
- [Health Check & Message Queue](#health-check--message-queue)
- [Testing](#testing)
- [Menambah Fitur Baru](#menambah-fitur-baru-sustainable)
- [Syarat Bot Bekerja & Bisa Balas DM](#syarat-bot-bekerja--bisa-balas-dm)
- [Troubleshooting](#troubleshooting)

## Dokumentasi Lengkap (folder `docs/`)

Konten yang sama tersedia terpisah per topik di folder `docs/`:

| File | Isi |
|---|---|
| [docs/instalasi.md](docs/instalasi.md) | Persyaratan + instalasi + pairing server jauh |
| [docs/konfigurasi.md](docs/konfigurasi.md) | Tabel `config.json` + jadwal per grup |
| [docs/ganti-tenggat.md](docs/ganti-tenggat.md) | 3 metode ganti tenggat + struktur data.json + catatan debugging |
| [docs/api.md](docs/api.md) | Endpoint HTTP (`/health`, `/update-deadline`, `/set-group-summary-time`) + contoh curl |
| [docs/flag-datajson.md](docs/flag-datajson.md) | Pola key flag + periodId per cadence |
| [docs/alur-jadwal.md](docs/alur-jadwal.md) | Alur otomatis semua cadence + cara bot masuk grup |
| [docs/perintah.md](docs/perintah.md) | `!lapor`, `!check`, `!bantuan` + hak akses |
| [docs/health-check.md](docs/health-check.md) | Health endpoint + message queue |
| [docs/pengembangan.md](docs/pengembangan.md) | Testing + menambah fitur baru + catatan penting |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Syarat bot bekerja + tabel error/solusi |


## Fitur {#fitur}

- **Jadwal per grup** — 2xsebulan otomatis (lihat alur di bawah)
- `!lapor <nama>` untuk mengirim laporan (cukup nama)
- `!check` (bisa digunakan oleh semua pengguna) untuk melihat siapa sudah/belum lapor — tanpa DM; nama per nomor diambil dari laporan terakhir (`!lapor`), nama WhatsApp hanya sebagai isi awal bila belum pernah lapor
- **Otomatis:** recap pengingat di grup menjelang tenggat (default 60 menit sebelum; untuk jadwal 2xsebulan: persis jam tenggat)
- **Otomatis real-time:** DM + ringkasan grup tepat saat tenggat lewat
- Laporan setelah tenggat tetap diterima (tanpa penanda terlambat)
- Periode baru otomatis per jadwal grup (tanpa perintah manual)
- Arsitektur modular — fitur baru tinggal tambah 1 file

## Persyaratan {#persyaratan}

- Node.js **18+** (disarankan 20+)
- Satu nomor WhatsApp khusus sebagai bot (bisa nomor biasa/WhatsApp Business)
- Nomor bot **harus disimpan di kontak peserta** agar DM dari bot bisa terkirim

## Instalasi & Menjalankan {#instalasi-menjalankan}

```bash
cd whatsapp-report-bot
npm install

# Pertama kali: scan QR dengan WhatsApp di nomor bot
node index.js

# Atau pakai kode pairing (lebih mudah untuk server jauh)
node index.js --pair 6281234567890

#### Langkah pairing (untuk server jauh)
1. Jalankan `node index.js --pair 628...0` → muncul kode 8-digit
2. Buka WhatsApp di HP nomor bot → `Imcom > Undang > Masukkan kode`
3. Tunggu sampai log tampil `Login sebagai: 628...@s.whatsapp.net`
4. Kode pairing **kadaluarsa 2 menit** — jika gagal, jalankan ulang perintah
```

- Setelah login, sesi tersimpan **terenkripsi** (AES-256-GCM) dalam satu file `auth_info/session.enc` — mulai ulang tidak perlu scan ulang.
- Kunci sesi ada di `auth_info/auth.key` (mode 600) — **jangan dibackup**: backup sesi tetap aman hanya jika kunci tidak ikut tersalin (backup.sh sudah mengecualikannya). Hapus folder `auth_info/` untuk memaksa login ulang.
- Bot hanya melayani grup dari link yang diizinkan (lihat "Cara Bot Masuk Grup").
- Anggota grup: simpan nomor bot di kontak, lalu setiap peserta kirim di grup:
  ```
  !lapor Budi Santoso
  ```

> **Penting:** hanya boleh **satu** instance bot berjalan sekaligus. `index.js` memakai file kunci `bot.lock` — jika instance kedua dijalankan, bot akan menolak dengan pesan `[lock]`. Jika dijalankan sebagai service, jangan jalankan `node index.js` manual di sampingnya (bisa memicu konflik sesi WhatsApp `replaced`).

> **Pengendali bot = admin grup.** Perintah `!check` bisa dipakai admin grup di dalam grup, maupun dari DM ke bot. Pesan `fromMe` (dikirim dari HP nomor bot sendiri, diawali `!`) juga tetap diproses — balasan otomatis bot tidak pernah diawali `!`, jadi aman dari loop.

> **Admin bisa menjalankan SEMUA perintah**, termasuk dari DM (private chat): `!lapor` dan `!check` dari DM akan bekerja (untuk `!check` dari DM, bot memproses semua grup yang terdaftar; syarat: pengirim adalah admin minimal satu grup terdaftar).

## Konfigurasi (`config.json`) {#konfigurasi-configjson}

| Kunci | Default | Keterangan |
|---|---|---|
| `deadline` | `"21:00"` | Jadwal default grup: `"21:00"` = harian; `"Jumat 21:00"` = mingguan |
| `timezone` | `"Asia/Makassar"` | Zona waktu pemantauan (WITA). Ganti sesuai kebutuhan |
| `reminder_minutes_before` | `60` | Berapa menit sebelum tenggat recap grup dikirim (untuk 2xsebulan selalu pas jam tenggat) |
| `check_interval_seconds` | `30` | Interval pengecekan scheduler (real-time detection) |
| `exclude_admins` | `false` | Admin tetap terdaftar di daftar peserta, tetapi tetap ikir tercatat di daftar "belum lapor" dan "sudah lapor" |
| `allowed_group_links` | `[]` | Daftar link undangan grup yang diizinkan. Bot join & melayani HANYA grup dari link ini |
| `data_file` / `auth_dir` | default | Lokasi penyimpanan |
| `health_port` | `3000` | Port HTTP health check endpoint |
| `health_host` | `"0.0.0.0"` | Host binding health check |
| `health_token` | `""` | Token opsional untuk health check (Bearer token) |
| `queue_file` | `"queue.jsonl"` | File antrian pesan persisten |
| `queue_flush_interval_ms` | `500` | Interval flush antrian (ms) |
| `queue_max_size` | `10000` | Ukuran maksimal antrian |
| `daily_reminder_at_deadline` | `true` | `true` = reminder di jam tenggat (bukan 60 menit sebelum) |
| `daily_summary_time` | `"17:00"` | Waktu summary harian otomatis |
| `weekly_reminder_at_deadline` | `true` | `true` = reminder di jam tenggat |
| `weekly_summary_time` | `"17:00"` | Waktu summary mingguan |
| `monthly_reminder_at_deadline` | `true` | `true` = reminder di jam tenggat |
| `monthly_summary_time` | `"17:00"` | Waktu summary bulanan |

## Jadwal Per Grup {#jadwal-per-grup}

Setiap grup terdaftar otomatis mendapat **jadwal 2xsebulan** (preset dijalankan saat bot terhubung; grup baru yang bergabung ikut dipreset). **Tidak ada perintah chat** untuk mengubah jadwal otomatis — setelan `data.json` tetap berl berlaku. Untuk **1x sebulan** (bot aktif hanya 1 hari/bulan di tanggal tenggat): atur manual di `data.json` → `settings.groups[gid] = { "cadence": "monthly", "deadline": "5 11:30" }` — preset tidak menimpa pengaturan manual.

| Cadence | Reminder | Summary | Alert |
|---|---|---|---|
| **2x sebulan** | Pas jam tenggat (mis. 11:30) | 17:00 harian selama cycle | 1 menit setelah tenggat |
| **1x sebulan (monthly)** | Pas jam tenggat | Waktu terkonfigurasi (default 17:00) | 1 menit setelah tenggat |
| **Mingguan (weekly)** | Pas jam tenggat | Waktu terkonfigurasi (default 17:00) | 1 menit setelah tenggat |
| **Harian (daily)** | Pas jam tenggat | Waktu terkonfigurasi (default 17:00) | 1 menit setelah tenggat |

> **Catatan:** Untuk cadence `daily`/`weekly`/`monthly`, reminder dikirim **pas jam tenggat** (bukan 60 menit sebelumnya) jika config `*_reminder_at_deadline: true` (default). Summary dikirim di waktu terkonfigurasi (`*_summary_time`, default 17:00). Alert selalu 1 menit setelah tenggat.

## Cara Ganti Tenggat (resmi & disarankan) {#cara-ganti-tenggat-resmi-dan-setup-group}

> **Jangan pernah edit `data.json` manual saat bot sedang menjalankan** (menyebabkan `Permission denied`, `watchFile` race condition, dan flag stuck). Gunakanlah API endpoint di bawah ini.

### 1. Via HTTP API (cara resmi)

```bash
# Ganti 1 grup (tidak mengganggu grup lain)
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"gid":"GID_GRUP","deadline":"HH:MM"}'

# Ganti SEMUA grup allowlist sekaligus
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"deadline":"HH:MM"}'
```

*   `db.set` langsung ke memory + `watchFile` reload dalam 1 detik
*   Clear flag `...:reminder:HH:MM` otomatis
*   `groups_served` tetap konsisten, tidak error

### 2. Verifikasi setelah perubahan

```bash
# Cek health endpoint
curl -s http://localhost:3000/health | grep -E "groups_served|status|bot_jid"

# Cek data.json otomatis terupdate
cat data.json | grep -A2 deadline

# Cek log reminder dalam 30 detik
journalctl -u whatsapp-report-bot --since "30s ago" | grep -E "Checking|inWindow|DM sent|Summary terkirim|flag exists"
```

### 3. Catatan krusial (dari debugging terbaru)

| Masalah | Penyebab | Solusi |
|---|---|---|
| `Permission denied` | Edit `data.json` manual saat bot `root` | Gunakan API `POST /update-deadline` |
| `watchFile` race | `db.set` + `watchFile` 1s sering revert | API endpoint sudah mantap |
| `Winoto tidak menerima DM` | `normalizeId()` menghapus `:@lid` → bot terfilter out | **Sudah diedit di `src/bot.js:50-68`** → bandingkan `p.id === botLid` langsung |
| Monitor `journalctl` kosong | 2 instance bot bertengkar over lock | Hentikan instance manual, biarkan systemd satu-satunya |
| `DM tidak sampai` (Error 463) | Nomor bot belum disimpan kontak / belum ada chat session | Simpan nomor bot di kontak peserta, atau kirim `!lapor` pertama kali dari bot |

### 4. Jadwal yang tersedia sekarang

Setelah restart dengan fix `normalizeId`, semua grup menjalani **daily 10:43** (atau deadline terakhir yang di-set via API). Cadence tetap `semimonthly` otomatis per grup baru via `src/migrate.js`.

Tabel jadwal per cadence: lihat [Jadwal Per Grup](#jadwal-per-grup).

### Ubah Summary Waktu (API)

Gunakan API agar setting dan flag summary dikelola bot; tidak perlu mengedit `data.json` saat service berjalan.

```bash
# Ganti summary satu grup
curl -s -X POST http://localhost:3000/set-group-summary-time \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","summary_time":"15:35"}'

# Reset summary grup ke 17:00
curl -s -X POST http://localhost:3000/set-group-summary-time \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","summary_time":"17:00"}'

# Cek bot
curl -s http://localhost:3000/health

# Pantau pengiriman
journalctl -u whatsapp-report-bot -f --no-pager | grep --line-buffered -E "120363411450968353|deadlineAlert|DM sent|Summary terkirim"
```

`summary_time` memakai waktu WITA format `HH:MM`. Grup tanpa setting ini memakai default global dari `config.json` (`17:00`).

## Referensi Lengkap: Setting Group & Cara Ganti Tenggat {#referensi-lengkap-setting-group--cara-ganti-tenggat}
### 1. Struktur Konfigurasi Files

Konfigurasi bot terbagi menjadi dua file:

**A. `config.json` — Global Settings (pengaruh semua grup)**

```json
{
  "deadline": "21:00",
  "timezone": "Asia/Makassar",
  "reminder_minutes_before": 60,
  "check_interval_seconds": 30,
  "exclude_admins": false,
  "allowed_group_links": [
    "https://chat.whatsapp.com/HSFrpubAAEZBBfYGYWv8cV",
    "https://chat.whatsapp.com/DICjOKwFdOj6jOInzDAnYp"
  ],
  "data_file": "data.json",
  "auth_dir": "auth_info",
  "health_port": 3000,
  "health_host": "0.0.0.0",
  "health_token": "",
  "queue_file": "queue.jsonl",
  "queue_flush_interval_ms": 500,
  "queue_max_size": 10000,
  "daily_reminder_at_deadline": true,
  "daily_summary_time": "17:00",
  "weekly_reminder_at_deadline": true,
  "weekly_summary_time": "17:00",
  "monthly_reminder_at_deadline": true,
  "monthly_summary_time": "17:00"
}
```

**B. `data.json.settings.groups` — Per-Group Settings**

Setiap grup terdaftar memiliki konfigurasi mandiri:

```json
{
  "120363429743078023@g.us": {
    "cadence": "daily",
    "deadline": "10:43"
  },
  "120363411450968353@g.us": {
    "cadence": "daily",
    "deadline": "10:43"
  }
}
```

**Lokasi di file:** `data.json` → `settings.groups[gid]`

**Field penjelasan:**

| Field | Deskripsi | Contoh | Catatan |
|---|---|---|---|
| `cadence` | Frekuensi: `daily`, `weekly`, `monthly`, `semimonthly` | `daily` | Wajib ada |
| `deadline` | Jam tenggat dalam format `HH:MM` | `10:43` | Wajib ada |
| (tidak ada) | Untuk `monthly`: field `dayOfMonth` (1-31) | `5` | Hanya untuk `monthly` |
| (tidak ada) | Untuk `weekly`: field `weekday` (0=Minggu, 6=Sabtu) | `4` | Hanya untuk `weekly`; 0=Minggu, 1=Senin, …, 6=Sabtu |

**Struktur lengkap di dalam `data.json`:**

```json
{
  "meta": {
    "groups": ["120363429743078023@g.us", "120363411450968353@g.us"]
  },
  "settings": {
    "groups": {
      "120363429743078023@g.us": {
        "cadence": "daily",
        "deadline": "10:43"
      },
      "120363411450968353@g.us": {
        "cadence": "daily",
        "deadline": "10:43"
      }
    },
    "reminderDmText": "Halo{nama}, pengingat {periode} tenggat {tenggat} WITA - segera !lapor ya"
  },
  "names": {
    "204247287226396@lid": "Winoto",
    "147076893675545@lid": "Amoy",
    "255980403183803@lid": "rara",
    "162097098956948@lid": "Test Wa",
    "82742662451393@lid": "Anton",
    "141854297321484@lid": "Basri",
    "162689066238104@lid": "surya",
    "95056367194249@lid": "Willy"
  },
  "flags": {
    "2026-08-22": {
      "120363429743078023@g.us:reminder:10:43": true,
      "120363411450968353@g.us:reminder:10:43": true
    }
  },
  "reports": { ... }
}
```

### Flag di `data.json`

Flag adalah penanda internal agar reminder, alert, dan summary tidak terkirim dua kali dalam periode yang sama. Hanya pola berikut yang dibaca bot:

| Pola key | Contoh | Fungsi |
|---|---|---|
| `<gid>:reminder:<tenggat>` | `120363411450968353@g.us:reminder:13:47` | Menandai reminder sudah terkirim |
| `<gid>:alert` | `120363411450968353@g.us:alert` | Menandai alert dan recap sudah terkirim |
| `<gid>:summary:<tanggal>` | `120363411450968353@g.us:summary:2026-08-24` | Menandai summary harian sudah terkirim |
| `<gid>:final` | `120363411450968353@g.us:final` | Menandai summary terakhir sudah terkirim |

Key di luar `flags` harus memakai `periodId` sesuai cadence: harian `YYYY-MM-DD`, mingguan tanggal Senin, semimonthly `YYYY-MM-01` atau `YYYY-MM-15`, dan monthly `YYYY-MM`. Key sembarang atau salah format akan diabaikan dan dapat menyebabkan pengiriman ulang.

Jangan mengedit flag manual saat bot berjalan. Gunakan `POST /update-deadline` atau `POST /set-group-summary-time` agar flag grup terkait dibersihkan dengan benar. Job `periodReset` membersihkan data periode lama otomatis.

### 2. Cara Ganti Tenggat (3 Metode)

#### Metode A: Via HTTP API (REKOMENDASI, AMAN, TIDAK PERNAH `Permission denied`)

```bash
# Ganti 1 grup (tidak mengganggu grup lain)
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","deadline":"10:43"}'

# Ganti SEMUA grup allowlist sekaligus
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"deadline":"10:43"}'
```

*   `data.json.settings.groups[gid]` langsung ter-update
*   `flags` hari ini clear otomatis
*   Bot tidak perlu restart (re-read config dalam 1 detik via `watchFile`)
*   `groups_served` di health endpoint tetap konsisten

#### Metode B: Edit `data.json` Manual (HANYA jika bot sudah dihentikan)

```json
"120363411450968353@g.us": {
  "cadence": "daily",
  "deadline": "10:43"
}
```

*   **Hanya lakukan** setelah `systemctl stop whatsapp-report-bot` (atau `pkill node index.js`)
*   **Risk jika dilanggar:** `Permission denied` (file milik root, dieksekusi user), `watchFile` race condition (ubah tiba-tiba bikin flag stuck lama), mustahil `systemctl restart` kembali normal
*   **Langkah aman:** `stop` → `edit data.json` → `start`

#### Metode C: Ubah `config.json` global (memengaruhi deadline default baru)

```json
"deadline": "10:43"
```

*   Hanya mengatur deadline **default** untuk grup masa depan (via `src/migrate.js`)
*   Grup yang sudah terdaftar tetap pakai setting di `data.json.settings.groups[gid]`
*   Gunakan jika ingin mengubah nilai default bagi grup masa depan

### 3. Catatan Teknis dari Debugging Terakhir

| Masalah | Penyebab | Solusi |
|---|---|---|
| `Winoto tidak menerima DM` | `normalizeId()` menghapus `:@lid` → `204...@lid` dianggap sama dengan bot LID `204...` → di-filter out | **Sudah diedit di `src/bot.js:50-68`** → perbandingan langsung `p.id === botLid` |
| Monitor `journalctl` kosong | 2 instance bot bertengkar over lock (systemd + manual terminal) | Hentikan instance manual, biarkan systemd satu-satunya |
| `Permission denied` | Edit `data.json` manual saat bot `root` | Gunakan Metode A (API `POST /update-deadline`) |
| `DM tidak sampai` (Error 463) | Nomor bot belum disimpan kontak / belum ada chat session | Simpan nomor bot di kontak peserta, atau kirim `!lapor` pertama kali dari bot |

Tabel jadwal per cadence: lihat [Jadwal Per Grup](#jadwal-per-grup).

------
**Alur jadwal `2xsebulan`** (tiap cycle):

```
tgl 1/15 00:00        tgl 3/17 11:30           tgl 4/18 17:00        tgl 4/18 23:58   tgl 5/19 00:00
periode dibuka  ─────►  reminder DM (pas jam)  ►  summary harian  ───►  summary        ►  reset + lapor
lapor diterima   │    lalu alert DM + recap         (17:00, tiap        terakhir          ditolak
                  │    1 mnt kemudian)              hari cycle)       (23:58)           (gap)
```

- Summary **17:00** dikirim tiap hari selama cycle (4x per cycle)
- Lapor setelah tenggat (11:30) sampai akhir periode tetap diterima (tanpa penanda terlambat)
- Di tanggal sela (5–14 dan 19–31) `!lapor` ditolak dengan info jadwal berikutnya
- Grup baru yang bergabung setelahnya otomatis dipreset sama (2xsebulan 11:30)

## Cara Bot Masuk Grup (hanya link yang diizinkan)

Bot **hanya bekerja di grup yang link undangannya terdaftar** di `config.json` → `allowed_group_links`:

1. Buat link undangan grup di WhatsApp (grup boleh terbuka/bebas bergabung, atau Anda sebagai admin menambahkan).
2. Isi `allowed_group_links` dengan link tersebut (bisa lebih dari satu), lalu restart bot.
3. Saat start, bot join grup dari tiap link, mendaftarkannya, dan mulai melayani (reminder/alert/recap hanya untuk grup itu).
4. Grup yang pernah di-join tersimpan di `data.json` (`meta.joined_links`) — restart tidak akan join ulang, hanya memastikan grup tetap terdaftar.

**Grup lain diabaikan total:** bot yang ditambahkan langsung ke grup lain (bukan via link diizinkan) tidak akan terdaftar, tidak membalas, dan tidak mengirim apa pun — termasuk DM reminder (DM hanya dikirim ke anggota grup yang diizinkan). Grup yang dikeluarkan bot-nya langsung berhenti dilayani.

## Perintah (di grup, awalan `!`)

| Perintah | Izin | Fungsi |
| --- | --- | --- |
| `!lapor <nama>` | Semua | Kirim laporan (cukup nama) |
| `!check` | Admin | Lihat list siapa sudah/belum lapor (tanpa DM) |
| `!bantuan` | Semua | Bantuan |

#### Format `!lapor`
- `!lapor <nama>` — cukup sebutkan nama penuh (boleh 2 kata, misal `!lapor Budi Santoso`)
- Spasi berlebih di awal/akhir otomatis dipotong
- Bot hanya terima **1 laporan per orang per periode** (ganti periode otomatis)
- Contoh error jika salah ketik:
  - `!kirim Budi` → `❓ Perintah tidak dikenal. Ketik !bantuan`
  - `!lapor` (kosong) → `❓ Format: !lapor <nama>`
  - `!lapor Budi` di luar jadwal → `⏸️ Jadwal aktif: 1–4 & 15–18. Coba lagi nanti.`

## Alur Otomatis (per jadwal grup)

**Daily / Weekly / Monthly:**

```txt
tenggat        tenggat + 1mnt      17:00
deadline ─────► alert DM + recap ────► summary otomatis
(reminder DM)    (DM + recap grup)    (auto !check ke grup)
```

**2x Sebulan (Semimonthly):**

```
tgl 1/15 00:00        tgl 3/17 11:30           tgl 4/18 17:00        tgl 4/18 23:58   tgl 5/19 00:00
periode dibuka  ─────►  reminder DM (pas jam)  ►  summary harian  ───►  summary        ►  reset + lapor
lapor diterima   │    lalu alert DM + recap         (17:00, tiap        terakhir          ditolak
                   │    1 mnt kemudian)              hari cycle)       (23:58)           (gap)
```

- Summary **17:00** dikirim tiap hari selama cycle (4x per cycle)
- Lapor setelah tenggat sampai akhir periode tetap diterima (tanpa penanda terlambat)
- Di tanggal sela (5–14 dan 19–31) `!lapor` ditolak dengan info jadwal berikutnya
- Grup baru yang bergabung setelahnya otomatis dipreset sama (2xsebulan 11:30)

## Health Check & Message Queue

### Health Check Endpoint
Bot menyediakan HTTP health check endpoint untuk monitoring:

- **URL**: `http://<host>:3000/health` (default port 3000)
- **Response**: JSON dengan status bot
- **Auth**: Opsional Bearer token via `health_token` di config

Contoh response:
```json
{
  "status": "healthy",
  "wa_connected": true,
  "uptime_ms": 123456,
  "queue_pending": 0,
  "last_message_ms": 1692600000000,
  "connection_lost_ms": null,
  "groups_served": 3,
  "bot_jid": "6283164457305:3@s.whatsapp.net",
  "timestamp": "2026-08-21T02:37:15.478Z"
}
```

Status: `healthy` / `degraded` / `offline`

### Message Queue
Bot menggunakan persistent message queue (`queue.jsonl`) untuk:
- Resilience terhadap kegagalan kirim (retry)
- Menghindari kehilangan pesan saat restart
- Batch processing untuk efisiensi

Konfigurasi di `config.json`:
```json
{
  "queue_file": "queue.jsonl",
  "queue_flush_interval_ms": 500,
  "queue_max_size": 10000
}
```

## Testing

```bash
npm test
```

93 test otomatis (node:test, tanpa dependency tambahan) mencakup: validasi config, logika waktu WITA, jadwal 2xsebulan (termasuk gap tanggal sela & batas presisi detik), penyimpanan db, izin perintah (admin/master/DM), seluruh handler (`!lapor`, `!check`, `!bantuan`), semua job terjadwal (reminder, deadlineAlert, periodReset), dan preset jadwal untuk grup baru. Test memakai socket tiruan + file db sementara — tidak menyentuh WhatsApp.

## Menambah Fitur Baru (sustainable)

Perintah: buat file baru di `src/handlers/`, contoh `src/handlers/absen.js`:

```js
export default [{
  name: 'absen',
  aliases: ['hadir'],
  permission: 'all',            // atau 'admin'
  async run(sock, m, { db, time, bot }) {
    // m.jid, m.sender, m.args tersedia
    await bot.reply(sock, m, 'Absen dicatat!')
  },
}]
```

Job terjadwal: buat file di `src/jobs/`:

```js
export default {
  name: 'namaJob',
  async run(now, ctx) {
    // dijalankan setiap check_interval_seconds, cek sendiri kapan harus aksi
  },
}
```

File langsung terdaftar otomatis via `src/registry.js` — tanpa mengubah file lain.

## Catatan Penting

- Menggunakan API WhatsApp tidak resmi — **risiko nomor diblokir ringan**.
  Gunakan nomor khusus, jangan kirim DM massal berlebihan, dan jangan spam.
- DM baru bisa terkirim jika nomor bot sudah disimpan kontak peserta
  / peserta pernah membalas bot.
- Data tersimpan di `data.json` — backup file ini bila perlu.

## Syarat Bot Bekerja & Bisa Balas DM

> **Catatan Penting:** Untuk bot bisa menjalankan fungsinya (reminder, DM, summary) dan merespon pesan dari pengguna, syarat-syarat berikut harus terpenuhi:

### 1. Koneksi WhatsApp Aktif
- `wa_connected: true` di endpoint `/health`
- Bot terhubot dengan session yang valid (scan QR atau pairing)
- **Tanda gagal:** `status: offline` atau `wa_connected: false`

### 2. Nomor Bot Disimpan Kontak Peserta
- Setiap peserta grup wajib menyimpan nomor bot (`6285391863505`) di daftar kontak WhatsApp mereka
- Tanpa itu, bot tidak bisa mengirim DM (Error 463 / Account Restricted)
- **Cara cek:** Tanya user apakah nama bot terlihat di kontak mereka

### 3. User Sudah pernah Chat dengan Bot
- User harus pernah mengirim pesan pertama ke bot (baik `!lapor`, `!check`, atau `Halo`)
- WhatsApp membatasi DM ke user yang belum pernah dialog dengan bot
- **Cara cek:** Cek log `messages.update` atau tanya user apakah pernah mengirim pesan ke bot

### 4. Link Grup diizinkan (hanya 2 grup)
- Bot hanya melayani grup yang link undangannya terdaftar di `config.json` → `allowed_group_links`
- Grup lain diabaikan total (tidak akan terdaftar, tidak membalas, dan tidak mengirim DM)
- **Cara cek:** `curl http://localhost:3000/health` → `groups_served` hanya 2

### 5. Setting Konfigurasi wajib
- `allowed_group_links` di `config.json` tidak boleh kosong
- `cadence` dan `deadline` di `data.json.settings.groups[gid]` sudah terisi
- `exclude_admins: false` akan tetap terdaftar admin di daftar "belum lapor" dan "sudah lapor"

### 6. Bisa Balas Pesan DM (Private Chat)
- User harus pernah kirim pesan pertama ke bot (baik `!lapor`, `!check`, atau sekadar `Halo`)
- Setelah itu, bot bisa merespon perintah `!lapor`, `!check`, `!bantuan` dari DM
- **Error 463** berarti user blokir bot atau kuota harian habis
- **Solusi:** User simpan nomor bot di kontak, lalu kirim pesan `Halo` sekali saja

> **Catatan:** Semua syarat di atas adalah **minimum** agar bot bisa bekerja. Jika salah satunya terpenuhi, bot akan mulai fungsinya, namun kemungkinan beberapa fitur (seperti balasan ke user tertentu) masih terkendala hingga user tersebut melakukan langkah pertama (simpan kontak/kirim pesan).

## Troubleshooting {#troubleshooting}

| Error | Solusi |
|---|---|
| `!lapor` diblok (`⏸️`) | Luar jadwal (tgl 5–14, 19–31). Cek `!bantuan` |
| `Login sebagai:` tidak muncul | Cek koneksi WA / ulangi pairing |
| `replaced` di log | Ada instance lain — matikan satu, hapus `bot.lock` |
| Session corrupt (stuck scan QR berulang) | Hapus `auth_info/`, pairing ulang |
| DM reminder/alert tidak terkirim (Error 463) | Simpan nomor bot di kontak, atau pesan bot dulu untuk buat chat session |
| Health check `degraded` | Cek `last_message_ms` null = belum ada pesan masuk; tunggu pesan masuk |
| Queue penuh | Perbesar `queue_max_size` atau cek koneksi WA |

## Contoh Cepat (Copy-Paste)

Perintah operasional lengkap ada di [docs/api.md](docs/api.md).

```bash
# ganti 1 grup (tidak ganggu lain)
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","deadline":"10:00"}' | jq .

# ganti semua grup allowlist
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"deadline":"10:00"}' | jq .

# ganti summary 1 grup
curl -s -X POST http://localhost:3000/set-group-summary-time \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","summary_time":"15:35"}' | jq .

# verifikasi
curl -s http://localhost:3000/health | jq .groups_served
journalctl -u whatsapp-report-bot --since "30s ago" | grep "loaded groups"
```
