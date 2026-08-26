import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { makeSock, makeMsg, findSent, textsTo, G1, G2, ADMIN, MEMBER_A, MEMBER_B, cleanup } from './helpers.js'
import { jobs, commands } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { config } from '../src/config.js'

db.load()
const job = (name) => jobs.find((j) => j.name === name)

function ctx(sock) {
  return { db, time, config, sock: () => sock }
}

function runCmd(name, sock, msg) {
  return commands.get(name).run(sock, msg, { db, time, config, commands, sock })
}

function reset() {
  db.clear('reports')
  db.clear('flags')
  db.clear('settings')
  db.clear('names')
  db.set('meta', 'groups', [])
  time.setGroupSchedule(G1, null)
  time.setGroupSchedule(G2, null)
}

function setupSemimonthly(periodId = '2026-09-01') {
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', periodId, { [G1]: {} })
}

test.after(() => cleanup())

// ================= batas presisi =================

test('batas presisi: reminder 2xsebulan hanya [11:30:00, 11:31:00)', async () => {
  reset()
  setupSemimonthly()

  const s1 = makeSock()
  await job('reminder').run(new Date(time.realInstantOf(2026, 9, 3, 11, 29, 59) + 999), ctx(s1))
  assert.equal(s1.sent.length, 0, '11:29:59.999 belum masuk jendela')

  const s2 = makeSock()
  await job('reminder').run(new Date(time.realInstantOf(2026, 9, 3, 11, 30, 0)), ctx(s2))
  assert.equal(textsTo(s2, MEMBER_A).length, 1, '11:30:00.000 = awal jendela, terkirim')
  assert.equal(textsTo(s2, MEMBER_B).length, 1)

  db.clear('flags')
  const s3 = makeSock()
  await job('reminder').run(new Date(time.realInstantOf(2026, 9, 3, 11, 31, 0)), ctx(s3))
  assert.equal(s3.sent.length, 0, '11:31:00.000 = ujung jendela, tidak terkirim')
})

test('batas presisi: alert 2xsebulan mulai 11:31:00, sekali', async () => {
  reset()
  setupSemimonthly()

  const s1 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 3, 11, 30, 59) + 999), ctx(s1))
  assert.equal(s1.sent.length, 0, '11:30:59.999 belum (jendela alert mulai 11:31:00)')

  const s2 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 3, 11, 31, 0)), ctx(s2))
  assert.equal(textsTo(s2, MEMBER_A).length, 1, '11:31:00.000 = awal jendela alert')
  assert.ok(findSent(s2, G1, 'Tenggat Laporan Lewat'), 'recap grup terkirim')

  const s3 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 4, 10, 0, 0)), ctx(s3))
  assert.equal(s3.sent.length, 0, 'tidak terkirim ulang (flag terkunci)')
})

test('batas presisi: summary 17:00 hanya [17:00:00, 17:01:00)', async () => {
  reset()
  setupSemimonthly()

  const s1 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 1, 16, 59, 59) + 999), ctx(s1))
  assert.equal(s1.sent.length, 0, '16:59:59.999 belum')

  const s2 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 1, 17, 0, 0)), ctx(s2))
  assert.ok(findSent(s2, G1, 'Summary Harian'), '17:00:00.000 terkirim')

  db.clear('flags')
  const s3 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 1, 17, 0, 59) + 999), ctx(s3))
  assert.ok(findSent(s3, G1, 'Summary Harian'), '17:00:59.999 masih dalam jendela')

  db.clear('flags')
  const s4 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 1, 17, 1, 0)), ctx(s4))
  assert.equal(s4.sent.length, 0, '17:01:00.000 lewat jendela')
})

test('batas presisi: summary akhir [23:58:00, 24:00:00)', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-09-15', { [G1]: {} })
  db.set('flags', '2026-09-15', { [`${G1}:alert`]: true })

  const s1 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 18, 23, 57, 59) + 999), ctx(s1))
  assert.equal(s1.sent.length, 0, '23:57:59.999 belum (mulai 23:58:00)')

  const s2 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 18, 23, 58, 0)), ctx(s2))
  assert.ok(findSent(s2, G1, 'Summary Terakhir'), '23:58:00.000 terkirim')
  assert.ok(findSent(s2, G1, 'Laporan berikutnya: 1 - 4 Oktober 2026'), 'info jadwal berikutnya')

  db.clear('flags')
  const s3 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 18, 23, 59, 59) + 999), ctx(s3))
  assert.ok(findSent(s3, G1, 'Summary Terakhir'), '23:59:59.999 masih dalam jendela')

  db.clear('flags')
  const s4 = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 19, 0, 0, 0)), ctx(s4))
  assert.equal(s4.sent.length, 0, '00:00:00 = periode berakhir, tidak ada')
})

