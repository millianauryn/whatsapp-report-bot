import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, makeMsg, findSent, textsTo, G1, G2, ADMIN, MEMBER_A, MEMBER_B, OUTSIDER, cleanup } from './helpers.js'
import { loadCommands } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import * as bot from '../src/bot.js'

db.load()
const commands = await loadCommands()

function run(cmd, sock, msg) {
  return commands.get(cmd).run(sock, msg, { db, time, bot, commands, sock })
}

function ctx(sock) {
  return { db, time, bot, commands, sock }
}

test.after(() => cleanup())

// ================= !lapor =================

test('!lapor: valid dengan keterangan', async () => {
  const sock = makeSock()
  await run('lapor', sock, makeMsg({ args: 'Budi Santoso - Menyelesaikan laporan' }))
  const reply = findSent(sock, G1, 'Laporan diterima')
  assert.ok(reply, 'ada balasan diterima')
  assert.ok(reply.content.text.includes('Keterangan: Menyelesaikan laporan'))
  assert.deepEqual(db.get('reports', time.periodId(new Date())), {
    [MEMBER_A]: { name: 'Budi Santoso', text: 'Menyelesaikan laporan', time: db.get('reports', time.periodId(new Date()))[MEMBER_A].time, late: false },
  })
  assert.equal(db.get('names', MEMBER_A), 'Budi Santoso', 'nama tersimpan untuk !check')
})

test('!lapor: tanpa keterangan tetap diterima', async () => {
  const sock = makeSock()
  await run('lapor', sock, makeMsg({ sender: MEMBER_B, pushName: 'Anggota B', args: 'Dewi' }))
  const reply = findSent(sock, G1, 'Laporan diterima')
  assert.ok(reply, 'diterima')
  assert.ok(!reply.content.text.includes('Keterangan:'), 'tidak ada baris keterangan')
  assert.equal(db.get('reports', time.periodId(new Date()))[MEMBER_B].text, '')
})

test('!lapor: duplikat ditolak', async () => {
  const sock = makeSock()
  await run('lapor', sock, makeMsg({ sender: MEMBER_B, args: 'Dewi - lagi' }))
  await run('lapor', sock, makeMsg({ sender: MEMBER_B, args: 'Dewi - duplikat' }))
  const reply = findSent(sock, G1, 'sudah mengirim')
  assert.ok(reply, 'ada penolakan duplikat')
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
  const period = time.periodId(new Date())
  const r = db.get('reports', period, {})
  delete r[ADMIN]
  db.set('reports', period, r)
  db.del('names', ADMIN)
  await run('lapor', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm', args: 'Si Admin - tes nama' }))
  assert.equal(db.get('names', ADMIN), 'Si Admin')
})

// ================= !status =================

test('!status: list ✅ sudah / ❌ belum, tanpa admin & bot', async () => {
  const sock = makeSock()
  const period = time.periodId(new Date())
  db.set('reports', period, { [MEMBER_A]: { name: 'Budi Santoso', text: 'x', time: new Date().toISOString(), late: false } })
  db.set('names', MEMBER_B, 'Dewi')
  await run('status', sock, makeMsg({ sender: MEMBER_A }))
  const reply = findSent(sock, G1, 'Status Laporan')
  assert.ok(reply, 'ada recap status')
  assert.ok(reply.content.text.includes('✅ Budi Santoso'), 'yang sudah lapor tampil dengan nama')
  assert.ok(reply.content.text.includes('❌ Dewi'), 'yang belum tampil dengan nama')
  assert.ok(!reply.content.text.includes('6281'), 'nomor admin tidak muncul')
  assert.ok(!reply.content.text.includes(ADMIN), 'admin tidak muncul di list')
})

test('!status dari DM: semua grup diproses, recap dikirim ke DM pengirim', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1, G2])
  await run('status', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm' }))
  const recap = findSent(sock, 'dm', 'Status Laporan')
  assert.ok(recap, 'recap dikirim ke DM pengirim')
  assert.ok(recap.content.text.includes('Grup Uji 1'), 'header grup 1 ada')
  assert.ok(recap.content.text.includes('Grup Uji 2'), 'header grup 2 ada')
  assert.ok(!findSent(sock, G1, 'Status Laporan'), 'tidak mengirim ke grup langsung dari DM')
})

// ================= !check =================

