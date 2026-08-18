import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, findSent, textsTo, G1, MEMBER_A, MEMBER_B, cleanup } from './helpers.js'
import { loadJobs } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { config } from '../src/config.js'

db.load()
const jobs = await loadJobs()
const job = (name) => jobs.find((j) => j.name === name)

function ctx(sock) {
  return { db, time, config, sock: () => sock }
}

// Anchor: Rabu 19 Agu 2026 00:00 UTC = 08:00 WITA -> minggu 17-23 Agu 2026.
const ANCHOR = new Date('2026-08-19T00:00:00.000Z')

test.after(() => cleanup())

// ================= reminder =================

test('reminder: dalam jendela -> DM ke yang belum lapor saja, sekali', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } })
  db.set('flags', '2026-08-17', {})

  const st = time.deadlineState(ANCHOR, 'Jumat 21:00')
  const inWindow = new Date(st.instant - 30 * 60_000)

  await job('reminder').run(inWindow, ctx(sock))
  const dms = textsTo(sock, MEMBER_B)
  assert.equal(dms.length, 1, 'satu DM ke yang belum lapor')
  assert.ok(dms[0].includes('Pengingat Laporan'))
  assert.equal(textsTo(sock, MEMBER_A).length, 0, 'yang sudah lapor tidak di-DM')
  assert.equal(db.get('flags', '2026-08-17').reminderSent, true, 'flag terkunci')

  await job('reminder').run(inWindow, ctx(makeSock()))
  assert.equal(db.get('flags', '2026-08-17').reminderSent, true, 'tidak kirim ulang (flag)')
})

test('reminder: di luar jendela -> tidak kirim', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', {})
  db.set('flags', '2026-08-17', {})

  const st = time.deadlineState(ANCHOR, 'Jumat 21:00')
  await job('reminder').run(new Date(st.instant - 120 * 60_000), ctx(sock)) // terlalu awal
  assert.equal(textsTo(sock, MEMBER_B).length, 0)
  await job('reminder').run(new Date(st.instant + 60_000), ctx(sock)) // sudah lewat
  assert.equal(textsTo(sock, MEMBER_B).length, 0)
})

// ================= deadlineAlert =================

test('deadlineAlert: setelah tenggat -> DM + recap grup, HANYA sekali', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', { [MEMBER_A]: { name: 'Anggota A', text: 'x', time: '', late: false } })
  db.set('flags', '2026-08-17', {})
  db.set('settings', 'alertEnabled', true)

  const st = time.deadlineState(ANCHOR, 'Jumat 21:00')
  const after = new Date(st.instant + 60_000)

  await job('deadlineAlert').run(after, ctx(sock))
  assert.equal(textsTo(sock, MEMBER_B).length, 1, 'DM alert ke yang belum lapor')
  assert.ok(textsTo(sock, MEMBER_B)[0].includes('Tenggat Laporan Sudah Lewat'))
  const recap = findSent(sock, G1, 'Tenggat Laporan Lewat')
  assert.ok(recap, 'recap grup terkirim')
  assert.ok(recap.content.text.includes('✅') && recap.content.text.includes('❌'))

  // Jalankan lagi dengan socket baru (logika flag harus mencegah kirim ulang)
  const sock2 = makeSock()
  await job('deadlineAlert').run(after, ctx(sock2))
  assert.equal(textsTo(sock2, MEMBER_B).length, 0, 'tidak ada kirim ulang')
  assert.ok(!findSent(sock2, G1, 'Tenggat Laporan Lewat'), 'recap tidak terkirim ulang')
})

test('deadlineAlert: alertEnabled false -> tidak kirim apa pun', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', {})
  db.set('flags', '2026-08-17', {})
  db.set('settings', 'alertEnabled', false)

  const st = time.deadlineState(ANCHOR, 'Jumat 21:00')
  await job('deadlineAlert').run(new Date(st.instant + 60_000), ctx(sock))
  assert.equal(sock.sent.length, 0, 'tidak ada DM maupun recap')
  assert.equal(db.get('flags', '2026-08-17').alertSent, undefined, 'flag tidak terkunci')
})

test('deadlineAlert: teks DM custom dipakai + variabel diganti', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', {})
  db.set('flags', '2026-08-17', {})
  db.set('settings', 'alertEnabled', true)
  db.set('settings', 'alertDmText', 'Halo{nama}, periode {periode} belum lapor! Tenggat {tenggat} WITA.')

  const st = time.deadlineState(ANCHOR, 'Jumat 21:00')
  await job('deadlineAlert').run(new Date(st.instant + 60_000), ctx(sock))
  const dm = textsTo(sock, MEMBER_B)[0]
  assert.ok(dm.includes('Halo'), 'nama kosong -> {nama} dibersihkan')
  assert.ok(!dm.includes('{periode}'), 'variabel periode diganti')
  assert.ok(!dm.includes('{tenggat}'), 'variabel tenggat diganti')
  db.del('settings', 'alertDmText')
})

test('deadlineAlert: recap tidak menyertakan admin/bot di list', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', {})
  db.set('flags', '2026-08-17', {})
  db.set('settings', 'alertEnabled', true)

  const st = time.deadlineState(ANCHOR, 'Jumat 21:00')
  await job('deadlineAlert').run(new Date(st.instant + 60_000), ctx(sock))
  const recap = findSent(sock, G1, 'Tenggat Laporan Lewat')
  assert.ok(!recap.content.text.includes('6281111111111'), 'admin tidak muncul')
  assert.ok(recap.content.text.includes('Belum lapor (2)'), 'dua anggota biasa yang belum')
})

// ================= weeklyReset =================

test('weeklyReset: periode berganti -> data periode lama dibersihkan', async () => {
  const sock = makeSock()
  db.set('meta', 'lastPeriod', '2026-08-10')
  db.set('reports', '2026-08-10', { x: { name: 'lama', text: '', time: '', late: false } })
  db.set('flags', '2026-08-10', { alertSent: true })
  db.set('reports', '2026-08-17', { y: { name: 'baru', text: '', time: '', late: false } })

  const now = new Date('2026-08-19T00:00:00.000Z') // minggu baru (17 Agu)
  await job('weeklyReset').run(now, ctx(sock))

  assert.equal(db.get('meta', 'lastPeriod'), '2026-08-17')
  assert.equal(db.get('reports', '2026-08-10', null), null, 'laporan periode lama dihapus')
  assert.equal(db.get('flags', '2026-08-10', null), null, 'flag periode lama dihapus')
  assert.ok(db.get('reports', '2026-08-17', {}), 'periode baru tidak disentuh')
})

test('weeklyReset: periode sama -> tidak ada perubahan', async () => {
  const sock = makeSock()
  db.set('meta', 'lastPeriod', '2026-08-17')
  db.set('reports', '2026-08-17', { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } })

  const now = new Date('2026-08-19T00:00:00.000Z')
  await job('weeklyReset').run(now, ctx(sock))
  assert.ok(db.get('reports', '2026-08-17', {})[MEMBER_A], 'data periode aktif tetap utuh')
})