test('batas presisi: reminder mingguan [20:00, 21:00)', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [G1]: {} })

  const instant = time.realInstantOf(2026, 8, 21, 21, 0, 0)
  const s1 = makeSock()
  await job('reminder').run(new Date(instant - 30 * 60_000), ctx(s1))
  assert.equal(textsTo(s1, MEMBER_A).length, 1, '20:00:00.000 = awal jendela')

  db.clear('flags')
  const s2 = makeSock()
  await job('reminder').run(new Date(instant), ctx(s2))
  assert.equal(s2.sent.length, 0, '21:00:00.000 = ujung jendela, tidak (pas tenggat)')
})

// ================= rollover tahun =================

test('nextPeriodInfo: Desember -> Januari (rollover tahun)', () => {
  const s = { cadence: 'semimonthly', deadline: '11:30' }
  const gapAwal = time.nextPeriodInfo(new Date('2026-12-10T00:00:00.000Z'), s)
  assert.equal(gapAwal.periodId, '2026-12-15', 'gap 5-14 Des -> cycle B bulan sama')
  const gapAkhir = time.nextPeriodInfo(new Date('2026-12-20T00:00:00.000Z'), s)
  assert.equal(gapAkhir.periodId, '2027-01-01', 'gap 19-31 Des -> cycle A Januari tahun depan')
  assert.equal(gapAkhir.periodLabel, '1 - 4 Januari 2027')
})

// ================= peserta & ringkasan =================

test('reminder: semua sudah lapor sebelum tenggat -> tidak kirim & flag tidak dibuat', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-09-01', {
    [G1]: {
      [MEMBER_A]: { name: 'A', text: 'x', time: '2026-09-01T02:00:00.000Z', late: false },
      [MEMBER_B]: { name: 'B', text: 'x', time: '2026-09-01T02:00:00.000Z', late: false },
    },
  })

  const sock = makeSock()
  await job('reminder').run(new Date(time.realInstantOf(2026, 9, 3, 11, 30, 30)), ctx(sock))
  assert.equal(sock.sent.length, 0, 'tidak ada DM sama sekali')
  assert.equal(db.get('flags', '2026-09-01', null), null, 'flag tidak dibuat')
})

test('summary 17:00: semua lapor hari itu -> "Sudah lapor hari ini (2)" dan "Belum lapor (0)"', async () => {
  reset()
  setupSemimonthly()
  db.set('reports', '2026-09-01', {
    [G1]: {
      [MEMBER_A]: { name: 'A', text: 'x', time: '2026-09-01T01:00:00.000Z', late: false },
      [MEMBER_B]: { name: 'B', text: 'x', time: '2026-09-01T02:00:00.000Z', late: false },
    },
  })

  const sock = makeSock()
  await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 1, 17, 0, 30)), ctx(sock))
  const s = findSent(sock, G1, 'Summary Harian')
  assert.ok(s)
  assert.ok(s.content.text.includes('Sudah lapor hari ini (2)'))
  assert.ok(s.content.text.includes('Belum lapor (0)'))
  assert.ok(!s.content.text.includes('❌'), 'tidak ada daftar belum lapor')
})

test('exclude_admins=false: admin ikut daftar belum lapor & dapat DM', async () => {
  reset()
  setupSemimonthly()
  const prev = config.exclude_admins
  config.exclude_admins = false
  try {
    const sock = makeSock()
    await job('reminder').run(new Date(time.realInstantOf(2026, 9, 3, 11, 30, 30)), ctx(sock))
    assert.equal(textsTo(sock, ADMIN).length, 1, 'admin dapat DM reminder')
    assert.equal(textsTo(sock, MEMBER_A).length, 1)

    const sock2 = makeSock()
    await job('deadlineAlert').run(new Date(time.realInstantOf(2026, 9, 3, 11, 31, 30)), ctx(sock2))
    assert.equal(textsTo(sock2, ADMIN).length, 1, 'admin dapat DM alert')
    const recap = findSent(sock2, G1, 'Belum lapor (3)')
    assert.ok(recap, 'recap menghitung admin')
    assert.ok(recap.content.text.includes('6281111111111'), 'nama kosong -> fallback nomor')
  } finally {
    config.exclude_admins = prev
  }
})

// ================= multi-grup =================

test('!check dari DM admin: semua grup terdaftar ditampilkan dengan header', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  time.setGroupSchedule(G2, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1, G2])
  db.set('reports', '2026-08-17', {
    [G1]: { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } },
    [G2]: {},
  })

  const sock = makeSock()
  await runCmd('check', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm@broadcast' }))
  const g1 = findSent(sock, G1, '*Grup: Grup Uji 1*')
  const g2 = findSent(sock, G2, '*Grup: Grup Uji 2*')
  assert.ok(g1, 'pesan untuk G1 dengan header')
  assert.ok(g2, 'pesan untuk G2 dengan header')
  assert.ok(g1.content.text.includes('Sudah lapor (1)'))
  assert.ok(g2.content.text.includes('Belum lapor (1)'))
  assert.ok(g2.content.text.includes('❌ '), 'MEMBER_A tampil di daftar belum G2')
})

