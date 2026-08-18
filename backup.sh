#!/usr/bin/env bash
# Backup harian bot laporan WhatsApp: data.json + sesi WhatsApp (auth_info).
# Simpan 7 hari terakhir, hapus yang lebih lama.
set -euo pipefail

DIR="/home/hidup-mulyono/whatsapp-report-bot"
OUT="$DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP=7

mkdir -p "$OUT"

if tar -czf "$OUT/report-bot-$STAMP.tar.gz" -C "$DIR" data.json auth_info 2>/dev/null; then
  :
else
  # fallback: backup data saja bila sesi bermasalah
  tar -czf "$OUT/report-bot-$STAMP.tar.gz" -C "$DIR" data.json
fi

find "$OUT" -name 'report-bot-*.tar.gz' -mtime +"$KEEP" -delete

echo "[backup] OK -> $OUT/report-bot-$STAMP.tar.gz (simpan $KEEP hari)"