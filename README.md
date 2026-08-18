# Bot Laporan WhatsApp

Bot WhatsApp untuk mengumpulkan laporan dari peserta grup, dengan **jadwal per grup**: setiap grup bisa punya jadwal berbeda (harian, mingguan, 2 mingguan, 2x sebulan, atau bulanan). Bot melacak siapa yang sudah lapor / belum, mengingatkan lewat **DM pribadi**, dan memberi tahu real-time saat tenggat lewat. Semua waktu mengikuti **zona WITA** (Asia/Makassar) — sesuai jam di HP pengguna.

Dibangun dengan [Baileys](https://github.com/WhiskeysSockets/Baileys) (protocol WhatsApp Web). Gratis, tanpa biaya bulanan.

## Fitur

- **Jadwal per grup** — tiap grup punya jadwal sendiri (lihat tabel jadwal di bawah)
- `!lapor <nama>` untuk mengirim laporan (cukup nama)
- `!check` (admin) untuk melihat list siapa sudah/belum lapor — tanpa DM; nama per nomor diambil dari laporan terakhir (`!lapor`), nama WhatsApp hanya sebagai isi awal bila belum pernah lapor
- **Otomatis:** DM pengingat menjelang tenggat (default 60 menit sebelum; untuk jadwal 2xsebulan: persis jam tenggat)
- **Otomatis real-time:** DM + ringkasan grup tepat saat tenggat lewat
- Laporan setelah tenggat tetap diterima, ditandai **terlambat**
- Periode baru otomatis per jadwal grup (tanpa perintah manual)
- Arsitektur modular — fitur baru tinggal tambah 1 file

## Persyaratan

- Node.js **18+** (disarankan 20+)
- Satu nomor WhatsApp khusus sebagai bot (bisa nomor biasa/WhatsApp Business)
- Nomor bot **harus disimpan di kontak peserta** agar DM dari bot bisa terkirim

## Instalasi & Menjalankan

```bash
cd whatsapp-report-bot
npm install

# Pertama kali: scan QR dengan WhatsApp di nomor bot
node index.js

# Atau pakai kode pairing (lebih mudah untuk server jauh)
node index.js --pair 6281234567890
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

## Konfigurasi (`config.json`)

| Kunci | Default | Keterangan |
|---|---|---|
| `deadline` | `"21:00"` | Jadwal default grup: `"21:00"` = harian; `"Jumat 21:00"` = mingguan |
| `timezone` | `"Asia/Makassar"` | Zona waktu pemantauan (WITA). Ganti sesuai kebutuhan |
| `reminder_minutes_before` | `60` | Berapa menit sebelum tenggat DM pengingat dikirim (untuk 2xsebulan selalu pas jam tenggat) |
| `check_interval_seconds` | `30` | Interval pengecekan scheduler (real-time detection) |
| `exclude_admins` | `true` | `true` = admin grup tidak wajib lapor dan tidak muncul di daftar |
| `allowed_group_links` | `[]` | Daftar link undangan grup yang diizinkan. Bot join & melayani HANYA grup dari link ini |
| `data_file` / `auth_dir` | default | Lokasi penyimpanan |

## Jadwal Per Grup

Setiap grup punya jadwal sendiri, ditetapkan di `data.json` (`settings.groups`) atau bawaan dari `config.json` (`deadline`) — **tidak ada perintah chat** untuk mengubahnya; reset dan pergantian periode sepenuhnya otomatis.

| Jadwal | Periode & alur |
|---|---|
| **Harian** | Lapor tiap hari; reminder `N` menit sebelum jam tenggat; alert setelah lewat; reset tiap tengah malam |
| **Mingguan** | Periode Senin–Minggu; tenggat Jumat jam terpilih; reminder `N` menit sebelum; alert setelah lewat; reset Senin 00:00 |
| **2 mingguan** | Periode 2 minggu (dari Senin 5 Jan 2026); tenggat Jumat jam terpilih; alert setelah lewat; reset tiap 2 minggu |
| **2x sebulan** | Cycle **1–4** (tenggat tgl 3 jam 11:30) dan **15–18** (tenggat tgl 17 jam 11:30) |
| **Bulanan** | Periode tgl 1 s.d. 6; tenggat tgl 5 jam 11:30; reset tgl 7 00:00 |

**Alur jadwal `2xsebulan`** (tiap cycle):

```
tgl 1/15 00:00        tgl 3/17 11:30           tgl 4/18 17:00        tgl 4/18 23:58   tgl 5/19 00:00
periode dibuka  ─────►  reminder DM (pas jam)  ►  summary harian  ───►  summary        ►  reset + lapor
lapor diterima   │    lalu alert DM + recap         (17:00, tiap        terakhir          ditolak
                  │    1 mnt kemudian)              hari cycle)       (23:58)           (gap)
