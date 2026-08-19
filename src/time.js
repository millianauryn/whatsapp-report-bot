import { config } from './config.js'
import * as db from './db.js'

export const DAY = 24 * 60 * 60 * 1000
export const WEEK = 7 * DAY

const DAY_INDEX = {
  senin: 0, selasa: 1, rabu: 2, kamis: 3, jumat: 4, sabtu: 5, minggu: 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
}

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

const EN_DAY = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 }

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

/** ID periode mingguan: tanggal Senin lokal (YYYY-MM-DD). */
export function periodId(date = new Date()) {
  const f = localFields(new Date(weekStartInstant(date)))
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`
}

/** Tanggal lokal (YYYY-MM-DD). */
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(date)
}

export function parseDeadline(str) {
  const s = String(str).trim()
  let m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m) {
    const hour = Number(m[1])
    const minute = Number(m[2])
    if (hour > 23 || minute > 59) return null
    return { day: null, hour, minute }
  }
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const day = DAY_INDEX[m[1].toLowerCase()]
  if (day === undefined) return null
  const hour = Number(m[2])
  const minute = Number(m[3])
  if (hour > 23 || minute > 59) return null
  return { day, hour, minute }
}

export function formatDeadline(str = config.deadline) {
  const p = parseDeadline(str)
  if (!p) return str
  const t = formatTime(p.hour, p.minute)
  return p.day === null ? t : `${DAY_NAMES[p.day]} ${t}`
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function rangeLabel(startInstant, endExclusiveInstant) {
  const f1 = localFields(new Date(startInstant))
  const f2 = localFields(new Date(endExclusiveInstant - DAY))
  return `${f1.day} - ${f2.day} ${MONTHS[f1.month - 1]} ${f1.year}`
}

/** Label tanggal lengkap, mis. "Rabu, 19 Agustus 2026". */
export function formatDateLabel(date) {
  const f = localFields(date)
  return `${DAY_NAMES[weekdayIndex(date)]}, ${f.day} ${MONTHS[f.month - 1]} ${f.year}`
}

// ================= Jadwal per grup =================

const CADENCE_LABEL = {
  daily: 'harian',
  weekly: 'mingguan',
  semimonthly: '2x sebulan',
}

/** Deskripsi jadwal untuk ditampilkan, mis. "2x sebulan · tenggat 11:30 WITA". */
export function describeSchedule(schedule) {
  const label = CADENCE_LABEL[schedule.cadence] || schedule.cadence
  const extra = schedule.cadence === 'semimonthly' ? ' (cycle 1-4 & 15-18)' : ''
  return `${label}${extra} · tenggat ${formatDeadline(schedule.deadline)} WITA`
}

/** Jadwal grup: setting per grup, atau default (config.deadline). */
export function groupSchedule(gid) {
  const s = db.get('settings', 'groups', {})[gid]
  if (s && CADENCE_LABEL[s.cadence] && s.deadline) {
    return { cadence: s.cadence, deadline: s.deadline }
  }
  const d = config.deadline
  const p = parseDeadline(d)
  return { cadence: p && p.day === null ? 'daily' : 'weekly', deadline: d }
}

/** Simpan/hapus jadwal grup (null = kembali ke default). */
export function setGroupSchedule(gid, schedule) {
  const all = db.get('settings', 'groups', {})
  if (!schedule) delete all[gid]
  else all[gid] = { cadence: schedule.cadence, deadline: schedule.deadline }
  db.set('settings', 'groups', all)
}

/**
 * State periode untuk jadwal `schedule` pada waktu `now`, atau null jika
 * saat ini di luar periode (gap / periode belum dibuka).
 */
export function scheduleState(now, schedule) {
  const f = localFields(now)
  const cad = schedule.cadence

  if (cad === 'daily') {
    const p = parseDeadline(schedule.deadline)
    if (!p) return null
    const start = realInstantOf(f.year, f.month, f.day, 0, 0)
    const instant = realInstantOf(f.year, f.month, f.day, p.hour, p.minute)
    return mkState({
      cadence: 'daily', periodId: dayKey(now), periodStart: start, periodEnd: start + DAY,
      instant, deadlineText: formatDeadline(schedule.deadline), periodLabel: formatDateLabel(now),
    })
  }

  if (cad === 'weekly') {
    const p = parseDeadline(schedule.deadline)
    if (!p || p.day === null) return null
    const ws = weekStartInstant(now)
    const wf = localFields(new Date(ws))
    const instant = realInstantOf(wf.year, wf.month, wf.day + p.day, p.hour, p.minute)
    const pid = periodId(now)
    return mkState({
      cadence: 'weekly', periodId: pid, periodStart: ws, periodEnd: ws + WEEK,
      instant, deadlineText: formatDeadline(schedule.deadline), periodLabel: rangeLabel(ws, ws + WEEK),
    })
  }

  if (cad === 'semimonthly') {
    const p = parseDeadline(schedule.deadline)
    if (!p) return null
    const d = f.day
    let startDay, deadlineDay
    if (d >= 1 && d <= 4) { startDay = 1; deadlineDay = 3 }
    else if (d >= 15 && d <= 18) { startDay = 15; deadlineDay = 17 }
    else return null
    const start = realInstantOf(f.year, f.month, startDay, 0, 0)
    const end = realInstantOf(f.year, f.month, deadlineDay + 2, 0, 0)
    const instant = realInstantOf(f.year, f.month, deadlineDay, p.hour, p.minute)
    const days = []
    for (let i = 0; i < 4; i++) days.push(dayKey(new Date(start + i * DAY)))
    return mkState({
      cadence: 'semimonthly', periodId: `${f.year}-${String(f.month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      periodStart: start, periodEnd: end, instant,
      deadlineText: formatDeadline(schedule.deadline), periodLabel: rangeLabel(start, end),
      days, hasDailySummary: true, hasFinalSummary: true, reminderAtInstant: true,
    })
  }

  return null
}

