# Perintah (di grup, awalan `!`)

> Kembali ke [README utama](../README.md)

| Perintah | Izin | Fungsi |
| --- | --- | --- |
| `!lapor <nama>` | Semua | Kirim laporan (cukup nama) |
| `!check` | Semua | Lihat list siapa sudah/belum lapor (tanpa DM) |
| `!bantuan` | Semua | Bantuan |

## Format `!lapor`

- `!lapor <nama>` — cukup sebutkan nama penuh (boleh 2 kata, misal `!lapor Budi Santoso`)
- Spasi berlebih di awal/akhir otomatis dipotong
- Bot hanya terima **1 laporan per orang per periode** (ganti periode otomatis)
- Contoh error jika salah ketik:
  - `!kirim Budi` → `❓ Perintah tidak dikenal. Ketik !bantuan`
  - `!lapor` (kosong) → `❓ Format: !lapor <nama>`
  - `!lapor Budi` di luar jadwal → `⏸️ Jadwal aktif: 1–4 & 15–18. Coba lagi nanti.`

## Hak Akses

> **Pengendali bot = admin grup.** Perintah `!check` bisa dipakai admin grup di dalam grup, maupun dari DM ke bot. Pesan `fromMe` (dikirim dari HP nomor bot sendiri, diawali `!`) juga tetap diproses — balasan otomatis bot tidak pernah diawali `!`, jadi aman dari loop.

> **Admin bisa menjalankan SEMUA perintah**, termasuk dari DM (private chat): `!lapor` dan `!check` dari DM akan bekerja (untuk `!check` dari DM, bot memproses semua grup yang terdaftar; syarat: pengirim adalah admin minimal satu grup terdaftar).