```

- Summary **17:00** dikirim tiap hari selama cycle (4x per cycle)
- Lapor setelah tenggat (11:30) sampai akhir periode tetap diterima, ditandai **terlambat**
- Di tanggal sela (5–14 dan 19–31) `!lapor` ditolak dengan info jadwal berikutnya

## Cara Bot Masuk Grup (hanya link yang diizinkan)

Bot **hanya bekerja di grup yang link undangannya terdaftar** di `config.json` → `allowed_group_links`:

1. Buat link undangan grup di WhatsApp (grup boleh terbuka/bebas bergabung, atau Anda sebagai admin menambahkan).
2. Isi `allowed_group_links` dengan link tersebut (bisa lebih dari satu), lalu restart bot.
3. Saat start, bot join grup dari tiap link, mendaftarkannya, dan mulai melayani (reminder/alert/recap hanya untuk grup itu).
4. Grup yang pernah di-join tersimpan di `data.json` (`meta.joined_links`) — restart tidak akan join ulang, hanya memastikan grup tetap terdaftar.

**Grup lain diabaikan total:** bot yang ditambahkan langsung ke grup lain (bukan via link diizinkan) tidak akan terdaftar, tidak membalas, dan tidak mengirim apa pun — termasuk DM reminder (DM hanya dikirim ke anggota grup yang diizinkan). Grup yang dikeluarkan bot-nya langsung berhenti dilayani.

## Perintah (di grup, awalan `!`)

| Perintah | Izin | Fungsi |
|---|---|---|
| `!lapor <nama>` | Semua | Kirim laporan (cukup nama) |
| `!check` | Admin | Lihat list siapa sudah/belum lapor (tanpa DM) |
| `!bantuan` | Semua | Bantuan |

## Alur Otomatis (per jadwal grup)

```
jendela reminder                    tenggat lewat
(60 mnt sebelum, atau pas jam       (real-time, ±30 detik)
 untuk 2xsebulan)         ───────►  DM "tenggat lewat" + recap grup
DM "jangan lupa lapor"              (1x per periode)
(ke yang belum lapor)
```

## Testing

```bash
npm test
```

74 test otomatis (node:test, tanpa dependency tambahan) mencakup: validasi config, logika waktu WITA, semua cadence jadwal (harian/mingguan/2-mingguan/2xsebulan/bulanan, termasuk gap & bulan pendek), penyimpanan db, izin perintah (admin/master/DM), seluruh handler (`!lapor`, `!check`, `!bantuan`), semua job terjadwal (reminder, deadlineAlert, periodReset), dan migrasi data lama ke model per grup. Test memakai socket tiruan + file db sementara — tidak menyentuh WhatsApp.

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

- Menggunakan API WhatsApp tidak resmi — **risiko nomor diblokir ringan**. Gunakan nomor khusus, jangan kirim DM massal berlebihan, dan jangan spam.
- DM baru bisa terkirim jika nomor bot sudah disimpan kontak peserta / peserta pernah membalas bot.
- Data tersimpan di `data.json` — backup file ini bila perlu.