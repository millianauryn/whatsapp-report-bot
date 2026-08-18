import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = JSON.parse(readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))

/** Angka bulat dengan batas bawah; perbaiki otomatis bila tidak valid. */
function number(val, fallback, min, label) {
  const n = Number(val)
  if (!Number.isFinite(n) || n < min) {
    console.log(`[config] ${label}: ${JSON.stringify(val)} -> ${fallback} (otomatis diperbaiki)`)
    return fallback
  }
  return Math.round(n)
}

/** Zona waktu valid menurut Intl; perbaiki otomatis bila tidak dikenali. */
function timezone(val) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: val }).format()
    return val
  } catch {
    console.log(`[config] timezone: ${JSON.stringify(val)} -> Asia/Makassar (otomatis diperbaiki)`)
    return 'Asia/Makassar'
  }
}

const DEADLINE_RE = /^([A-Za-z]+)\s+(\d{1,2}):(\d{2})$/
const DAYS = new Set([
  'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

/** Format tenggat valid (hari dikenal + jam <= 23 + menit <= 59); perbaiki otomatis bila tidak. */
function deadline(val) {
  const m = String(val).trim().match(DEADLINE_RE)
  if (m && DAYS.has(m[1].toLowerCase()) && Number(m[2]) <= 23 && Number(m[3]) <= 59) return val
  console.log(`[config] deadline: ${JSON.stringify(val)} -> Jumat 21:00 (otomatis diperbaiki)`)
  return 'Jumat 21:00'
}

/** Validasi & perbaikan otomatis seluruh isi config. Dipakai saat start dan oleh test. */
export function validateConfig(raw) {
  return {
    deadline: deadline(raw.deadline ?? 'Jumat 21:00'),
    timezone: timezone(raw.timezone ?? 'Asia/Makassar'),
    reminder_minutes_before: number(raw.reminder_minutes_before, 60, 1, 'reminder_minutes_before'),
    check_interval_seconds: number(raw.check_interval_seconds, 30, 10, 'check_interval_seconds'),
    exclude_admins: raw.exclude_admins !== false,
    auto_join_groups: Array.isArray(raw.auto_join_groups) ? raw.auto_join_groups : [],
    data_file: raw.data_file || 'data.json',
    auth_dir: raw.auth_dir || 'auth_info',
  }
}

export const config = validateConfig(raw)