test('!check: HANYA list, tidak mengirim DM apa pun', async () => {
  const sock = makeSock()
  const period = time.periodId(new Date())
  db.set('reports', period, {})
  db.set('names', MEMBER_B, 'Dewi')
  await run('check', sock, makeMsg({ sender: ADMIN }))
  const recap = findSent(sock, G1, 'Cek Laporan')
  assert.ok(recap, 'recap list tampil')
  assert.ok(recap.content.text.includes('❌ Dewi'))
  const dms = sock.sent.filter((s) => s.jid === MEMBER_A || s.jid === MEMBER_B)
  assert.equal(dms.length, 0, 'tidak ada DM ke peserta mana pun')
})

test('!check: semua sudah lapor -> list tetap tampil (tanpa pesan peringatan)', async () => {
  const sock = makeSock()
  const period = time.periodId(new Date())
  db.set('reports', period, {
    [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false },
    [MEMBER_B]: { name: 'B', text: 'x', time: '', late: false },
  })
  await run('check', sock, makeMsg({ sender: ADMIN }))
  const recap = findSent(sock, G1, 'Cek Laporan')
  assert.ok(recap, 'recap tetap tampil')
  assert.ok(recap.content.text.includes('Sudah lapor (2)'))
  assert.ok(recap.content.text.includes('Belum lapor (0)'))
})

test('!check dari DM orang luar: ditolak', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1])
  await run('check', sock, makeMsg({ isGroup: false, sender: OUTSIDER, jid: 'dm' }))
  assert.ok(findSent(sock, 'dm', 'hanya bisa digunakan di dalam grup'))
})

// ================= !tenggat =================

test('!tenggat: tanpa argumen menampilkan tenggat saat ini', async () => {
  const sock = makeSock()
  db.del('deadline', 'override')
  await run('tenggat', sock, makeMsg({ sender: ADMIN }))
  assert.ok(findSent(sock, G1, 'Tenggat saat ini'))
})

test('!tenggat: set valid -> tersimpan + reset flag periode', async () => {
  const sock = makeSock()
  db.set('flags', time.periodId(new Date()), { reminderSent: true })
  await run('tenggat', sock, makeMsg({ sender: ADMIN, args: 'Sabtu 12:30' }))
  assert.ok(findSent(sock, G1, 'Tenggat diubah menjadi Sabtu 12:30'))
  assert.equal(db.get('deadline', 'override'), 'Sabtu 12:30')
  assert.deepEqual(db.get('flags', time.periodId(new Date())), {}, 'flag direset')
  db.del('deadline', 'override')
})

test('!tenggat: format salah -> ditolak', async () => {
  const sock = makeSock()
  await run('tenggat', sock, makeMsg({ sender: ADMIN, args: 'tidak valid' }))
  assert.ok(findSent(sock, G1, 'Format salah'))
})

// ================= !reset =================

test('!reset <nama>: hapus laporan 1 orang saja', async () => {
  const sock = makeSock()
  const period = time.periodId(new Date())
  db.set('reports', period, {
    [MEMBER_A]: { name: 'Budi', text: 'x', time: '', late: false },
    [MEMBER_B]: { name: 'Dewi', text: 'x', time: '', late: false },
  })
  await run('reset', sock, makeMsg({ sender: ADMIN, args: 'Budi' }))
  assert.ok(findSent(sock, G1, 'Laporan berikut direset: Budi'))
  const reports = db.get('reports', period, {})
  assert.equal(reports[MEMBER_A], undefined, 'laporan Budi hilang')
  assert.ok(reports[MEMBER_B], 'laporan Dewi tetap ada')
})

test('!reset <nomor>: cocok via nomor HP', async () => {
  const sock = makeSock()
  const period = time.periodId(new Date())
  db.set('reports', period, { [MEMBER_A]: { name: 'Budi', text: 'x', time: '', late: false } })
  await run('reset', sock, makeMsg({ sender: ADMIN, args: '6282222222222' }))
  assert.ok(findSent(sock, G1, 'direset'))
  assert.equal(db.get('reports', period, {})[MEMBER_A], undefined)
})

test('!reset: nama tidak dikenal -> informasi', async () => {
  const sock = makeSock()
  await run('reset', sock, makeMsg({ sender: ADMIN, args: 'Tidak Ada' }))
  assert.ok(findSent(sock, G1, 'Tidak ada laporan yang cocok'))
})

test('!reset (kosong): reset seluruh periode', async () => {
  const sock = makeSock()
  const period = time.periodId(new Date())
  db.set('reports', period, { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } })
  db.set('flags', period, { reminderSent: true })
  await run('reset', sock, makeMsg({ sender: ADMIN }))
  assert.ok(findSent(sock, G1, 'Periode baru dimulai'))
  assert.equal(db.get('reports', period, null), null)
  assert.equal(db.get('flags', period, null), null)
})

