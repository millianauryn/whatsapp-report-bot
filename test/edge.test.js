import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, makeMsg, findSent, textsTo, G1, G2, ADMIN, MEMBER_A, MEMBER_B, cleanup } from './helpers.js'
import { jobs, commands } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'

db.load()
const job = (name) => jobs.find((j) => j.name === name)
const runCmd = (name, sock, msg) => commands.get(name).run(sock, msg, { db, time, commands, sock })

// Grup yang tidak ada di meta mock -> groupMetadata melempar error.
const UNKNOWN = '120363429605878799@g.us'

function reset() {
  db.clear('settings')
  db.clear('reports')
  db.clear('flags')
  db.set('meta', 'groups', [])
}

function setSemimonthly(gid) {
  time.setGroupSchedule(gid, { cadence: 'semimonthly', deadline: '11:30' })
}

test.after(() => cleanup())

test('reminder: metadata grup gagal -> grup dilewati, grup lain tetap dapat DM', async () => {
  reset()
  setSemimonthly(G1)
  db.set('meta', 'groups', [UNKNOWN, G1])
  db.set('reports', '2026-08-01', { [G1]: { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } } })

  const sock = makeSock()
  await job('reminder').run(new Date('2026-08-03T03:30:30.000Z'), { db, time, config: {}, sock: () => sock })

  assert.equal(textsTo(sock, MEMBER_B).length, 1, 'G1 tetap dilayani walau UNKNOWN gagal')
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:reminder`], true)
})

test('deadlineAlert: metadata grup gagal -> grup dilewati, grup lain tetap dapat alert', async () => {
  reset()
  setSemimonthly(G1)
  db.set('meta', 'groups', [UNKNOWN, G1])
  db.set('reports', '2026-08-01', { [G1]: { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } } })
  db.set('settings', 'alertEnabled', true)

  const sock = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-03T03:31:30.000Z'), { db, time, sock: () => sock })

  assert.ok(findSent(sock, G1, 'Tenggat Laporan Lewat'), 'recap G1 terkirim')
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:alert`], true)
})

test('Februari 2026 (28 hari): cycle B 15-18 valid, gap 19-28, berikutnya 1 Maret', () => {
  const s = { cadence: 'semimonthly', deadline: '11:30' }

  const st = time.scheduleState(new Date('2026-02-17T05:00:00.000Z'), s)
  assert.equal(st.periodId, '2026-02-15')
  assert.equal(st.instant, time.realInstantOf(2026, 2, 17, 11, 30, 0), 'tenggat 17 Feb 11:30 WITA')

  assert.equal(time.scheduleState(new Date('2026-02-20T00:00:00.000Z'), s), null, '19-28 = gap')

  const next = time.nextPeriodInfo(new Date('2026-02-20T00:00:00.000Z'), s)
  assert.equal(next.periodId, '2026-03-01')
  assert.equal(next.periodLabel, '1 - 4 Maret 2026')
})

test('periodReset: semua grup di gap -> semua data periode lama dibersihkan', () => {
  reset()
  setSemimonthly(G1)
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } } })
  db.set('flags', '2026-08-01', { [`${G1}:alert`]: true })

  const sock = makeSock()
  job('periodReset').run(new Date('2026-08-10T00:00:00.000Z'), { db, time, sock: () => sock })

  assert.deepEqual(db.keys('reports'), [], 'laporan bersih')
  assert.deepEqual(db.keys('flags'), [], 'flag bersih')
})

test('deadlineAlert: dua grup periode sama -> recap per grup, isi laporan tidak bocor', async () => {
  reset()
  setSemimonthly(G1)
  setSemimonthly(G2)
  db.set('meta', 'groups', [G1, G2])
  db.set('reports', '2026-08-01', { [G1]: { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } } })
  db.set('settings', 'alertEnabled', true)

  const sock = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-03T03:31:30.000Z'), { db, time, sock: () => sock })

  const recap1 = findSent(sock, G1, 'Tenggat Laporan Lewat')
  const recap2 = findSent(sock, G2, 'Tenggat Laporan Lewat')
  assert.ok(recap1.content.text.includes('6283333333333'), 'G1: B belum lapor (jid fallback)')
  assert.ok(!recap2.content.text.includes('6283333333333'), 'G2: B bukan anggota, tidak muncul')
  assert.ok(recap2.content.text.includes('6282222222222'), 'G2: A belum lapor di grupnya sendiri')
  assert.equal(textsTo(sock, G1).filter((t) => t.includes('Tenggat Laporan Lewat')).length, 1)
  assert.equal(textsTo(sock, G2).filter((t) => t.includes('Tenggat Laporan Lewat')).length, 1)
})

