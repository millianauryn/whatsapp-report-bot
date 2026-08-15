# Bot Laporan WhatsApp

Bot WhatsApp untuk grup yang mengumpulkan **laporan mingguan** dari semua peserta. Bot melacak siapa yang sudah lapor / belum, mengingatkan lewat **DM pribadi** sebelum tenggat, dan memberi tahu real-time saat tenggat lewat. Semua waktu mengikuti **zona WITA** (Asia/Makassar) — sesuai jam di HP pengguna.

Dibangun dengan [Baileys](https://github.com/WhiskeysSockets/Baileys) (protocol WhatsApp Web). Gratis, tanpa biaya bulanan.

## Fitur

- Laporan 1x per minggu (periode Senin–Minggu), format: `!lapor <nama> - <keterangan>`
- `!status` untuk melihat siapa sudah/belum lapor (dengan mention)
- `!check` (admin) untuk melihat list siapa sudah/belum lapor — tanpa DM
- **Otomatis:** DM pengingat `N` menit sebelum tenggat (default 60 menit, 1x/minggu)
- **Otomatis real-time:** DM + ringkasan grup tepat saat tenggat lewat (1x/minggu)
- Tenggat bisa diubah kapan saja: `!tenggat <hari> <jam:menit>`
- Laporan setelah tenggat tetap diterima, ditandai **terlambat**
- Periode baru otomatis setiap Senin 00:00 WITA, atau manual dengan `!reset`
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

- Setelah login, sesi tersimpan di folder `auth_info/` — mulai ulang tidak perlu scan ulang.
- Bot otomatis mencatat grup tempat ia ditambahkan.
- Anggota grup: simpan nomor bot di kontak, lalu setiap peserta kirim di grup:
  ```
  !lapor Budi Santoso - Menyelesaikan laporan mingguan
  ```

> **Penting:** hanya boleh **satu** instance bot berjalan sekaligus. `index.js` memakai file kunci `bot.lock` — jika instance kedua dijalankan, bot akan menolak dengan pesan `[lock]`. Jika dijalankan sebagai service, jangan jalankan `node index.js` manual di sampingnya (bisa memicu konflik sesi WhatsApp `replaced`).

> **Pengendali bot = admin grup.** Perintah `!join`/`!leave`/`!grup`/`!tenggat`/`!reset`/`!alert`/`!check` bisa dipakai admin grup di dalam grup, maupun dari DM ke bot. Pesan `fromMe` (dikirim dari HP nomor bot sendiri, diawali `!`) juga tetap diproses — balasan otomatis bot tidak pernah diawali `!`, jadi aman dari loop.

> **Admin bisa menjalankan SEMUA perintah**, termasuk dari DM (private chat): `!lapor`, `!status`, `!check`, `!tenggat`, `!reset`, `!alert` dari DM akan bekerja (untuk `!status`/`!check` dari DM, bot memproses semua grup yang terdaftar; syarat: pengirim adalah admin minimal satu grup terdaftar). `!leave` tetap harus dikirim di dalam grup yang dituju.

## Konfigurasi (`config.json`)

| Kunci | Default | Keterangan |
|---|---|---|
| `deadline` | `"Jumat 21:00"` | Tenggat default setiap minggu (hari Indonesia + jam lokal) |
| `timezone` | `"Asia/Makassar"` | Zona waktu pemantauan (WITA). Ganti sesuai kebutuhan |
| `reminder_minutes_before` | `60` | Berapa menit sebelum tenggat DM pengingat dikirim |
| `check_interval_seconds` | `30` | Interval pengecekan scheduler (real-time detection) |
| `exclude_admins` | `true` | `true` = admin grup tidak wajib lapor dan tidak muncul di daftar |
| `auto_join_groups` | `[]` | Daftar link undangan grup. Bot otomatis masuk saat start (1x per link) |
| `data_file` / `auth_dir` | default | Lokasi penyimpanan |

## Pindah-Pindah Grup via Link

Bot bisa masuk/keluar grup hanya dengan link undangan, tanpa interaksi admin grup tujuan:

- **Masuk:** kirim link ke bot (DM atau di grup mana pun) — `!join https://chat.whatsapp.com/<kode>`, atau isi `config.json` → `"auto_join_groups": ["<link>"]` lalu restart (bot join otomatis saat start).
- **Keluar:** masuk ke grup itu dan kirim `!leave`.
- **Cek daftar grup:** `!grup`.
- Ketiga perintah di atas untuk **admin grup** (di grup mana pun) atau dari DM.
- Link yang sudah berhasil diproses tersimpan di `data.json` (`joined_invites`) — tidak akan di-join ulang saat restart.

> **Catatan keamanan:** dengan model admin, admin grup mana pun yang terdaftar bisa menyuruh bot join ke grup lain via link dan `!leave`. Hanya pegang perintah ini pada admin yang dipercaya.

## Perintah (di grup, awalan `!`)

| Perintah | Izin | Fungsi |
|---|---|---|
| `!lapor <nama> - <keterangan>` | Semua | Kirim laporan mingguan |
| `!status` | Semua | Lihat siapa sudah/belum lapor |
| `!check` | Admin | Lihat list siapa sudah/belum lapor (tanpa DM) |
| `!tenggat <hari> <jam:menit>` | Admin | Ubah tenggat, mis. `!tenggat Sabtu 12:30` |
| `!tenggat` | Admin | Lihat tenggat saat ini |
| `!reset` | Admin | Mulai periode baru sekarang |
| `!reset <nama/HP>` | Admin | Reset laporan 1 orang (cocok nama tersimpan/nama laporan/nomor HP) supaya bisa lapor ulang |
| `!alert on` / `!alert off` | Admin | Nyalakan/matikan alert tenggat otomatis (`!alert` = lihat status) |
| `!alertdm <teks>` | Admin | Ubah teks DM alert (`!alertdm` = lihat, `!alertdm reset` = bawaan) |
| `!join <link>` | Admin | Bot gabung ke grup via link undangan (bisa DM ke bot) |
| `!leave` | Admin | Bot keluar dari grup tempat perintah dikirim |
| `!grup` | Admin | Daftar grup yang terdaftar |
| `!bantuan` | Semua | Bantuan |

## Alur Otomatis (per minggu)

```
Senin 00:00           tenggat - 60 mnt              tenggat (mis. Jumat 21:00)     Minggu 23:59
periode baru  ───────►  DM "jangan lupa lapor"  ───►  DM "tenggat lewat" + recap  ─►  periode selesai
                       (ke yang belum lapor, 1x)     (ke yang belum lapor, 1x)
```

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