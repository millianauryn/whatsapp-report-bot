# HTTP API

> Kembali ke [README utama](../README.md)

Semua endpoint berjalan di port `health_port` (default `3000`). Jika `health_token` diisi di `config.json`, sertakan header `Authorization: Bearer <token>`.

## GET /health — Status Bot

```bash
curl -s http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "wa_connected": true,
  "uptime_ms": 123456,
  "last_message_ms": 1692600000000,
  "connection_lost_ms": null,
  "groups_served": 2,
  "bot_jid": "6283164457305:5@s.whatsapp.net",
  "timestamp": "2026-08-24T02:31:49.074Z"
}
```

Status: `healthy` / `degraded` / `offline`

## POST /update-deadline — Ganti Tenggat

```bash
# Ganti 1 grup (tidak ganggu grup lain); clear flag reminder + summary grup itu
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","deadline":"10:00"}'

# Ganti SEMUA grup allowlist sekaligus; reset flags hari ini
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"deadline":"10:00"}'
```

Catatan:
- Tanpa parameter `gid`, cadence dipaksa `daily`; dengan `gid`, cadence sebelumnya dipertahankan oleh `time.js`
- Menggunakan `time.dayKey()` (WITA) sehingga tanggal flag konsisten dengan zona bot

## POST /set-group-summary-time — Ganti Jam Summary per Grup

```bash
# Ganti summary satu grup; clear flag summary hari itu
curl -s -X POST http://localhost:3000/set-group-summary-time \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","summary_time":"15:35"}'

# Reset summary grup ke default 17:00
curl -s -X POST http://localhost:3000/set-group-summary-time \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","summary_time":"17:00"}'
```

Catatan:
- `summary_time` format `HH:MM` waktu WITA; validasi regex server-side
- Grup harus sudah terdaftar (`unknown group` jika belum)
- Grup tanpa `summary_time` memakai default global `config.json` (`*_summary_time`, default `17:00`)
- Bot **tidak perlu restart**

## Monitoring Pengiriman

```bash
journalctl -u whatsapp-report-bot -f --no-pager | grep --line-buffered -E "GID_GRUP|deadlineAlert|DM sent|Summary terkirim"

# Log 30 detik terakhir
journalctl -u whatsapp-report-bot --since "30s ago" | grep -E "Checking|inWindow|DM sent|Summary terkirim|flag exists"
```

## Contoh Cepat (Copy-Paste)

```bash
# ganti 1 grup (tidak ganggu lain)
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","deadline":"10:00"}' | jq .

# ganti semua grup allowlist
curl -s -X POST http://localhost:3000/update-deadline \
  -d '{"deadline":"10:00"}' | jq .

# ganti summary 1 grup
curl -s -X POST http://localhost:3000/set-group-summary-time \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","summary_time":"15:35"}' | jq .

# verifikasi
curl -s http://localhost:3000/health | jq .groups_served
journalctl -u whatsapp-report-bot --since "30s ago" | grep "loaded groups"
```
