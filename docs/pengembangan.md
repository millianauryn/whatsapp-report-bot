# Pengembangan: Testing & Menambah Fitur

> Kembali ke [README utama](../README.md)

## Testing

```bash
npm test
```

Test otomatis (node:test, tanpa dependency tambahan) mencakup: validasi config, logika waktu WITA, jadwal per cadence (termasuk gap tanggal sela & batas presisi detik), penyimpanan db, izin perintah (admin/master/DM), seluruh handler (`!lapor`, `!check`, `!bantuan`), semua job terjadwal (reminder, deadlineAlert, periodReset), dan preset jadwal untuk grup baru. Test memakai socket tiruan + file db sementara — tidak menyentuh WhatsApp.

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