// ================= !alert & !alertdm =================

test('!alert: status/on/off', async () => {
  const sock = makeSock()
  db.set('settings', 'alertEnabled', true)
  await run('alert', sock, makeMsg({ sender: ADMIN }))
  assert.ok(findSent(sock, G1, 'NYALA'))

  await run('alert', sock, makeMsg({ sender: ADMIN, args: 'off' }))
  assert.ok(findSent(sock, G1, 'MATI'))
  assert.equal(db.get('settings', 'alertEnabled'), false)

  await run('alert', sock, makeMsg({ sender: ADMIN, args: 'on' }))
  assert.ok(findSent(sock, G1, 'NYALA'))
  assert.equal(db.get('settings', 'alertEnabled'), true)
})

test('!alert: argumen salah -> format salah', async () => {
  const sock = makeSock()
  await run('alert', sock, makeMsg({ sender: ADMIN, args: 'kadang' }))
  assert.ok(findSent(sock, G1, 'Format salah'))
})

test('!alertdm: set / lihat / reset', async () => {
  const sock = makeSock()
  await run('alertdm', sock, makeMsg({ sender: ADMIN, args: 'Halo{nama}, segera lapor! Tenggat {tenggat} WITA.' }))
  assert.ok(findSent(sock, G1, 'Teks DM alert disimpan'))
  assert.equal(db.get('settings', 'alertDmText'), 'Halo{nama}, segera lapor! Tenggat {tenggat} WITA.')

  await run('alertdm', sock, makeMsg({ sender: ADMIN }))
  assert.ok(findSent(sock, G1, 'Teks DM alert saat ini'))

  await run('alertdm', sock, makeMsg({ sender: ADMIN, args: 'reset' }))
  assert.ok(findSent(sock, G1, 'dikembalikan ke bawaan'))
  assert.equal(db.get('settings', 'alertDmText', 'x'), 'x')
})

// ================= !join / !leave / !grup =================

test('!join: link valid -> join + terdaftar', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [])
  await run('join', sock, makeMsg({ sender: ADMIN, args: 'https://chat.whatsapp.com/AbCdEfGh1234567' }))
  assert.ok(findSent(sock, G1, 'Berhasil bergabung'))
  assert.ok(db.get('meta', 'groups', []).includes(G1))
  assert.ok(db.get('joined_invites', 'list', []).includes('AbCdEfGh1234567'))
})

test('!join: link tidak valid -> gagal', async () => {
  const sock = makeSock()
  await run('join', sock, makeMsg({ sender: ADMIN, args: 'https://example.com/abc' }))
  assert.ok(findSent(sock, G1, 'Link tidak valid'))
})

test('!leave: dari DM ditolak, dari grup menghapus registrasi', async () => {
  const sock = makeSock()
  await run('leave', sock, makeMsg({ isGroup: false, sender: ADMIN, jid: 'dm' }))
  assert.ok(findSent(sock, 'dm', 'Kirim !leave di dalam grup'))

  db.set('meta', 'groups', [G1, G2])
  await run('leave', sock, makeMsg({ sender: ADMIN }))
  assert.ok(findSent(sock, G1, 'meninggalkan grup'))
  assert.deepEqual(db.get('meta', 'groups', []), [G2])
})

test('!grup: daftar grup terdaftar', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [G1, G2])
  await run('grup', sock, makeMsg({ sender: ADMIN }))
  const reply = findSent(sock, G1, 'Grup Terdaftar')
  assert.ok(reply)
  assert.ok(reply.content.text.includes('Grup Uji 1'))
  assert.ok(reply.content.text.includes('Grup Uji 2'))
})

// ================= !bantuan =================

test('!bantuan: berisi semua perintah inti', async () => {
  const sock = makeSock()
  await run('bantuan', sock, makeMsg({ sender: MEMBER_A }))
  const reply = findSent(sock, G1, 'Bantuan Bot Laporan')
  for (const k of ['!lapor', '!status', '!check', '!tenggat', '!reset', '!alert', '!alertdm', '!join', '!leave', '!grup', '!bantuan']) {
    assert.ok(reply.content.text.includes(k), `bantuan memuat ${k}`)
  }
  assert.ok(!reply.content.text.includes('Owner'), 'tidak ada lagi peran owner di bantuan')
})