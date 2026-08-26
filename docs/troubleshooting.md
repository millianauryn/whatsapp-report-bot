# Troubleshooting & Syarat Bot Bekerja

> Kembali ke [README utama](../README.md)

## Syarat Bot Bekerja & Bisa Balas DM

> **Catatan Penting:** Untuk bot bisa menjalankan fungsinya (reminder, DM, summary) dan merespon pesan dari pengguna, syarat-syarat berikut harus terpenuhi:

### 1. Koneksi WhatsApp Aktif
- `wa_connected: true` di endpoint `/health`
- Bot terhubung dengan session yang valid (scan QR atau pairing)
- **Tanda gagal:** `status: offline` atau `wa_connected: false`

### 2. Nomor Bot Disimpan Kontak Peserta
- Setiap peserta grup wajib menyimpan nomor bot di daftar kontak WhatsApp mereka
- Tanpa itu, bot tidak bisa mengirim DM (Error 463 / Account Restricted)
- **Cara cek:** Tanya user apakah nama bot terlihat di kontak mereka

### 3. User Sudah pernah Chat dengan Bot
- User harus pernah mengirim pesan pertama ke bot (baik `!lapor`, `!check`, atau `Halo`)
- WhatsApp membatasi DM ke user yang belum pernah dialog dengan bot
- **Cara cek:** Cek log `messages.update` atau tanya user apakah pernah mengirim pesan ke bot

### 4. Link Grup diizinkan
- Bot hanya melayani grup yang link undangannya terdaftar di `config.json` → `allowed_group_links`
- Grup lain diabaikan total (tidak akan terdaftar, tidak membalas, dan tidak mengirim DM)
- **Cara cek:** `curl http://localhost:3000/health` → cek `groups_served`

### 5. Setting Konfigurasi wajib
- `allowed_group_links` di `config.json` tidak boleh kosong
- `cadence` dan `deadline` di `data.json.settings.groups[gid]` sudah terisi
- `exclude_admins: true` akan menyembunyikan admin dari daftar "belum lapor"

### 6. Bisa Balas Pesan DM (Private Chat)
- User harus pernah kirim pesan pertama ke bot (baik `!lapor`, `!check`, atau sekadar `Halo`)
- Setelah itu, bot bisa merespon perintah `!lapor`, `!check`, `!bantuan` dari DM
- **Error 463** berarti user blokir bot atau kuota harian habis
- **Solusi:** User simpan nomor bot di kontak, lalu kirim pesan `Halo` sekali saja

> **Catatan:** Semua syarat di atas adalah **minimum** agar bot bisa bekerja. Jika salah satunya terpenuhi, bot akan mulai fungsinya, namun kemungkinan beberapa fitur (seperti balasan ke user tertentu) masih terkendala hingga user tersebut melakukan langkah pertama (simpan kontak/kirim pesan).

## Tabel Error & Solusi

| Error | Solusi |
|---|---|
| `!lapor` diblok (`⏸️`) | Luar jadwal (tgl 5–14, 19–31). Cek `!bantuan` |
| `Login sebagai:` tidak muncul | Cek koneksi WA / ulangi pairing |
| `replaced` di log | Ada instance lain — matikan satu, hapus `bot.lock` |
| Session corrupt (stuck scan QR berulang) | Hapus `auth_info/`, pairing ulang |
| DM reminder/alert tidak terkirim (Error 463) | Simpan nomor bot di kontak, atau pesan bot dulu untuk buat chat session |
| Health check `degraded` | Cek `last_message_ms` null = belum ada pesan masuk; tunggu pesan masuk |
| Queue penuh | Perbesar `queue_max_size` atau cek koneksi WA |
| `Permission denied` saat edit data | Jangan edit manual saat bot hidup — gunakan [API](api.md) |
