import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, findSent, textsTo, G1, G2, MEMBER_A, MEMBER_B, cleanup } from './helpers.js'
import { jobs } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { migrateData } from '../src/migrate.js'
import { config } from '../src/config.js'

db.load()
const job = (name) => jobs.find((j) => j.name === name)
const ctx = (sock) => ({ db, time, config, sock: () => sock })

function reset() {
  db.clear('settings')
  db.clear('reports')
  db.clear('flags')
  db.clear('names')
  db.set('meta', 'groups', [])
}

test.after(() => cleanup())

// ================= matriks: semua cadence x waktu tenggat alternatif =================

const CASES = [
  {
    name: 'harian 08:00', schedule: { cadence: 'daily', deadline: '08:00' },
    date: '2026-08-19T00:30:00.000Z', // 08:30 WITA
    pid: '2026-08-19', instant: '2026-08-19T00:00:00.000Z', text: '08:00',
    label: 'harian · tenggat 08:00 WITA', atInstant: false,
  },
  {
    name: 'mingguan Rabu 20:00', schedule: { cadence: 'weekly', deadline: 'Rabu 20:00' },
    date: '2026-08-19T00:00:00.000Z', // Rabu 08:00 WITA
    pid: '2026-08-17', instant: '2026-08-19T12:00:00.000Z', text: 'Rabu 20:00',
    label: 'mingguan · tenggat Rabu 20:00 WITA', atInstant: false,
  },
  {
    name: '2xsebulan 13:00', schedule: { cadence: 'semimonthly', deadline: '13:00' },
    date: '2026-08-03T02:00:00.000Z', // tgl 3 10:00 WITA (cycle A)
    pid: '2026-08-01', instant: '2026-08-03T05:00:00.000Z', text: '13:00',
    label: '2x sebulan (cycle 1-4 & 15-18) · tenggat 13:00 WITA', atInstant: true,
  },
  {
    name: '1x sebulan 17 08:00', schedule: { cadence: 'monthly', deadline: '17 08:00' },
    date: '2026-08-17T00:00:00.000Z', // tgl 17 08:00 WITA
    pid: '2026-08', instant: '2026-08-17T00:00:00.000Z', text: 'tgl 17 08:00',
    label: '1x sebulan · tenggat tgl 17 08:00 WITA', atInstant: true,
  },
]

test('matriks scheduleState: setiap cadence dengan waktu tenggat alternatif', () => {
  for (const c of CASES) {
    const st = time.scheduleState(new Date(c.date), c.schedule)
    assert.ok(st, `${c.name}: state ada`)
    assert.equal(st.periodId, c.pid, `${c.name}: periodId`)
    assert.equal(new Date(st.instant).toISOString(), c.instant, `${c.name}: instant`)
    assert.equal(st.deadlineText, c.text, `${c.name}: deadlineText`)
    assert.equal(st.reminderAtInstant, c.atInstant, `${c.name}: reminderAtInstant`)
    assert.equal(time.describeSchedule(c.schedule), c.label, `${c.name}: label`)
  }
})

test('matriks nextPeriodInfo: gap tiap cadence (weekly/daily tanpa gap = null)', () => {
  // weekly/daily tidak punya konsep gap -> null
  assert.equal(time.nextPeriodInfo(new Date('2026-08-22T00:00:00.000Z'), { cadence: 'weekly', deadline: 'Rabu 20:00' }), null)
  assert.equal(time.nextPeriodInfo(new Date('2026-08-19T00:00:00.000Z'), { cadence: 'daily', deadline: '08:00' }), null)

  // semimonthly 13:00: gap tgl 10 -> cycle B tgl 17 13:00
  const sm = time.nextPeriodInfo(new Date('2026-08-10T00:00:00.000Z'), { cadence: 'semimonthly', deadline: '13:00' })
  assert.equal(sm.periodId, '2026-08-15')
  assert.equal(sm.periodLabel, '15 - 18 Agustus 2026')
  assert.equal(sm.deadlineText, '13:00')

  // monthly 17 08:00: sebelum tgl 17 -> bulan berjalan; sesudah -> bulan depan
  const before = time.nextPeriodInfo(new Date('2026-08-10T00:00:00.000Z'), { cadence: 'monthly', deadline: '17 08:00' })
  assert.equal(before.periodId, '2026-08')
  assert.equal(before.periodLabel, '17 Agustus 2026')
  const after = time.nextPeriodInfo(new Date('2026-08-20T00:00:00.000Z'), { cadence: 'monthly', deadline: '17 08:00' })
  assert.equal(after.periodId, '2026-09')
  assert.equal(after.periodLabel, '17 September 2026')
})

// ================= waktu alternatif benar-benar menggerakkan job =================