function mkState(s) {
  return {
    ...s,
    days: s.days || null,
    hasDailySummary: !!s.hasDailySummary,
    hasFinalSummary: !!s.hasFinalSummary,
    reminderAtInstant: !!s.reminderAtInstant,
    /** Jeda alert setelah reminder yang dikirim pas jam tenggat (2xsebulan). */
    alertDelayMs: s.reminderAtInstant ? 60_000 : 0,
  }
}

/**
 * Info periode berikutnya saat sekarang di luar periode (gap), atau null jika
 * periode sedang berjalan / cadence tanpa gap.
 */
export function nextPeriodInfo(now, schedule) {
  const f = localFields(now)
  const cad = schedule.cadence

  if (cad === 'semimonthly') {
    const p = parseDeadline(schedule.deadline)
    if (!p) return null
    const d = f.day
    if ((d >= 1 && d <= 4) || (d >= 15 && d <= 18)) return null
    let y = f.year
    let m = f.month
    let startDay, deadlineDay
    if (d < 15) { startDay = 15; deadlineDay = 17 }
    else {
      if (m === 12) { y = Number(f.year) + 1; m = 1 } else m += 1
      startDay = 1; deadlineDay = 3
    }
    const start = realInstantOf(y, m, startDay, 0, 0)
    const end = realInstantOf(y, m, deadlineDay + 2, 0, 0)
    const instant = realInstantOf(y, m, deadlineDay, p.hour, p.minute)
    return {
      periodId: `${y}-${String(m).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      periodLabel: rangeLabel(start, end), deadlineText: formatDeadline(schedule.deadline),
      start, instant, end,
    }
  }

  return null
}

/** True jika `date` berada di "sudah lewat tenggat" untuk jadwal grup itu. */
export function isAfterDeadline(date, schedule) {
  const st = scheduleState(date, schedule)
  return st ? date.getTime() >= st.instant : false
}