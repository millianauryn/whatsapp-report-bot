// Import side-effect: arahkan BOT_DATA_FILE ke direktori temp (lihat helpers.js).
import './helpers.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as time from '../src/time.js'

test('parseDeadline: format valid', () => {
  const p = time.parseDeadline('Jumat 21:00')
  assert.deepEqual(p, { day: 4, dayType: 'weekday', hour: 21, minute: 0 })
  assert.deepEqual(time.parseDeadline('sabtu 12:30'), { day: 5, dayType: 'weekday', hour: 12, minute: 30 })
  assert.deepEqual(time.parseDeadline('monday 08:15'), { day: 0, dayType: 'weekday', hour: 8, minute: 15 })
  assert.deepEqual(time.parseDeadline('21:00'), { day: null, dayType: null, hour: 21, minute: 0 }, 'tanpa hari = setiap hari')
  assert.deepEqual(time.parseDeadline('8:05'), { day: null, dayType: null, hour: 8, minute: 5 })
})

test('parseDeadline: format invalid -> null', () => {
  assert.equal(time.parseDeadline(''), null)
  assert.equal(time.parseDeadline('Jumat'), null)
  assert.equal(time.parseDeadline('Jumat 25:00'), null)
  assert.equal(time.parseDeadline('Jumat 21:99'), null)
  assert.equal(time.parseDeadline('25:00'), null)
  assert.equal(time.parseDeadline('21:99'), null)
  assert.equal(time.parseDeadline('HariX 21:00'), null)
})

test('periodId: Senin = awal minggu (WITA)', () => {
  // Rabu 19 Agu 2026 00:30 UTC = 08:30 WITA -> minggu 17-23 Agu
  assert.equal(time.periodId(new Date('2026-08-19T00:30:00.000Z')), '2026-08-17')
  // Senin 17 Agu 2026 01:00 WITA (17 Agu 2026 17:00 UTC sebelumnya) -> tetap minggu 17
  assert.equal(time.periodId(new Date('2026-08-16T17:00:00.000Z')), '2026-08-17')
})

test('periodLabel mingguan: rentang Senin-Minggu', () => {
  const ws = time.weekStartInstant(new Date('2026-08-19T00:00:00.000Z'))
  const label = time.scheduleState(new Date('2026-08-19T00:00:00.000Z'), { cadence: 'weekly', deadline: 'Jumat 21:00' }).periodLabel
  assert.equal(label, '17 - 23 Agustus 2026')
})

test('dayKey: tanggal lokal WITA (YYYY-MM-DD)', () => {
  // Rabu 19 Agu 2026 00:30 UTC = 08:30 WITA
  assert.equal(time.dayKey(new Date('2026-08-19T00:30:00.000Z')), '2026-08-19')
  // Selasa 18 Agu 2026 16:30 UTC = Rabu 00:30 WITA -> besoknya
  assert.equal(time.dayKey(new Date('2026-08-18T16:30:00.000Z')), '2026-08-19')
})

test('formatDeadline: rapi dari berbagai format', () => {
  assert.equal(time.formatDeadline('sabtu 8:05'), 'Sabtu 08:05')
  assert.equal(time.formatDeadline('Jumat 21:00'), 'Jumat 21:00')
  assert.equal(time.formatDeadline('21:00'), '21:00')
  assert.equal(time.formatDeadline('8:05'), '08:05')
  assert.equal(time.formatDeadline('tidak valid'), 'tidak valid', 'invalid dikembalikan apa adanya')
})

test('parseDeadline: format 1x sebulan "5 11:30" (tanggal + jam)', () => {
  assert.deepEqual(time.parseDeadline('5 11:30'), { day: 5, dayType: 'dom', hour: 11, minute: 30 })
  assert.deepEqual(time.parseDeadline('28 8:05'), { day: 28, dayType: 'dom', hour: 8, minute: 5 })
  assert.equal(time.parseDeadline('0 11:30'), null, 'tgl 0 tidak valid')
  assert.equal(time.parseDeadline('32 11:30'), null, 'tgl 32 tidak valid')
  assert.equal(time.parseDeadline('5 25:00'), null, 'jam 25 tidak valid')
  assert.equal(time.parseDeadline('5 11:99'), null, 'menit 99 tidak valid')
  assert.equal(time.formatDeadline('5 11:30'), 'tgl 5 11:30')
})

