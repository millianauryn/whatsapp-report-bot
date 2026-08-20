import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, findSent, textsTo, G1, G2, MEMBER_A, MEMBER_B, cleanup } from './helpers.js'
import { jobs } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { config } from '../src/config.js'

db.load()
const job = (name) => jobs.find((j) => j.name === name)

function ctx(sock) {
  return { db, time, config, sock: () => sock }
}

function setSchedule(gid, schedule) {
  time.setGroupSchedule(gid, schedule)
}

// ================= reminder =================

test('reminder: mingguan, DM ke yang belum lapor saja, sekali', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [G1]: { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } } })

  // Rabu 19 Agu 2026 (dalam minggu 17 Agu); Jumat 21:00 WITA = 13:00Z; reminder -30 mnt
  const now = new Date('2026-08-21T12:30:00.000Z')
  await job('reminder').run(now, ctx(sock))
  const dms = textsTo(sock, MEMBER_B)
  assert.equal(dms.length, 1, 'satu DM ke yang belum lapor')
  assert.ok(dms[0].includes('Pengingat Laporan'))
  assert.equal(textsTo(sock, MEMBER_A).length, 0, 'yang sudah lapor tidak di-DM')
  assert.equal(db.get('flags', '2026-08-17')[`${G1}:reminder`], true, 'flag terkunci')

  await job('reminder').run(now, ctx(makeSock()))
  assert.equal(db.get('flags', '2026-08-17')[`${G1}:reminder`], true, 'tidak kirim ulang')
})

test('reminder: harian -> tiap hari, periode berbeda', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'daily', deadline: '21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-19', { [G1]: { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } } })

  const inWindow1 = new Date('2026-08-19T12:30:00.000Z') // 20:30 WITA, 30 mnt sebelum 21:00
  await job('reminder').run(inWindow1, ctx(sock))
  assert.equal(textsTo(sock, MEMBER_B).length, 1, 'DM hari Rabu terkirim')
  assert.equal(db.get('flags', '2026-08-19')[`${G1}:reminder`], true)

  await job('reminder').run(inWindow1, ctx(makeSock()))
  assert.equal(db.get('flags', '2026-08-19')[`${G1}:reminder`], true, '1x per hari')

  db.set('reports', '2026-08-20', { [G1]: {} })
  const inWindow2 = new Date('2026-08-20T12:30:00.000Z') // Kamis 20:30 WITA
  const sock2 = makeSock()
  await job('reminder').run(inWindow2, ctx(sock2))
  assert.equal(textsTo(sock2, MEMBER_B).length, 1, 'DM hari Kamis terkirim lagi (periode baru)')
  assert.equal(db.get('flags', '2026-08-20')[`${G1}:reminder`], true)
})

