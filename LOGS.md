# Logs — Copy-Paste

> Wrapper untuk `logs.sh` (1.5KB). Semua komen siap copy-paste saat error/cek.

## Live (real-time)

```bash
./logs.sh live
# raw tanpa script:
journalctl -u whatsapp-report-bot -f | grep -E "reminder|deadlineAlert|scheduler|check|lapor|bantuan|queue|health|join|Terhubung|Gagal"
```

## Per function (snapshot)

| Function | Komen |
|---|---|
| **reminder** (DM 08:30/11:30) | `./logs.sh reminder 20` |
| **summary** (17:00/final 23:58) | `./logs.sh summary 20` |
| **check** | `./logs.sh check 20` |
| **lapor** | `./logs.sh lapor 20` |
| **bantuan** | `./logs.sh bantuan 20` |
| **queue** | `./logs.sh queue 20` |
| **health** | `./logs.sh health` |
| **join** | `./logs.sh join` |
| **all** | `./logs.sh all 50` |

Raw tanpa `logs.sh`:

```bash
# reminder — inWindow, Resolving, DM sent, Summary, Gagal, flag exists
journalctl -u whatsapp-report-bot --since "30 min ago" | grep -E "reminder|DM sent|Summary terkirim|Gagal DM|Resolving|Sending|inWindow" | tail -30

# summary — 17:00 & final
journalctl -u whatsapp-report-bot --since "1 hour ago" | grep -E "deadlineAlert|summary|final|Summary terkirim" | tail -20

# check / lapor / bantuan
journalctl -u whatsapp-report-bot --since "30 min ago" | grep -E "check|flag exists|no state|lapor|captureName|bantuan" | tail -20

# queue
journalctl -u whatsapp-report-bot --since "30 min ago" | grep -E "queue|Queue" | tail -20

# join / allowlist
journalctl -u whatsapp-report-bot --since "1 hour ago" | grep -E "join|Grup terdaftar|migrate|joined_links" | tail -20
```

## Health & Data

```bash
# health endpoint
curl -s http://localhost:3000/health | jq .
# tanpa jq:
curl -s http://localhost:3000/health

# DM test langsung (tanpa tunggu tenggat)
curl -s -X POST http://localhost:3000/test-dm -H "Content-Type: application/json" -d '{"jid":"147076893675545@lid","text":"Test"}'

# ganti tenggat per-grup (tanpa edit file)
curl -s -X POST http://localhost:3000/update-deadline -H "Content-Type: application/json" -d '{"gid":"120363411450968353@g.us","deadline":"11:30"}'

# flags & laporan
cat data.json | grep -A5 flags
cat data.json | grep -A2 deadline
```

## Troubleshooting copy-paste

```bash
# !lapor diblok
journalctl -u whatsapp-report-bot --since "10 min ago" | grep -E "lapor|isGroupActive|Periode belum"

# DM tidak sampai (Error 463)
journalctl -u whatsapp-report-bot --since "30 min ago" | grep -E "Gagal DM|account restricted|463|queueGroupMention"

# health degraded
curl -s http://localhost:3000/health | grep -E "status|last_message_ms|groups_served"

# scheduler tidak jalan
journalctl -u whatsapp-report-bot --since "5 min ago" | grep scheduler
```

## Cara Ganti Tenggat (resmi)

> Jangan edit `data.json` manual saat bot jalan (permission + race watchFile).
> Pakai API — jalan sebagai root via bot, langsung `db.set` + clear flag per-deadline.

```bash
# ganti 1 grup (tidak ganggu grup lain)
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"gid":"120363411450968353@g.us","deadline":"10:00"}'

# ganti SEMUA grup allowlist sekaligus
curl -s -X POST http://localhost:3000/update-deadline \
  -H "Content-Type: application/json" \
  -d '{"deadline":"10:00"}'

# verifikasi
curl -s http://localhost:3000/health | grep groups_served
cat data.json | grep -A2 deadline
journalctl -u whatsapp-report-bot --since "30s ago" | grep -E "loaded groups|Checking"
```
