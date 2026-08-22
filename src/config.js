import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDeadline } from './time.js'

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

/** Format tenggat valid (sama parser dgn time.js): "21:00" atau "Jumat 21:00". */
function deadline(val) {
  if (parseDeadline(String(val).trim())) return val
  console.log(`[config] deadline: ${JSON.stringify(val)} -> 21:00 (otomatis diperbaiki)`)
  return '21:00'
}

const INVITE_RE = /^(?:https:\/\/chat\.whatsapp\.com\/)?([A-Za-z0-9_-]{15,})$/

/** Daftar link undangan grup yang diizinkan; link tidak valid dibuang. */
function allowedGroupLinks(val) {
  const links = Array.isArray(val) ? val : []
  const ok = links.filter((l) => INVITE_RE.test(String(l).trim()))
  if (ok.length !== links.length) {
    console.log(`[config] allowed_group_links: ${links.length - ok.length} link tidak valid, dibuang`)
  }
  return ok
}

/** Validasi boolean dengan fallback. */
function bool(val, fallback) {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') return val === 'true'
  return fallback
}

/** Validasi waktu HH:MM dengan fallback. */
function timeOfDay(val, fallback) {
  const s = String(val ?? '').trim()
  if (/^(\d{1,2}):(\d{2})$/.test(s)) {
    const h = Number(s.split(':')[0])
    const m = Number(s.split(':')[1])
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return s
  }
  console.log(`[config] time: ${JSON.stringify(val)} -> ${fallback} (otomatis diperbaiki)`)
  return fallback
}

/** Validasi & perbaikan otomatis seluruh isi config. Dipakai saat start dan oleh test. */
export function validateConfig(raw) {
  return {
    deadline: deadline(raw.deadline ?? '21:00'),
    timezone: timezone(raw.timezone ?? 'Asia/Makassar'),
    reminder_minutes_before: number(raw.reminder_minutes_before, 60, 1, 'reminder_minutes_before'),
    check_interval_seconds: number(raw.check_interval_seconds, 30, 10, 'check_interval_seconds'),
    exclude_admins: raw.exclude_admins !== false,
    allowed_group_links: allowedGroupLinks(raw.allowed_group_links),
    data_file: raw.data_file || 'data.json',
    auth_dir: raw.auth_dir || 'auth_info',
    health_port: number(raw.health_port, 3000, 1, 'health_port'),
    health_host: raw.health_host || '0.0.0.0',
    health_token: raw.health_token || '',
    queue_file: raw.queue_file || 'queue.jsonl',
    queue_flush_interval_ms: number(raw.queue_flush_interval_ms, 500, 100, 'queue_flush_interval_ms'),
    queue_max_size: number(raw.queue_max_size, 10000, 100, 'queue_max_size'),
    daily_reminder_at_deadline: bool(raw.daily_reminder_at_deadline, true),
    daily_summary_time: timeOfDay(raw.daily_summary_time, '17:00'),
    weekly_reminder_at_deadline: bool(raw.weekly_reminder_at_deadline, true),
    weekly_summary_time: timeOfDay(raw.weekly_summary_time, '17:00'),
    monthly_reminder_at_deadline: bool(raw.monthly_reminder_at_deadline, true),
    monthly_summary_time: timeOfDay(raw.monthly_summary_time, '17:00'),
  }
}

export const config = validateConfig(raw)