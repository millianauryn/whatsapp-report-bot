import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, makeMsg, findSent, G1, G2, ADMIN, MEMBER_A, MEMBER_B, OUTSIDER, cleanup } from './helpers.js'
import { commands } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import * as bot from '../src/bot.js'
import { checkPermissionSafe } from '../src/permissions.js'

db.load()
// Semua grup uji pakai jadwal mingguan Jumat 21:00 -> periode = minggu berjalan.
time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
time.setGroupSchedule(G2, { cadence: 'weekly', deadline: 'Jumat 21:00' })

function run(cmd, sock, msg) {
  return commands.get(cmd).run(sock, msg, { db, time, bot, commands, sock })
}

function ctx(sock) {
  return { db, time, bot, commands, sock }
}

const period = () => time.periodId(new Date())
const reportsOf = () => db.get('reports', period(), {})

test.after(() => cleanup())

// ================= !lapor =================

test('!lapor: format lama dengan keterangan -> hanya nama yang dicatat', async () => {
  const sock = makeSock()
  await run('lapor', sock, makeMsg({ args: 'Budi Santoso - Menyelesaikan laporan' }))
  const reply = findSent(sock, G1, 'Laporan diterima')
  assert.ok(reply, 'ada balasan diterima')
  assert.ok(!reply.content.text.includes('Keterangan'), 'tidak ada baris keterangan')
  const stored = reportsOf()[G1][MEMBER_A]
  assert.deepEqual(stored, { name: 'Budi Santoso', text: '', time: stored.time, late: false })
  assert.equal(db.get('names', MEMBER_A), 'Budi Santoso', 'nama tersimpan untuk !check')
})

test('!lapor: tanpa keterangan tetap diterima', async () => {
  const sock = makeSock()
  await run('lapor', sock, makeMsg({ sender: MEMBER_B, pushName: 'Anggota B', args: 'Dewi' }))
  const reply = findSent(sock, G1, 'Laporan diterima')
  assert.ok(reply, 'diterima')
  assert.ok(!reply.content.text.includes('Keterangan:'), 'tidak ada baris keterangan')
  assert.equal(reportsOf()[G1][MEMBER_B].text, '')
})

test('!lapor: duplikat ditolak, menampilkan nama', async () => {
  const sock = makeSock()
  await run('lapor', sock, makeMsg({ sender: MEMBER_B, args: 'Dewi' }))
  await run('lapor', sock, makeMsg({ sender: MEMBER_B, args: 'Dewi - duplikat' }))
  const reply = findSent(sock, G1, 'sudah mengirim')
  assert.ok(reply, 'ada penolakan duplikat')
  assert.ok(reply.content.text.includes('Dewi'), 'nama ditampilkan di penolakan')
})

test('!lapor: kosong ditolak (format salah)', async () => {
  const sock = makeSock()
  await run('lapor', sock, makeMsg({ args: '' }))
  assert.ok(findSent(sock, G1, 'Format salah'))
})

test('!lapor: dari DM admin diterima, orang luar ditolak', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  await run('lapor', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm', args: 'Admin X - dari DM' }))
  assert.ok(findSent(sock, 'dm', 'Laporan diterima'), 'admin boleh dari DM')

  const sock2 = makeSock()
  await run('lapor', sock2, makeMsg({ isGroup: false, sender: OUTSIDER, jid: 'dm', args: 'Orang - luar' }))
  assert.ok(findSent(sock2, 'dm', 'hanya bisa digunakan di dalam grup'), 'orang luar ditolak')
})

test('!lapor: nama tersimpan ke names walau dari DM', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  const r = reportsOf()
  if (r[G1]) delete r[G1][ADMIN]
  db.set('reports', period(), r)
  db.del('names', ADMIN)
  await run('lapor', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm', args: 'Si Admin - tes nama' }))
  assert.equal(db.get('names', ADMIN), 'Si Admin')
})

test('!lapor: ditolak saat periode belum dibuka (gap)', async () => {
  const sock = makeSock()
  time.setGroupSchedule(G1, { cadence: 'semimonthly', deadline: '11:30' })
  try {
    await run('lapor', sock, makeMsg({ args: 'Orang - di sela' }))
    assert.ok(findSent(sock, G1, 'belum dibuka'), 'ditolak (gap)')
  } finally {
    time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  }
})

// ================= !check =================

test('!check: HANYA list, tidak mengirim DM apa pun', async () => {
  const sock = makeSock()
  db.set('reports', period(), { [G1]: {} })
  db.set('names', MEMBER_B, 'Dewi')
  await run('check', sock, makeMsg({ sender: ADMIN }))
  const recap = findSent(sock, G1, 'Cek Laporan')
  assert.ok(recap, 'recap list tampil')
  assert.ok(recap.content.text.includes('❌ Dewi'))
  assert.equal(recap.content.mentions, undefined, 'list tanpa mention')
  const dms = sock.sent.filter((s) => s.jid === MEMBER_A || s.jid === MEMBER_B)
  assert.equal(dms.length, 0, 'tidak ada DM ke peserta mana pun')
})

test('!check: semua sudah lapor -> list tetap tampil', async () => {
  const sock = makeSock()
  db.set('reports', period(), {
    [G1]: {
      [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false },
      [MEMBER_B]: { name: 'B', text: 'x', time: '', late: false },
    },
  })
  await run('check', sock, makeMsg({ sender: ADMIN }))
  const recap = findSent(sock, G1, 'Cek Laporan')
  assert.ok(recap, 'recap tetap tampil')
  assert.ok(recap.content.text.includes('Sudah lapor (2)'))
  assert.ok(recap.content.text.includes('Belum lapor (0)'))
})

test('!check dari DM orang luar: izin ditolak', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  const ok = await checkPermissionSafe(commands.get('check'), makeMsg({ isGroup: false, sender: OUTSIDER, jid: 'dm' }), sock)
  assert.equal(ok, false, 'orang luar tidak lolos izin')
})

// ================= !bantuan =================

test('!bantuan: berisi perintah inti saja', async () => {
  const sock = makeSock()
  await run('bantuan', sock, makeMsg({ sender: MEMBER_A }))
  const reply = findSent(sock, G1, 'Bantuan Bot Laporan')
  for (const k of ['!lapor', '!check', '!bantuan']) {
    assert.ok(reply.content.text.includes(k), `bantuan memuat ${k}`)
  }
  for (const k of ['!status', '!tenggat', '!reset', '!alert', '!alertdm', '!join', '!leave', '!grup']) {
    assert.ok(!reply.content.text.includes(k), `perintah ${k} tidak ada di bantuan`)
  }
  assert.ok(reply.content.text.includes('2x sebulan'), 'jadwal 2x sebulan dijelaskan')
  assert.ok(!reply.content.text.includes('Owner'), 'tidak ada lagi peran owner di bantuan')
})