test('scheduleState: 1x sebulan -> aktif HANYA di tanggal tenggat, sisa bulan null', () => {
  const s = { cadence: 'monthly', deadline: '5 11:30' }
  const st = time.scheduleState(new Date('2026-08-05T02:00:00.000Z'), s)
  assert.equal(st.periodId, '2026-08')
  assert.equal(st.instant, time.realInstantOf(2026, 8, 5, 11, 30, 0))
  assert.equal(st.periodLabel, '5 Agustus 2026')
  assert.equal(st.deadlineText, 'tgl 5 11:30')
  assert.equal(st.reminderAtInstant, true, 'reminder pas jam tenggat')
  assert.equal(st.hasDailySummary, true, 'dengan summary harian')
  assert.equal(st.hasFinalSummary, false, 'tanpa summary terakhir')
  assert.equal(time.scheduleState(new Date('2026-08-04T02:00:00.000Z'), s), null, 'sehari sebelum = null')
  assert.equal(time.scheduleState(new Date('2026-08-06T02:00:00.000Z'), s), null, 'sehari setelah = null')
  assert.equal(time.scheduleState(new Date('2026-08-20T02:00:00.000Z'), s), null, 'tengah bulan = null')
})

test('nextPeriodInfo: 1x sebulan -> bulan berjalan (sebelum tgl) / bulan depan (sesudah)', () => {
  const s = { cadence: 'monthly', deadline: '5 11:30' }
  assert.equal(time.scheduleState(new Date('2026-08-05T00:00:00.000Z'), s).periodId, '2026-08', 'hari aktif')
  const before = time.nextPeriodInfo(new Date('2026-08-02T00:00:00.000Z'), s)
  assert.equal(before.periodId, '2026-08')
  assert.equal(before.periodLabel, '5 Agustus 2026')
  const after = time.nextPeriodInfo(new Date('2026-08-20T00:00:00.000Z'), s)
  assert.equal(after.periodId, '2026-09')
  assert.equal(after.periodLabel, '5 September 2026')
  const roll = time.nextPeriodInfo(new Date('2026-12-20T00:00:00.000Z'), s)
  assert.equal(roll.periodId, '2027-01', 'rollover tahun')
  assert.equal(roll.periodLabel, '5 Januari 2027')
  assert.equal(time.nextPeriodInfo(new Date('2026-08-05T00:00:00.000Z'), s), null, 'hari aktif = null')
})

test('describeSchedule: label 1x sebulan', () => {
  assert.equal(time.describeSchedule({ cadence: 'monthly', deadline: '5 11:30' }), '1x sebulan · tenggat tgl 5 11:30 WITA')
})

// ================= jadwal per grup =================

test('groupSchedule: default config (tanpa hari = harian) + set/hapus override', () => {
  assert.equal(time.groupSchedule('x@g.us').cadence, 'daily', 'config "21:00" -> harian')
  time.setGroupSchedule('x@g.us', { cadence: 'weekly', deadline: 'Jumat 21:00' })
  assert.deepEqual(time.groupSchedule('x@g.us'), { cadence: 'weekly', deadline: 'Jumat 21:00', summary_time: undefined })
  time.setGroupSchedule('x@g.us', null)
  assert.equal(time.groupSchedule('x@g.us').cadence, 'daily', 'hapus override -> kembali default')
})

test('describeSchedule: teks jadwal', () => {
  assert.equal(time.describeSchedule({ cadence: 'daily', deadline: '21:00' }), 'harian · tenggat 21:00 WITA')
  assert.equal(time.describeSchedule({ cadence: 'weekly', deadline: 'Jumat 21:00' }), 'mingguan · tenggat Jumat 21:00 WITA')
  assert.equal(time.describeSchedule({ cadence: 'semimonthly', deadline: '11:30' }), '2x sebulan (cycle 1-4 & 15-18) · tenggat 11:30 WITA')
})

test('scheduleState: harian (per hari)', () => {
  const now = new Date('2026-08-19T00:00:00.000Z') // Rabu 08:00 WITA
  const st = time.scheduleState(now, { cadence: 'daily', deadline: '21:00' })
  assert.ok(st)
  assert.equal(st.periodId, '2026-08-19')
  assert.equal(st.periodLabel, 'Rabu, 19 Agustus 2026')
  assert.equal(new Date(st.instant).toISOString(), '2026-08-19T13:00:00.000Z') // 21:00 WITA
  assert.equal(new Date(st.periodEnd).toISOString(), '2026-08-19T16:00:00.000Z') // besok 00:00 WITA
  assert.equal(st.deadlineText, '21:00')
  assert.equal(st.reminderAtInstant, false)
})