test('dua grup jadwal beda (2xsebulan + mingguan) berjalan bersama tanpa saling ganggu', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  time.setGroupSchedule(G2, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1, G2])
  db.set('reports', '2026-09-01', { [G1]: {} })
  db.set('reports', '2026-08-31', { [G2]: {} })

  // Rabu 3 Sep 11:31:30 WITA: alert G1 (cycle A) terkirim, G2 belum (bukan Jumat malam)
  const s1 = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-03T03:31:30.000Z'), ctx(s1))
  assert.ok(findSent(s1, G1, 'Tenggat Laporan Lewat'), 'alert G1 terkirim')
  assert.equal(s1.sent.filter((s) => s.jid === G2).length, 0, 'G2 tidak dapat apa pun')

  // Jumat 4 Sep 21:00:30 WITA: alert G2 terkirim, G1 tidak terkirim ulang
  const s2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-04T13:00:30.000Z'), ctx(s2))
  assert.ok(findSent(s2, G2, 'Tenggat Laporan Lewat'), 'alert G2 terkirim')
  assert.equal(s2.sent.filter((s) => s.jid === G1).length, 0, 'G1 tidak terkirim ulang')
})

test('!lapor dari DM admin: hanya grup terbuka yang menerima', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  time.setGroupSchedule(G2, { cadence: 'daily', deadline: '21:00' })
  db.set('meta', 'groups', [G1, G2])

  const sock = makeSock()
  await runCmd('lapor', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm@broadcast', args: 'Budi' }))
  const reply = findSent(sock, 'dm@broadcast', 'Laporan diterima')
  assert.ok(reply, 'balasan DM')
  assert.ok(reply.content.text.includes('Laporan diterima di 1 grup:'), 'hanya 1 grup menerima')
  const today = time.dayKey(new Date())
  assert.ok(db.get('reports', today, {})[G2][ADMIN], 'tersimpan di G2 (harian)')
  assert.equal(db.get('reports', '2026-08-01', null), null, 'G1 gap tidak menyimpan apa pun')
})

// ================= lapisan waktu & tampilan =================

test('batas presisi: lapor tepat 11:30:00 = sudah lewat tenggat (late)', () => {
  const s = { cadence: 'semimonthly', deadline: '11:30' }
  const instant = time.realInstantOf(2026, 9, 3, 11, 30, 0)
  assert.equal(time.scheduleState(new Date(instant), s).instant, instant)
  assert.equal(time.scheduleState(new Date(instant - 1), s).instant, instant)
})

test('!lapor nama panjang/spesial: tersimpan & tampil utuh di !check', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])

  const sock = makeSock()
  await runCmd('lapor', sock, makeMsg({ sender: MEMBER_A, args: 'Budi 😎 "Si" Santoso - sedang di lapangan' }))
  const stored = db.get('reports', '2026-08-17', {})[G1][MEMBER_A]
  assert.ok(stored, 'laporan tersimpan')
  assert.equal(stored.name, 'Budi 😎 "Si" Santoso')

  const sock2 = makeSock()
  await runCmd('check', sock2, makeMsg({ sender: ADMIN, args: '' }))
  const c = findSent(sock2, G1, 'Cek Laporan')
  assert.ok(c.content.text.includes('Budi 😎 "Si" Santoso'), 'nama utuh di list')
})

test('!check saat gap 2xsebulan: info jadwal berikutnya', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])

  const sock = makeSock()
  await runCmd('check', sock, makeMsg({ sender: ADMIN, args: '' }))
  const c = findSent(sock, G1, 'Cek Laporan')
  assert.ok(c, 'check terkirim')
  assert.ok(c.content.text.includes('Periode belum dibuka'))
  assert.ok(c.content.text.includes('Jadwal berikutnya: 1 - 4 September 2026'), 'next = cycle A September')
})

// ================= ketahanan data =================

test('db: data.json korup -> tidak crash, file ditulis ulang valid', () => {
  db.set('test', 'x', 1)
  const file = process.env.BOT_DATA_FILE
  writeFileSync(file, '{korup!!!', 'utf8')
  db.load()
  assert.equal(db.get('test', 'x', null), 1, 'data lama tidak hilang')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).collections.test.x, 1, 'file valid kembali')
  db.del('test', 'x')
})
// ================= paritas jam summary: semua cadence rantai sama =================

test('getSummaryTime: semimonthly hormati summary_time per-grup, fallback default 17:00', () => {
  assert.equal(time.getSummaryTime({ cadence: 'semimonthly', deadline: '11:30', summary_time: '09:30' }), '09:30')
  assert.equal(time.getSummaryTime({ cadence: 'semimonthly', deadline: '11:30' }), '17:00')
  // cadence lain tidak berubah
  assert.equal(time.getSummaryTime({ cadence: 'daily', deadline: '21:00', summary_time: '08:00' }), '08:00')
})
