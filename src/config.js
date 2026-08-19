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
  }
}

export const config = validateConfig(raw)