test('scheduleState: mingguan', () => {
  const now = new Date('2026-08-19T00:00:00.000Z') // dalam minggu 17 Agu (WITA)
  const st = time.scheduleState(now, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  assert.ok(st)
  assert.equal(st.periodId, '2026-08-17')
  // Jumat 21:00 WITA = Jumat 13:00 UTC; akhir periode = Senin 00:00 WITA berikutnya
  assert.equal(new Date(st.instant).toISOString(), '2026-08-21T13:00:00.000Z')
  assert.equal(new Date(st.periodEnd).toISOString(), '2026-08-23T16:00:00.000Z')
})

test('scheduleState: 2xsebulan cycle A (1-4)', () => {
  const now = new Date('2026-08-03T00:00:00.000Z') // Senin 08:00 WITA
  const st = time.scheduleState(now, { cadence: 'semimonthly', deadline: '11:30' })
  assert.ok(st)
  assert.equal(st.periodId, '2026-08-01')
  assert.equal(st.periodLabel, '1 - 4 Agustus 2026')
  assert.equal(new Date(st.instant).toISOString(), '2026-08-03T03:30:00.000Z') // tgl 3 11:30 WITA
  assert.equal(new Date(st.periodEnd).toISOString(), '2026-08-04T16:00:00.000Z') // tgl 5 00:00 WITA
  assert.deepEqual(st.days, ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
  assert.equal(st.hasDailySummary, true)
  assert.equal(st.hasFinalSummary, true)
  assert.equal(st.reminderAtInstant, true, 'reminder pas jam tenggat')
  assert.equal(st.alertDelayMs, 60_000)
})

test('scheduleState: 2xsebulan cycle B (15-18)', () => {
  const now = new Date('2026-08-17T00:00:00.000Z') // Senin 08:00 WITA
  const st = time.scheduleState(now, { cadence: 'semimonthly', deadline: '11:30' })
  assert.ok(st)
  assert.equal(st.periodId, '2026-08-15')
  assert.equal(st.periodLabel, '15 - 18 Agustus 2026')
  assert.equal(new Date(st.instant).toISOString(), '2026-08-17T03:30:00.000Z') // tgl 17 11:30 WITA
  assert.equal(new Date(st.periodEnd).toISOString(), '2026-08-18T16:00:00.000Z') // tgl 19 00:00 WITA
})

test('scheduleState: 2xsebulan di tanggal sela -> null', () => {
  const s = { cadence: 'semimonthly', deadline: '11:30' }
  assert.equal(time.scheduleState(new Date('2026-08-05T00:00:00.000Z'), s), null, 'tgl 5')
  assert.equal(time.scheduleState(new Date('2026-08-10T00:00:00.000Z'), s), null, 'tgl 10')
  assert.equal(time.scheduleState(new Date('2026-08-14T00:00:00.000Z'), s), null, 'tgl 14')
  assert.equal(time.scheduleState(new Date('2026-08-19T00:00:00.000Z'), s), null, 'tgl 19')
})

test('nextPeriodInfo: info periode berikutnya saat gap', () => {
  const s = { cadence: 'semimonthly', deadline: '11:30' }
  // gap tgl 5-14 -> cycle B bulan ini
  const next = time.nextPeriodInfo(new Date('2026-08-10T00:00:00.000Z'), s)
  assert.ok(next)
  assert.equal(next.periodId, '2026-08-15')
  assert.equal(next.periodLabel, '15 - 18 Agustus 2026')
  assert.equal(next.deadlineText, '11:30')
  // gap tgl 19-31 -> cycle A bulan depan
  const next2 = time.nextPeriodInfo(new Date('2026-08-19T00:00:00.000Z'), s)
  assert.equal(next2.periodId, '2026-09-01')
  assert.equal(next2.periodLabel, '1 - 4 September 2026')
  // saat periode berjalan -> null
  assert.equal(time.nextPeriodInfo(new Date('2026-08-03T00:00:00.000Z'), s), null)
})