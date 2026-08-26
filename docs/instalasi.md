# Instalasi & Menjalankan

> Kembali ke [README utama](../README.md)

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

#### Langkah pairing (untuk server jauh)
1. Jalankan `node index.js --pair 628...0` → muncul kode 8-digit
2. Buka WhatsApp di HP nomor bot → `Imcom > Undang > Masukkan kode`
3. Tunggu sampai log tampil `Login sebagai: 628...@s.whatsapp.net`
4. Kode pairing **kadaluarsa 2 menit** — jika gagal, jalankan ulang perintah

- Setelah login, sesi tersimpan **terenkripsi** (AES-256-GCM) dalam satu file `auth_info/session.enc` — mulai ulang tidak perlu scan ulang.
- Kunci sesi ada di `auth_info/auth.key` (mode 600) — **jangan dibackup**: backup sesi tetap aman hanya jika kunci tidak ikut tersalin (backup.sh sudah mengecualikannya). Hapus folder `auth_info/` untuk memaksa login ulang.
- Bot hanya melayani grup dari link yang diizinkan (lihat [Cara Bot Masuk Grup](alur-jadwal.md#cara-bot-masuk-grup-hanya-link-yang-diizinkan)).
- Anggota grup: simpan nomor bot di kontak, lalu setiap peserta kirim di grup:
  ```
  !lapor Budi Santoso
  ```

> **Penting:** hanya boleh **satu** instance bot berjalan sekaligus. `index.js` memakai file kunci `bot.lock` — jika instance kedua dijalankan, bot akan menolak dengan pesan `[lock]`. Jika dijalankan sebagai service, jangan jalankan `node index.js` manual di sampingnya (bisa memicu konflik sesi WhatsApp `replaced`).

> **Pengendali bot = admin grup.** Perintah `!check` bisa dipakai admin grup di dalam grup, maupun dari DM ke bot. Pesan `fromMe` (dikirim dari HP nomor bot sendiri, diawali `!`) juga tetap diproses — balasan otomatis bot tidak pernah diawali `!`, jadi aman dari loop.

> **Admin bisa menjalankan SEMUA perintah**, termasuk dari DM (private chat): `!lapor` dan `!check` dari DM akan bekerja (untuk `!check` dari DM, bot memproses semua grup yang terdaftar; syarat: pengirim adalah admin minimal satu grup terdaftar).
