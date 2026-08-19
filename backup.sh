#!/usr/bin/env bash
# Backup harian bot laporan WhatsApp: data.json + sesi WhatsApp (auth_info).
# Sesi tersimpan terenkripsi (session.enc) sehingga aman dibackup;
# KUNCI (auth.key) TIDAK PERNAH dibackup — tanpanya backup sesi tidak bisa dipakai.
# Simpan 7 hari terakhir, hapus yang lebih lama.
set -euo pipefail

DIR="/home/hidup-mulyono/whatsapp-report-bot"
OUT="$DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP=7

mkdir -p "$OUT"

# fallback: backup data saja bila sesi bermasalah
tar -czf "$OUT/report-bot-$STAMP.tar.gz" -C "$DIR" --exclude=auth_info/auth.key data.json auth_info \
  || tar -czf "$OUT/report-bot-$STAMP.tar.gz" -C "$DIR" data.json

find "$OUT" -name 'report-bot-*.tar.gz' -mtime +"$KEEP" -delete

echo "[backup] OK -> $OUT/report-bot-$STAMP.tar.gz (simpan $KEEP hari)"