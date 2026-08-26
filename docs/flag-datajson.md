# Flag di `data.json`

> Kembali ke [README utama](../README.md)

Flag adalah penanda internal agar reminder, alert, dan summary tidak terkirim dua kali dalam periode yang sama. Hanya pola key berikut yang dibaca bot:

| Pola key | Contoh | Fungsi |
|---|---|---|
| `<gid>:reminder:<tenggat>` | `120363411450968353@g.us:reminder:13:47` | Menandai reminder sudah terkirim |
| `<gid>:alert` | `120363411450968353@g.us:alert` | Menandai alert dan recap sudah terkirim |
| `<gid>:summary:<tanggal>` | `120363411450968353@g.us:summary:2026-08-24` | Menandai summary harian sudah terkirim |
| `<gid>:final` | `120363411450968353@g.us:final` | Menandai summary terakhir sudah terkirim |

## Key luar (`periodId`) per cadence

Key pertama di dalam objek `flags` adalah `periodId` yang formatnya bergantung cadence grup:

| Cadence | Format periodId | Contoh |
|---|---|---|
| Harian (daily) | tanggal hari itu `YYYY-MM-DD` | `2026-08-24` |
| Mingguan (weekly) | tanggal Senin minggu tsb | `2026-08-17` |
| 2x sebulan (semimonthly) | `YYYY-MM-01` / `YYYY-MM-15` | `2026-08-01` |
| 1x sebulan (monthly) | `YYYY-MM` | `2026-08` |

Key sembarang atau salah format akan **diabaikan** dan dapat menyebabkan pengiriman ulang (dobel kirim).

## Aturan Aman

Jangan mengedit flag manual saat bot berjalan. Gunakan API agar flag grup terkait dibersihkan dengan benar:

- `POST /update-deadline` → menghapus flag `reminder` + `summary` grup tersebut untuk hari ini
- `POST /set-group-summary-time` → menghapus flag `summary` grup tersebut untuk hari ini

Job `periodReset` membersihkan data periode lama otomatis.

Contoh struktur `flags`:

```json
"flags": {
  "2026-08-22": {
    "120363429743078023@g.us:reminder:10:43": true,
    "120363411450968353@g.us:reminder:10:43": true
  }
}
```
