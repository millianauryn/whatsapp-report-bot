# Cara Ganti Tenggat & Setting Group

> Kembali ke [README utama](../README.md)

> **Jangan pernah edit `data.json` manual saat bot sedang menjalankan** (menyebabkan `Permission denied`, race condition, dan flag stuck). Gunakan API endpoint di bawah ini.

## 1. Via HTTP API (cara resmi)

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

*   `db.set` langsung ke memory + reload dalam 1 detik
*   Clear flag `...:reminder:HH:MM` otomatis
*   `groups_served` tetap konsisten, tidak error

## 2. Verifikasi setelah perubahan

```bash
# Cek health endpoint
curl -s http://localhost:3000/health | grep -E "groups_served|status|bot_jid"

# Cek data.json otomatis terupdate
cat data.json | grep -A2 deadline

# Cek log reminder dalam 30 detik
journalctl -u whatsapp-report-bot --since "30s ago" | grep -E "Checking|inWindow|DM sent|Summary terkirim|flag exists"
```

Lihat juga [api.md](api.md) untuk daftar endpoint lengkap termasuk `/set-group-summary-time`.

## 3. Struktur Konfigurasi Files

Konfigurasi bot terbagi menjadi dua file:

**A. `config.json` — Global Settings (pengaruh semua grup):** lihat [konfigurasi.md](konfigurasi.md).

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
| `deadline` | Jam/tanggal tenggat: `"HH:MM"`, `"Jumat HH:MM"`, atau `"5 HH:MM"` (tanggal+bjam untuk monthly) | `10:43` | Wajib ada |

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
  "names": { "...": "..." },
  "flags": {
    "2026-08-22": {
      "120363429743078023@g.us:reminder:10:43": true,
      "120363411450968353@g.us:reminder:10:43": true
    }
  },
  "reports": { "...": "..." }
}
```

Detail flag: lihat [flag-datajson.md](flag-datajson.md).

## 4. Cara Ganti Tenggat (3 Metode)

### Metode A: Via HTTP API (REKOMENDASI, AMAN, TIDAK PERNAH `Permission denied`)

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
*   Bot tidak perlu restart

### Metode B: Edit `data.json` Manual (HANYA jika bot sudah dihentikan)

```json
"120363411450968353@g.us": {
  "cadence": "daily",
  "deadline": "10:43"
}
```

*   **Hanya lakukan** setelah `systemctl stop whatsapp-report-bot` (atau `pkill node index.js`)
*   **Risk jika dilanggar:** `Permission denied` (file milik root, dieksekusi user), race condition (flag stuck lama), mustahil `systemctl restart` kembali normal
*   **Langkah aman:** `stop` → `edit data.json` → `start`

### Metode C: Ubah `config.json` global (memengaruhi deadline default baru)

```json
"deadline": "10:43"
```

*   Hanya mengatur deadline **default** untuk grup masa depan (via `src/migrate.js`)
*   Grup yang sudah terdaftar tetap pakai setting di `data.json.settings.groups[gid]`
*   Gunakan jika ingin mengubah nilai default bagi grup masa depan

## 5. Catatan Teknis dari Debugging Terakhir

| Masalah | Penyebab | Solusi |
|---|---|---|
| `Winoto tidak menerima DM` | `normalizeId()` menghapus `:@lid` → `204...@lid` dianggap sama dengan bot LID `204...` → di-filter out | **Sudah diedit di `src/bot.js:50-68`** → perbandingan langsung `p.id === botLid` |
| Monitor `journalctl` kosong | 2 instance bot bertengkar over lock (systemd + manual terminal) | Hentikan instance manual, biarkan systemd satu-satunya |
| `Permission denied` | Edit `data.json` manual saat bot `root` | Gunakan Metode A (API `POST /update-deadline`) |
| `DM tidak sampai` (Error 463) | Nomor bot belum disimpan kontak / belum ada chat session | Simpan nomor bot di kontak peserta, atau kirim `!lapor` pertama kali dari bot |
