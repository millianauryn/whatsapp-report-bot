# Konfigurasi (`config.json`) & Jadwal Per Grup

> Kembali ke [README utama](../README.md)

## Konfigurasi (`config.json`)

| Kunci | Default | Keterangan |
|---|---|---|
| `deadline` | `"21:00"` | Jadwal default grup: `"21:00"` = harian; `"Jumat 21:00"` = mingguan |
| `timezone` | `"Asia/Makassar"` | Zona waktu pemantauan (WITA). Ganti sesuai kebutuhan |
| `reminder_minutes_before` | `60` | Berapa menit sebelum tenggat recap grup dikirim (untuk 2xsebulan selalu pas jam tenggat) |
| `check_interval_seconds` | `30` | Interval pengecekan scheduler (real-time detection) |
| `exclude_admins` | `true` | `true` = admin grup tidak wajib lapor dan tidak muncul di daftar |
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

Contoh isi lengkap:

```json
{
  "deadline": "21:00",
  "timezone": "Asia/Makassar",
  "reminder_minutes_before": 60,
  "check_interval_seconds": 30,
  "exclude_admins": true,
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

## Jadwal Per Grup

Setiap grup terdaftar otomatis mendapat **jadwal 2xsebulan** (preset dijalankan saat bot terhubung; grup baru yang bergabung belakangan ikut dipreset). **Tidak ada perintah chat** untuk mengubahnya; reset dan pergantian periode sepenuhnya otomatis. Untuk **1x sebulan** (grup spesifik, bot aktif 1 hari/bulan): atur manual di `data.json` → `settings.groups[gid] = { "cadence": "monthly", "deadline": "5 11:30" }` — preset tidak menimpa pengaturan manual.

| Cadence | Reminder | Summary | Alert |
|---|---|---|---|
| **2x sebulan** | Pas jam tenggat (mis. 11:30) | 17:00 harian selama cycle | 1 menit setelah tenggat |
| **1x sebulan (monthly)** | Pas jam tenggat | Waktu terkonfigurasi (default 17:00) | 1 menit setelah tenggat |
| **Mingguan (weekly)** | Pas jam tenggat | Waktu terkonfigurasi (default 17:00) | 1 menit setelah tenggat |
| **Harian (daily)** | Pas jam tenggat | Waktu terkonfigurasi (default 17:00) | 1 menit setelah tenggat |

> **Catatan:** Untuk cadence `daily`/`weekly`/`monthly`, reminder dikirim **pas jam tenggat** (bukan 60 menit sebelumnya) jika config `*_reminder_at_deadline: true` (default). Summary dikirim di waktu terkonfigurasi (`*_summary_time`, default 17:00). Alert selalu 1 menit setelah tenggat.
