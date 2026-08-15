import { config } from './config.js'
import * as db from './db.js'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

const DAY_INDEX = {
  senin: 0, selasa: 1, rabu: 2, kamis: 3, jumat: 4, sabtu: 5, minggu: 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
}

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

const EN_DAY = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 }

const FIELDS = ['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second']

export function localFields(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  )
  parts.month = Number(parts.month)
  parts.day = Number(parts.day)
  parts.hour = Number(parts.hour)
  parts.minute = Number(parts.minute)
  parts.second = Number(parts.second)
  return parts
}

/** Selisih ms antara represenatasi naive (seolah UTC) dan instan asli, untuk zona waktu config. */
function zoneOffsetMs(probe) {
  const f = localFields(probe)
  const naive = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second)
  return naive - probe.getTime()
}

/** Konversi waktu "naif lokal" (y md h:m:s) menjadi instan UTC asli. */
export function realInstantOf(year, month, day, hour, minute, second = 0) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  return naive - zoneOffsetMs(new Date(naive))
}

/** Hari dalam minggu (Senin=0 .. Minggu=6) menurut zona waktu lokal. */
export function weekdayIndex(date = new Date()) {
  return EN_DAY[localFields(date).weekday]
}

/** Instan Senin 00:00 lokal pada minggu yang memuat `date`. */
export function weekStartInstant(date = new Date()) {
  const f = localFields(date)
  const wd = weekdayIndex(date)
  const naive = Date.UTC(f.year, f.month - 1, f.day - wd)
  return naive - zoneOffsetMs(new Date(naive))
}

/** ID periode: tanggal Senin lokal (YYYY-MM-DD). */
export function periodId(date = new Date()) {
  const f = localFields(new Date(weekStartInstant(date)))
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`
}

export function parseDeadline(str) {
  const m = String(str).trim().match(/^([A-Za-z]+)\s+(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const day = DAY_INDEX[m[1].toLowerCase()]
  if (day === undefined) return null
  const hour = Number(m[2])
  const minute = Number(m[3])
  if (hour > 23 || minute > 59) return null
  return { day, hour, minute }
}

/** Tenggat yang sedang berlaku (override dari !tenggat, atau config). */
export function resolvedDeadline() {
  return db.get('deadline', 'override', null) || config.deadline
}

export function formatDeadline(str = resolvedDeadline()) {
  const p = parseDeadline(str)
  if (!p) return str
  return `${DAY_NAMES[p.day]} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/**
 * State tenggat untuk minggu yang memuat `date`.
 * instant: tenggat minggu ini. weekEnd: Senin 00:00 lokal berikutnya.
 * null jika format tenggat tidak valid.
 */
export function deadlineState(date = new Date(), deadlineStr = resolvedDeadline()) {
  const p = parseDeadline(deadlineStr)
  if (!p) return null
  const ws = weekStartInstant(date)
  const f = localFields(new Date(ws))
  return {
    deadline: p,
    deadlineText: formatDeadline(deadlineStr),
    instant: realInstantOf(f.year, f.month, f.day + p.day, p.hour, p.minute),
    weekStart: ws,
    weekEnd: ws + WEEK,
  }
}

/** Rentang tanggal periode untuk ditampilkan, mis. "10 - 16 Agustus 2026". */
export function formatRange(pid = periodId()) {
  const [y, m, d] = pid.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  const end = new Date(Date.UTC(y, m - 1, d + 6))
  const fmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
  })
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

/** True jika instan `date` berada di periode "tenggat sudah lewat" (setelah tenggat, sebelum minggu baru). */
export function isAfterDeadline(date = new Date()) {
  const st = deadlineState(date)
  if (!st) return false
  const t = date.getTime()
  return t >= st.instant && t < st.weekEnd
}

export default { DAY, WEEK }