test('reminder: 2xsebulan -> PERSIS jam tenggat (11:30), alert menyusul kemudian', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } } })

  // Sebelum tenggat -> belum ada DM
  await job('reminder').run(new Date('2026-08-03T03:29:30.000Z'), ctx(makeSock()))
  assert.equal(textsTo(makeSock(), MEMBER_B).length, 0, 'belum waktunya')

  // 11:30 WITA (03:30Z) -> reminder terkirim
  const sock2 = makeSock()
  await job('reminder').run(new Date('2026-08-03T03:30:30.000Z'), ctx(sock2))
  assert.equal(textsTo(sock2, MEMBER_B).length, 1, 'reminder pas jam tenggat')
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:reminder`], true)

  // Setelah jendela (11:31 WITA) -> tidak kirim ulang
  await job('reminder').run(new Date('2026-08-03T03:31:30.000Z'), ctx(makeSock()))
  assert.equal(textsTo(makeSock(), MEMBER_B).length, 0)
})

test('reminder: di luar jendela (mingguan) -> tidak kirim', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [G1]: {} })

  const st = time.scheduleState(new Date('2026-08-19T00:00:00.000Z'), time.groupSchedule(G1))
  await job('reminder').run(new Date(st.instant - 120 * 60_000), ctx(sock)) // terlalu awal
  assert.equal(textsTo(sock, MEMBER_B).length, 0)
  await job('reminder').run(new Date(st.instant + 60_000), ctx(sock)) // sudah lewat
  assert.equal(textsTo(sock, MEMBER_B).length, 0)
})

// ================= deadlineAlert =================

test('deadlineAlert: mingguan -> DM + recap grup, HANYA sekali', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [G1]: { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } } })
  db.set('settings', 'alertEnabled', true)

  const after = new Date('2026-08-21T13:00:30.000Z') // 21:00:30 WITA
  await job('deadlineAlert').run(after, ctx(sock))
  assert.equal(textsTo(sock, MEMBER_B).length, 1, 'DM alert ke yang belum lapor')
  assert.ok(textsTo(sock, MEMBER_B)[0].includes('Tenggat Laporan Sudah Lewat'))
  const recap = findSent(sock, G1, 'Tenggat Laporan Lewat')
  assert.ok(recap, 'recap grup terkirim')
  assert.ok(recap.content.text.includes('✅') && recap.content.text.includes('❌'))
  assert.ok(recap.content.text.includes('Jadwal: mingguan · tenggat Jumat 21:00'), 'jadwal tampil, bukan undefined')
  assert.equal(db.get('flags', '2026-08-17')[`${G1}:alert`], true)

  await job('deadlineAlert').run(after, ctx(makeSock()))
  assert.equal(textsTo(makeSock(), MEMBER_B).length, 0, 'tidak ada kirim ulang')
})

test('deadlineAlert: 2xsebulan -> alert menyusul 1 mnt setelah reminder', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } } })
  db.set('settings', 'alertEnabled', true)

  // 11:30:30 WITA -> masih dalam jeda reminder, alert BELUM
  await job('deadlineAlert').run(new Date('2026-08-03T03:30:30.000Z'), ctx(sock))
  assert.equal(textsTo(sock, MEMBER_B).length, 0, 'alert belum, menunggu jeda 1 menit')

  // 11:31:30 WITA -> alert terkirim
  await job('deadlineAlert').run(new Date('2026-08-03T03:31:30.000Z'), ctx(sock))
  assert.equal(textsTo(sock, MEMBER_B).length, 1, 'DM alert ke yang belum lapor')
  assert.ok(findSent(sock, G1, 'Tenggat Laporan Lewat'), 'recap grup terkirim')
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:alert`], true)

  await job('deadlineAlert').run(new Date('2026-08-03T03:32:00.000Z'), ctx(makeSock()))
  assert.equal(textsTo(makeSock(), MEMBER_B).length, 0, 'tidak ada kirim ulang')
})

test('deadlineAlert: 2xsebulan -> summary harian 17:00 = check per hari, sekali saja', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-15', { [G1]: { [MEMBER_A]: { name: 'A', text: 'x', time: '2026-08-15T03:00:00.000Z', late: false } } })
  db.set('settings', 'alertEnabled', true)

  // Hari ke-2 cycle, lewat 17:01 (17:04 WITA) -> TIDAK terkirim (window pas 17:00 saja)
  const early = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-16T09:04:00.000Z'), ctx(early))
  assert.ok(!findSent(early, G1, 'Summary Harian'), 'lewat 17:00 tidak terkirim')

  // 17:00:30 WITA tgl 17 — A lapor tgl 15 (hari lain) -> tidak muncul di "hari ini"
  await job('deadlineAlert').run(new Date('2026-08-17T09:00:30.000Z'), ctx(sock))
  const summary = findSent(sock, G1, 'Summary Harian')
  assert.ok(summary, 'summary harian terkirim')
  assert.ok(summary.content.text.includes('Sudah lapor hari ini (0)'), 'hanya laporan HARI ITU')
  assert.ok(!summary.content.text.includes('✅ A'), 'lapor tgl 15 tidak muncul di summary tgl 17')
  assert.ok(summary.content.text.includes('❌'), 'list belum lapor ada')
  assert.equal(summary.content.mentions, undefined, 'summary tanpa mention')
  assert.equal(textsTo(sock, MEMBER_B).length, 0, 'summary bukan DM')
  assert.equal(db.get('flags', '2026-08-15')[`${G1}:summary:2026-08-17`], true)

  // Sama hari -> tidak dobel
  await job('deadlineAlert').run(new Date('2026-08-17T09:04:00.000Z'), ctx(makeSock()))
  assert.ok(!findSent(makeSock(), G1, 'Summary Harian'), 'tidak kirim ulang hari yang sama')

  // Hari berikutnya: A lapor HARI ITU (tgl 18 08:30 WITA) -> muncul di "hari ini"
  const r2 = db.get('reports', '2026-08-15', {})
  r2[G1][MEMBER_A].time = '2026-08-18T00:30:00.000Z'
  db.set('reports', '2026-08-15', r2)
  const sock2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-18T09:00:30.000Z'), ctx(sock2))
  const summary2 = findSent(sock2, G1, 'Summary Harian')
  assert.ok(summary2, 'summary hari berikutnya terkirim')
  assert.ok(summary2.content.text.includes('Sudah lapor hari ini (1)'))
  assert.ok(summary2.content.text.includes('✅ A'), 'lapor hari itu muncul')
})

