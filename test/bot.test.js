import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, BOT_JID, G1, G2, ADMIN, MEMBER_A, MEMBER_B, GROUPS, cleanup } from './helpers.js'
import * as bot from '../src/bot.js'
import * as db from '../src/db.js'

db.load()

test.after(() => cleanup())

test('registerGroup/unregisterGroup: daftar grup bertambah & berkurang', () => {
  db.set('meta', 'groups', [G2])
  bot.registerGroup(G1)
  assert.deepEqual(db.get('meta', 'groups', []), [G2, G1])
  bot.unregisterGroup(G1)
  assert.deepEqual(db.get('meta', 'groups', []), [G2], 'grup yang dihapus tidak lagi dilayani')
})

test('shouldServeGroup: hanya grup yang terdaftar', () => {
  db.set('meta', 'groups', [G1])
  assert.equal(bot.shouldServeGroup(G1), true)
  assert.equal(bot.shouldServeGroup(G2), false)
})

test('inviteCodeFromLink: link penuh atau kode polos', () => {
  assert.equal(bot.inviteCodeFromLink('https://chat.whatsapp.com/HSFrpubAAEZBBfYGYWv8cV'), 'HSFrpubAAEZBBfYGYWv8cV')
  assert.equal(bot.inviteCodeFromLink('HSFrpubAAEZBBfYGYWv8cV'), 'HSFrpubAAEZBBfYGYWv8cV')
  assert.equal(bot.inviteCodeFromLink('https://example.com/abc'), null)
  assert.equal(bot.inviteCodeFromLink('pendek'), null)
  assert.equal(bot.inviteCodeFromLink(''), null)
})

test('joinAllowedGroups: join via link -> terdaftar + tidak di-join ulang; link invalid -> dilewati', async () => {
  const sock = makeSock()
  db.set('meta', 'groups', [])
  db.del('meta', 'joined_links')

  const links = [
    'https://chat.whatsapp.com/HSFrpubAAEZBBfYGYWv8cV',
    'https://example.com/gagal',
  ]
  await bot.joinAllowedGroups(sock, links)

  assert.deepEqual(db.get('meta', 'groups', []), [G1], 'grup dari link diizinkan terdaftar')
  assert.deepEqual(db.get('meta', 'joined_links', {}), { HSFrpubAAEZBBfYGYWv8cV: G1 }, 'pemetaan kode->gid tersimpan')
  const invites = sock.sent.filter((s) => s.content.invite)
  assert.equal(invites.length, 1, 'hanya satu percobaan join')

  db.set('meta', 'groups', [])
  await bot.joinAllowedGroups(sock, links)
  assert.deepEqual(db.get('meta', 'groups', []), [G1], 'join ulang tidak perlu, grup dipulihkan dari joined_links')
  assert.equal(sock.sent.filter((s) => s.content.invite).length, 1, 'tidak join ulang')
})

test('isGroupAdmin: admin & superadmin, bukan anggota biasa', () => {
  const meta = GROUPS[G1]
  assert.equal(bot.isGroupAdmin(meta, ADMIN), true)
  assert.equal(bot.isGroupAdmin(meta, MEMBER_A), false)
  assert.equal(bot.isGroupAdmin(meta, BOT_JID), false)
  assert.equal(bot.isGroupAdmin(null, ADMIN), false)
})

test('memberParticipants: bot & admin dikecualikan, anggota biasa tersisa', () => {
  const members = bot.memberParticipants(GROUPS[G1], BOT_JID)
  const ids = members.map((p) => p.id)
  assert.deepEqual(ids, [MEMBER_A, MEMBER_B])
  assert.ok(!ids.includes(BOT_JID), 'bot tidak masuk list')
  assert.ok(!ids.includes(ADMIN), 'admin tidak masuk list')
})

test('nonReporters: yang belum lapor, tanpa bot & admin', () => {
  const reports = { [MEMBER_A]: { name: 'A' } }
  const due = bot.nonReporters(BOT_JID, GROUPS[G1], reports)
  assert.deepEqual(due.map((p) => p.id), [MEMBER_B])
})

test('captureName: mengisi bila kosong, tidak menimpa nama lapor', () => {
  db.del('names', MEMBER_A)
  assert.equal(bot.captureName(db, MEMBER_A, 'Nama WA'), true, 'pushName mengisi saat kosong')
  assert.equal(db.get('names', MEMBER_A), 'Nama WA')

  db.set('names', MEMBER_B, 'Budi Santoso')
  assert.equal(bot.captureName(db, MEMBER_B, 'Nama WA Lain'), false, 'nama lapor tidak tertimpa')
  assert.equal(db.get('names', MEMBER_B), 'Budi Santoso', 'nama lapor tetap dipertahankan')

  assert.equal(bot.captureName(db, G2, '   '), false, 'pushName kosong diabaikan')
})

test('isController: nomor bot selalu lolos, admin grup terdaftar lolos, orang luar tidak', async () => {
  const sock = makeSock()
  assert.equal(await bot.isController(sock, [G1], BOT_JID), true)
  assert.equal(await bot.isController(sock, [G1], ADMIN), true)
  assert.equal(await bot.isController(sock, [G1], MEMBER_A), false)
  assert.equal(await bot.isController(sock, [], BOT_JID), true, 'master tanpa grup pun lolos')
})

test('extractText: conversation & extendedTextMessage & caption', () => {
  assert.equal(bot.extractText({ message: { conversation: '  !lapor Budi ' } }), '!lapor Budi')
  assert.equal(bot.extractText({ message: { extendedTextMessage: { text: 'halo' } } }), 'halo')
  assert.equal(bot.extractText({ message: { imageMessage: { caption: '!status' } } }), '!status')
  assert.equal(bot.extractText({ message: {} }), '')
  assert.equal(bot.extractText({}), '')
})

test('sendText/sendMention/reply: mengirim lewat socket', async () => {
  const sock = makeSock()
  await bot.sendText(sock, G1, 'teks biasa')
  await bot.sendMention(sock, G1, 'teks mention', [MEMBER_A])
  await bot.reply(sock, { jid: G1, message: {} }, 'balasan')
  assert.ok(sock.sent.some((s) => s.content.text === 'teks biasa'))
  assert.ok(sock.sent.some((s) => s.content.text === 'teks mention' && s.content.mentions[0] === MEMBER_A))
  assert.ok(sock.sent.some((s) => s.content.text === 'balasan' && s.options))
})