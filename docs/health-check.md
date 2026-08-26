# Health Check & Message Queue

> Kembali ke [README utama](../README.md)

## Health Check Endpoint

Bot menyediakan HTTP health check endpoint untuk monitoring:

- **URL**: `http://<host>:3000/health` (default port 3000)
- **Response**: JSON dengan status bot
- **Auth**: Opsional Bearer token via `health_token` di config

Contoh response:
```json
{
  "status": "healthy",
  "wa_connected": true,
  "uptime_ms": 123456,
  "last_message_ms": 1692600000000,
  "connection_lost_ms": null,
  "groups_served": 2,
  "bot_jid": "6283164457305:5@s.whatsapp.net",
  "timestamp": "2026-08-21T02:37:15.478Z"
}
```

Status: `healthy` / `degraded` / `offline`

Daftar endpoint lainnya: lihat [api.md](api.md).

## Message Queue

Konfigurasi di `config.json`:
```json
{
  "queue_file": "queue.jsonl",
  "queue_flush_interval_ms": 500,
  "queue_max_size": 10000
}
```

Queue dipakai untuk fallback mention grup bila DM gagal (Error 463 / account restricted).