test('deadlineAlert: hari tenggat -> alert 11:31 DAN summary 17:00 sama-sama terkirim', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  // 11:31:30 WITA tgl 3: alert jalan
  await job('deadlineAlert').run(new Date('2026-08-03T03:31:30.000Z'), ctx(sock))
  assert.ok(findSent(sock, G1, 'Tenggat Laporan Lewat'), 'alert terkirim di hari tenggat')
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:alert`], true)

  // 17:00:30 WITA tgl 3: summary tetap jalan walau alert sudah terjadi hari itu
  const s2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-03T09:00:30.000Z'), ctx(s2))
  assert.ok(findSent(s2, G1, 'Summary Harian'), 'summary tetap terkirim setelah alert di hari yang sama')
  assert.equal(db.get('flags', '2026-08-01')[`${G1}:summary:2026-08-03`], true)
})

test('deadlineAlert: hari terakhir -> summary 17:00 DAN summary terakhir 23:58 sama-sama terkirim', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  // 17:00:30 WITA tgl 4: summary harian
  await job('deadlineAlert').run(new Date('2026-08-04T09:00:30.000Z'), ctx(sock))
  assert.ok(findSent(sock, G1, 'Summary Harian'), 'summary harian tgl 4 terkirim')

  // 23:58:30 WITA tgl 4: summary terakhir tetap jalan
  const s2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-04T15:58:30.000Z'), ctx(s2))
  assert.ok(findSent(s2, G1, 'Summary Terakhir'), 'summary terakhir terkirim di hari yang sama')
  const flags = db.get('flags', '2026-08-01')
  assert.equal(flags[`${G1}:summary:2026-08-04`], true)
  assert.equal(flags[`${G1}:final`], true)
})

test('deadlineAlert: 2xsebulan -> summary terakhir 23:58 + info berikutnya', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-15', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  // 23:58:30 WITA tgl 18 (= 15:58:30Z), periode berakhir tgl 19 00:00 WITA
  await job('deadlineAlert').run(new Date('2026-08-18T15:58:30.000Z'), ctx(sock))
  const final = findSent(sock, G1, 'Summary Terakhir')
  assert.ok(final, 'summary terakhir terkirim')
  assert.ok(final.content.text.includes('24:00 WITA'), 'menyebut akhir periode')
  assert.ok(final.content.text.includes('Laporan berikutnya'), 'info jadwal berikutnya')
  assert.equal(db.get('flags', '2026-08-15')[`${G1}:final`], true)

  await job('deadlineAlert').run(new Date('2026-08-18T15:59:30.000Z'), ctx(makeSock()))
  assert.ok(!findSent(makeSock(), G1, 'Summary Terakhir'), 'tidak dobel')
})

test('deadlineAlert: alertEnabled false -> tidak kirim apa pun', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-15', { [G1]: {} })
  db.set('settings', 'alertEnabled', false)

  await job('deadlineAlert').run(new Date('2026-08-17T03:31:30.000Z'), ctx(sock))
  assert.equal(sock.sent.length, 0, 'tidak ada DM maupun recap')
  assert.equal(db.get('flags', '2026-08-15', null), null, 'flag tidak dibuat')
})

test('deadlineAlert: teks DM custom dipakai + variabel diganti', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)
  db.set('settings', 'alertDmText', 'Halo{nama}, periode {periode} belum lapor! Tenggat {tenggat} WITA.')

  await job('deadlineAlert').run(new Date('2026-08-21T13:00:30.000Z'), ctx(sock))
  const dm = textsTo(sock, MEMBER_B)[0]
  assert.ok(dm.includes('Halo'), 'nama kosong -> {nama} dibersihkan')
  assert.ok(!dm.includes('{periode}'), 'variabel periode diganti')
  assert.ok(!dm.includes('{tenggat}'), 'variabel tenggat diganti')
  db.del('settings', 'alertDmText')
})

test('deadlineAlert: recap tidak menyertakan admin/bot di list', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  await job('deadlineAlert').run(new Date('2026-08-21T13:00:30.000Z'), ctx(sock))
  const recap = findSent(sock, G1, 'Tenggat Laporan Lewat')
  assert.ok(!recap.content.text.includes('6281111111111'), 'admin tidak muncul')
  assert.ok(recap.content.text.includes('Belum lapor (2)'), 'dua anggota biasa yang belum')
})

// ================= periodReset =================

test('periodReset: laporan & flag periode lama dibersihkan, periode aktif dipertahankan', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  setSchedule(G2, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  db.set('meta', 'groups', [G1, G2])
  db.set('reports', '2026-08-10', { [G1]: { x: { name: 'lama', text: '', time: '', late: false } } })
  db.set('reports', '2026-08-17', {
    [G1]: { x: { name: 'baru', text: '', time: '', late: false } },
    [G2]: { y: { name: 'yg2', text: '', time: '', late: false } },
  })
  db.set('flags', '2026-08-10', { [`${G1}:reminder`]: true })
  db.set('flags', '2026-08-17', { [`${G1}:alert`]: true, [`${G2}:alert`]: true })

  const now = new Date('2026-08-19T00:00:00.000Z') // minggu aktif 17 Agu
  await job('periodReset').run(now, ctx(sock))

  assert.equal(db.get('reports', '2026-08-10', null), null, 'periode lama dihapus')
  assert.equal(db.get('flags', '2026-08-10', null), null, 'flag periode lama dihapus')
  assert.ok(db.get('reports', '2026-08-17', {})[G1], 'periode aktif G1 utuh')
  assert.ok(db.get('reports', '2026-08-17', {})[G2], 'periode aktif G2 utuh')
  assert.ok(db.get('flags', '2026-08-17', {})[`${G1}:alert`], 'flag G1 aktif utuh')
  assert.ok(db.get('flags', '2026-08-17', {})[`${G2}:alert`], 'flag G2 aktif utuh')
})

test('periodReset: 2xsebulan di gap -> data cycle yang sudah lewat dibersihkan', async () => {
  const sock = makeSock()
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: { x: { name: 'cycle A', text: '', time: '', late: false } } })
  db.set('flags', '2026-08-01', { [`${G1}:alert`]: true })

  const now = new Date('2026-08-10T00:00:00.000Z') // gap tgl 10
  await job('periodReset').run(now, ctx(sock))
  assert.equal(db.get('reports', '2026-08-01', null), null, 'cycle A dihapus saat gap')
  assert.equal(db.get('flags', '2026-08-01', null), null)
})

// ================= siklus penuh 2xsebulan (September 2026, format cycle tetap 1-4 & 15-18) =================

test('2xsebulan: siklus penuh September 2026 - cycle A & B, gap diam total', async () => {
  const sock = makeSock()
  db.clear('flags')
  db.clear('reports')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('settings', 'alertEnabled', true)
  const A = '2026-09-01' // periode cycle A
  const B = '2026-09-15' // periode cycle B

  // ===== CYCLE A (1-4 September) =====
  // tgl 1 17:00:30 WITA (09:00:30Z) -> summary, belum ada yang lapor
  await job('deadlineAlert').run(new Date('2026-09-01T09:00:30.000Z'), ctx(sock))
  let m = findSent(sock, G1, 'Summary Harian')
  assert.ok(m, 'summary tgl 1 terkirim')
  assert.ok(m.content.text.includes('Sudah lapor hari ini (0)'))
  assert.equal(db.get('flags', A)[`${G1}:summary:2026-09-01`], true, 'flag summary tgl 1')

  // tgl 2: MEMBER_A lapor (10:00 WITA) -> summary 17:00 menampilkan "hari ini"
  db.set('reports', A, { [G1]: { [MEMBER_A]: { name: 'A', text: '', time: '2026-09-02T02:00:00.000Z', late: false } } })
  const sDay2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-02T09:00:30.000Z'), ctx(sDay2))
  m = findSent(sDay2, G1, 'Summary Harian')
  assert.ok(m, 'summary tgl 2 terkirim')
  assert.ok(m.content.text.includes('Sudah lapor hari ini (1)'), 'A lapor hari itu muncul')
  assert.ok(m.content.text.includes('✅ A'))
  assert.ok(m.content.text.includes('Belum lapor (1)'), 'MEMBER_B belum')
  assert.equal(m.content.mentions, undefined, 'summary tanpa mention')

  // tgl 3 11:30:30 WITA -> reminder PERSIS jam tenggat, 1x, hanya yang belum
  const sRem = makeSock()
  await job('reminder').run(new Date('2026-09-03T03:30:30.000Z'), ctx(sRem))
  assert.equal(textsTo(sRem, MEMBER_B).length, 1, 'reminder ke yang belum saja')
  assert.equal(textsTo(sRem, MEMBER_A).length, 0, 'yang sudah lapor tidak di-DM')
  assert.equal(db.get('flags', A)[`${G1}:reminder`], true, 'reminder 1x')

  // tgl 3 11:31:30 -> alert tenggat lewat, DM + recap grup, 1x
  const sAlert = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-03T03:31:30.000Z'), ctx(sAlert))
  assert.equal(textsTo(sAlert, MEMBER_B).length, 1, 'alert DM ke yang belum')
  assert.ok(findSent(sAlert, G1, 'Tenggat Laporan Lewat'), 'recap grup terkirim')
  assert.equal(db.get('flags', A)[`${G1}:alert`], true, 'alert 1x')

  // tgl 3 17:00:30 -> summary; A lapor tgl 2 (bukan hari ini) -> tidak muncul
  const sDay3 = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-03T09:00:30.000Z'), ctx(sDay3))
  m = findSent(sDay3, G1, 'Summary Harian')
  assert.ok(m, 'summary tgl 3 terkirim')
  assert.ok(m.content.text.includes('Sudah lapor hari ini (0)'), 'lapor tgl 2 bukan hari ini')
  assert.ok(!m.content.text.includes('✅ A'))

  // tgl 4 23:58:30 -> summary terakhir + info berikutnya (cycle B)
  const sFinal = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-04T15:58:30.000Z'), ctx(sFinal))
  m = findSent(sFinal, G1, 'Summary Terakhir')
  assert.ok(m, 'summary terakhir cycle A terkirim')
  assert.ok(m.content.text.includes('Laporan berikutnya'), 'info jadwal berikutnya ada')
  assert.ok(m.content.text.includes('15 - 18 September 2026'), 'berikutnya = cycle B')
  assert.equal(db.get('flags', A)[`${G1}:final`], true, 'final 1x')

  // tgl 5 00:00:00 -> reset: semua laporan & flag cycle A dibersihkan
  await job('periodReset').run(new Date('2026-09-04T16:00:00.000Z'), ctx(sock))
  assert.equal(db.get('reports', A, null), null, 'laporan cycle A direset (dicentang dibersihkan)')
  assert.equal(db.get('flags', A, null), null, 'flag cycle A direset')

  // ===== GAP 5-14: bot diam total =====
  const sGap = makeSock()
  await job('reminder').run(new Date('2026-09-10T04:00:00.000Z'), ctx(sGap))
  await job('deadlineAlert').run(new Date('2026-09-10T09:00:30.000Z'), ctx(sGap))
  assert.equal(sGap.sent.length, 0, 'gap: tidak ada DM/recap/summary sama sekali')

  // ===== CYCLE B (15-18 September) =====
  const sB0 = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-15T09:00:30.000Z'), ctx(sB0))
  m = findSent(sB0, G1, 'Summary Harian')
  assert.ok(m, 'summary tgl 15 terkirim')
  assert.ok(m.content.text.includes('Sudah lapor hari ini (0)'), 'cycle B mulai dari nol')
  assert.equal(db.get('flags', B)[`${G1}:summary:2026-09-15`], true)

  // tgl 17: reminder 11:30 1x, alert 11:31 1x
  const sB1 = makeSock()
  await job('reminder').run(new Date('2026-09-17T03:30:30.000Z'), ctx(sB1))
  assert.equal(textsTo(sB1, MEMBER_A).length, 1, 'reminder cycle B ke A (belum lapor)')
  assert.equal(textsTo(sB1, MEMBER_B).length, 1, 'reminder cycle B ke B')
  assert.equal(db.get('flags', B)[`${G1}:reminder`], true, 'reminder cycle B 1x')
  const sB2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-17T03:31:30.000Z'), ctx(sB2))
  assert.equal(textsTo(sB2, MEMBER_A).length, 1, 'alert cycle B')
  assert.ok(findSent(sB2, G1, 'Tenggat Laporan Lewat'), 'recap cycle B')
  assert.equal(db.get('flags', B)[`${G1}:alert`], true, 'alert cycle B 1x')

  // tgl 18 23:58:30 -> summary terakhir cycle B + berikutnya (cycle A Oktober)
  const sFinalB = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-18T15:58:30.000Z'), ctx(sFinalB))
  m = findSent(sFinalB, G1, 'Summary Terakhir')
  assert.ok(m, 'summary terakhir cycle B terkirim')
  assert.ok(m.content.text.includes('1 - 4 Oktober 2026'), 'berikutnya = cycle A Oktober')

  // tgl 19 00:00 -> reset cycle B
  await job('periodReset').run(new Date('2026-09-18T16:00:00.000Z'), ctx(sock))
  assert.equal(db.get('reports', B, null), null, 'laporan cycle B direset')
  assert.equal(db.get('flags', B, null), null)

  // ===== GAP 19-30: diam total =====
  const sGap2 = makeSock()
  await job('reminder').run(new Date('2026-09-25T04:00:00.000Z'), ctx(sGap2))
  await job('deadlineAlert').run(new Date('2026-09-25T09:00:30.000Z'), ctx(sGap2))
  assert.equal(sGap2.sent.length, 0, 'gap akhir bulan: tidak ada kiriman apa pun')
})

test('deadlineAlert 2xsebulan: komen recap lengkap + DM alert ke SEMUA yang belum lapor', async () => {
  const sock = makeSock()
  db.clear('flags')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)
  db.set('names', MEMBER_A, 'Anggota A')

  await job('deadlineAlert').run(new Date('2026-08-03T03:31:30.000Z'), ctx(sock))

  const dmA = textsTo(sock, MEMBER_A)[0]
  const dmB = textsTo(sock, MEMBER_B)[0]
  assert.ok(dmA.includes('Halo Anggota A'), 'nama tersimpan disubstitusi ke {nama}')
  assert.ok(dmA.includes('Tenggat Laporan Sudah Lewat - 1 - 4 Agustus 2026'), 'header DM berisi periode')
  assert.ok(dmA.includes('tenggat (11:30 WITA)'), 'tenggat di DM')
  assert.ok(dmA.includes('!lapor'), 'format lapor di DM')
  assert.ok(dmB.includes('Halo,'), 'nama kosong -> {nama} dibersihkan')
  assert.ok(!dmB.includes('undefined'), 'bukan undefined')

  const recap = findSent(sock, G1, 'Tenggat Laporan Lewat')
  assert.ok(recap, 'komen recap grup terkirim')
  const text = recap.content.text
  assert.ok(text.includes('Jadwal: 2x sebulan (cycle 1-4 & 15-18) · tenggat 11:30 WITA'), 'komen menampilkan jadwal')
  assert.ok(text.includes('Tenggat: 11:30 WITA'), 'komen menampilkan tenggat')
  assert.ok(text.includes('Sudah lapor (0):'), 'komen: belum ada yang lapor')
  assert.ok(text.includes('Belum lapor (2):'), 'komen: dua orang belum lapor')
  assert.ok(text.includes('DM pengingat sudah dikirim ke yang belum lapor.'), 'komen info DM terkirim')
  assert.ok(recap.content.mentions.includes(MEMBER_A) && recap.content.mentions.includes(MEMBER_B), 'komen mention yang belum lapor')
})

test('reminder: DM pengingat CUMA tgl 3 & 17 pas 11:30, bukan hari lain', async () => {
  db.clear('flags')
  setSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-01', { [G1]: {} })

  const at = (d, h = 11, m = 30, s = 0) => new Date(time.realInstantOf(2026, 8, d, h, m, s))

  const s3 = makeSock()
  await job('reminder').run(at(3), ctx(s3))
  assert.equal(s3.sent.length, 2, 'tgl 3 PAS 11:30:00: DM ke semua yang belum')

  db.clear('flags')
  const s17 = makeSock()
  await job('reminder').run(at(17), ctx(s17))
  assert.equal(s17.sent.length, 2, 'tgl 17 PAS 11:30:00: DM ke semua yang belum')

  for (const d of [2, 4, 16, 18]) {
    db.clear('flags')
    const s = makeSock()
    await job('reminder').run(at(d), ctx(s))
    assert.equal(s.sent.length, 0, `tgl ${d} 11:30: tidak ada DM`)
  }
})

test('1x sebulan: hari aktif tgl 5 -> reminder pas 11:30, alert 11:31 + recap, TANPA summary', async () => {
  db.clear('flags')
  setSchedule(G1, { cadence: 'monthly', deadline: '5 11:30' })
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08', { [G1]: {} })
  db.set('settings', 'alertEnabled', true)

  // 11:30:30 WITA tgl 5: reminder pas tenggat
  const s1 = makeSock()
  await job('reminder').run(new Date('2026-08-05T03:30:30.000Z'), ctx(s1))
  assert.equal(textsTo(s1, MEMBER_A).length, 1, 'reminder tgl 5 ke yang belum')
  assert.equal(textsTo(s1, MEMBER_B).length, 1)
  assert.equal(db.get('flags', '2026-08')[`${G1}:reminder`], true)

  // 11:31:30: alert + recap
  const s2 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-05T03:31:30.000Z'), ctx(s2))
  assert.equal(textsTo(s2, MEMBER_A).length, 1, 'alert DM tgl 5')
  assert.ok(findSent(s2, G1, 'Tenggat Laporan Lewat'), 'recap grup terkirim')
  assert.equal(db.get('flags', '2026-08')[`${G1}:alert`], true)

  // 17:00: TANPA summary harian (1 hari saja)
  const s3 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-05T09:00:30.000Z'), ctx(s3))
  assert.ok(!findSent(s3, G1, 'Summary Harian'), 'tanpa summary 17:00')

  // 23:58: tanpa summary terakhir
  const s4 = makeSock()
  await job('deadlineAlert').run(new Date('2026-08-05T15:58:30.000Z'), ctx(s4))
  assert.ok(!findSent(s4, G1, 'Summary Terakhir'), 'tanpa summary akhir')

  // Sehari setelahnya (tgl 6): diam total, semua job tanpa kiriman
  const s5 = makeSock()
  await job('reminder').run(new Date('2026-08-06T03:30:30.000Z'), ctx(s5))
  await job('deadlineAlert').run(new Date('2026-08-06T09:00:30.000Z'), ctx(s5))
  assert.equal(s5.sent.length, 0, 'tgl 6: tidak ada kiriman apa pun')
})