test('2xsebulan 13:00 end-to-end: reminder 13:00 (bukan 11:30), alert 13:01 + recap', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '13:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  // 11:30:30 WITA -> BELUM (tenggat 13:00)
  const early = makeSock()
  await job('reminder').run(new Date('2026-08-03T03:30:30.000Z'), ctx(early))
  assert.equal(early.sent.length, 0, '11:30 belum waktunya')

  // 13:00:00 WITA -> reminder terkirim
  const s1 = makeSock()
  await job('reminder').run(new Date('2026-08-03T05:00:00.000Z'), ctx(s1))
  assert.equal(textsTo(s1, MEMBER_A).length, 1, 'reminder pas 13:00')
  assert.equal(textsTo(s1, MEMBER_B).length, 1)
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:reminder`], true)

  // 13:01:30 WITA -> alert + recap
  const s2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-03T05:01:30.000Z'), ctx(s2))
  assert.ok(findSent(s2, G1, 'Tenggat Laporan Lewat'), 'recap grup')
  assert.ok(textsTo(s2, MEMBER_A)[0].includes('tenggat (13:00 WITA)'), 'DM menyebut tenggat 13:00')
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:alert`], true)
})

// ================= preset koeksistensi: monthly manual + semimonthly otomatis =================

test('preset: grup monthly manual dihormati, grup tanpa jadwal dapat semimonthly', () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'monthly', deadline: '5 11:30' })
  db.set('meta', 'groups', [G1, G2])

  migrateData()

  assert.deepEqual(time.groupSchedule(G1), { cadence: 'monthly', deadline: '5 11:30' }, 'monthly manual tidak ditimpa')
  assert.deepEqual(time.groupSchedule(G2), { cadence: 'semimonthly', deadline: '11:30' }, 'grup baru dapat preset 2xsebulan')

  time.setGroupSchedule(G1, null)
  time.setGroupSchedule(G2, null)
})

// ================= flow job daily & weekly (reminder N menit sebelum, alert tepat tenggat) =================

test('harian 21:00: reminder [20:00,21:00), alert TEPAT 21:00 + recap, sekali', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'daily', deadline: '21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-19', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  // 19:59:59.999 WITA -> reminder belum (window [20:00, 21:00))
  const early = makeSock()
  await job('reminder').run(new Date('2026-08-19T11:59:59.000Z'), ctx(early))
  assert.equal(early.sent.length, 0, '19:59 belum waktunya')

  // 20:00:00.000 WITA -> reminder terkirim
  const s1 = makeSock()
  await job('reminder').run(new Date('2026-08-19T12:00:00.000Z'), ctx(s1))
  assert.equal(textsTo(s1, MEMBER_A).length, 1, 'reminder 20:00 (60 mnt sebelum)')
  assert.equal(textsTo(s1, MEMBER_B).length, 1)
  assert.equal(db.get('flags', '2026-08-19')[`${G1}:reminder`], true)

  // 21:00:00.000 WITA -> reminder TIDAK lagi (window berakhir tepat tenggat)
  const s1b = makeSock()
  await job('reminder').run(new Date('2026-08-19T13:00:00.000Z'), ctx(s1b))
  assert.equal(s1b.sent.length, 0, 'reminder tidak dikirim ulang pas tenggat')

  // 20:59:30 WITA -> alert belum (mulai tepat tenggat)
  const before = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-19T12:59:30.000Z'), ctx(before))
  assert.equal(before.sent.length, 0, 'alert belum sebelum 21:00')

  // 21:00:00.000 WITA -> alert TEPAT tenggat + recap
  const s2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-19T13:00:00.000Z'), ctx(s2))
  assert.equal(textsTo(s2, MEMBER_A).length, 1, 'alert DM tepat 21:00')
  assert.ok(findSent(s2, G1, 'Tenggat Laporan Lewat'), 'recap grup')
  assert.equal(db.get('flags', '2026-08-19')[`${G1}:alert`], true)

  // sekali saja
  const s3 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-19T13:30:00.000Z'), ctx(s3))
  assert.equal(s3.sent.length, 0, 'tidak kirim ulang')
})

test('mingguan Jumat 21:00: reminder [20:00,21:00), alert tepat tenggat + recap', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  // Jumat 21:00 WITA = 2026-08-21T13:00:00Z; reminder window [12:00:00Z, 13:00:00Z)
  const early = makeSock()
  await job('reminder').run(new Date('2026-08-21T11:59:59.000Z'), ctx(early))
  assert.equal(early.sent.length, 0, '19:59 belum waktunya')

  const s1 = makeSock()
  await job('reminder').run(new Date('2026-08-21T12:00:00.000Z'), ctx(s1))
  assert.equal(textsTo(s1, MEMBER_A).length, 1, 'reminder 20:00')
  assert.equal(db.get('flags', '2026-08-17')[`${G1}:reminder`], true)

  const s1b = makeSock()
  await job('reminder').run(new Date('2026-08-21T13:00:00.000Z'), ctx(s1b))
  assert.equal(s1b.sent.length, 0, 'reminder berakhir tepat tenggat')

  const before = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-21T12:59:30.000Z'), ctx(before))
  assert.equal(before.sent.length, 0, 'alert belum sebelum 21:00')

  const s2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-21T13:00:00.000Z'), ctx(s2))
  assert.equal(textsTo(s2, MEMBER_A).length, 1, 'alert DM tepat 21:00')
  assert.ok(findSent(s2, G1, 'Tenggat Laporan Lewat'), 'recap grup')
  assert.equal(db.get('flags', '2026-08-17')[`${G1}:alert`], true)
})