test('reminder: dua grup periode sama -> DM per grup, flag terpisah', async () => {
  reset()
  setSemimonthly(G1)
  setSemimonthly(G2)
  db.set('meta', 'groups', [G1, G2])
  db.set('reports', '2026-08-01', { [G1]: { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } } })

  const sock = makeSock()
  await job('reminder').run(new Date('2026-08-03T03:30:30.000Z'), { db, time, config: {}, sock: () => sock })

  assert.equal(textsTo(sock, MEMBER_B).length, 1, 'B dapat DM dari G1')
  assert.equal(textsTo(sock, MEMBER_A).length, 1, 'A dapat DM dari G2 saja (sudah lapor di G1)')
  const flags = db.get('flags', '2026-08-01')
  assert.equal(flags[`${G1}:reminder`], true)
  assert.equal(flags[`${G2}:reminder`], true)
})

test('!bantuan dari DM: tetap dibalas', async () => {
  reset()
  const sock = makeSock()
  await runCmd('bantuan', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm@broadcast' }))
  assert.ok(findSent(sock, 'dm@broadcast', '!lapor'), 'bantuan terkirim ke DM')
})

// ponytail: tergantung tanggal nyata hari ini (seperti test !lapor gap yang sudah ada).
test('!lapor di gap: balasan memuat info jadwal berikutnya', async () => {
  reset()
  setSemimonthly(G1)
  db.set('meta', 'groups', [G1])

  const sock = makeSock()
  await runCmd('lapor', sock, makeMsg({ sender: MEMBER_A, args: 'Budi' }))

  const reply = findSent(sock, G1, 'belum dibuka')
  assert.ok(reply, 'lapor ditolak saat gap')
  assert.ok(reply.content.text.includes('Jadwal berikutnya'), 'menampilkan jadwal berikutnya')
  assert.ok(reply.content.text.includes('tenggat 11:30 WITA'), 'tenggat ikut tampil')
})

test('!check dari DM admin saat semua grup gap: tetap menampilkan jadwal berikutnya tiap grup', async () => {
  reset()
  setSemimonthly(G1)
  setSemimonthly(G2)
  db.set('meta', 'groups', [G1, G2])

  const sock = makeSock()
  await runCmd('check', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm@broadcast' }))

  const part1 = findSent(sock, G1, 'Grup Uji 1')
  const part2 = findSent(sock, G2, 'Grup Uji 2')
  assert.ok(part1.content.text.includes('Periode belum dibuka'), 'G1 info gap')
  assert.ok(part1.content.text.includes('Jadwal berikutnya'), 'G1 ada info berikutnya')
  assert.ok(part2.content.text.includes('Periode belum dibuka'), 'G2 info gap')
})

// Gate yang sama dengan index.js onMessage: grup monthly di luar hari aktif = diam total.
test('grup 1x sebulan: di luar hari aktif -> diam total, grup lain normal', async () => {
  reset()
  time.setGroupSchedule(G1, { cadence: 'monthly', deadline: '5 11:30' })
  setSemimonthly(G2)
  db.set('meta', 'groups', [G1, G2])

  // 19 Agustus (bukan tgl 5): grup monthly tidak aktif, semimonthly aktif (gap tetap dilayani).
  assert.equal(time.isGroupActive(G1), false, 'grup monthly di luar tgl 5 = tidak aktif')
  assert.equal(time.isGroupActive(G2), true, 'grup semimonthly selalu aktif')

  // Pada hari aktif (tgl 5): grup monthly aktif kembali.
  assert.equal(time.isGroupActive(G1, new Date('2026-08-05T00:00:00.000Z')), true)
})