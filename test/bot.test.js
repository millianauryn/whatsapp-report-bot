import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, BOT_JID, G1, ADMIN, MEMBER_A, MEMBER_B, GROUPS } from './helpers.js'
import * as bot from '../src/bot.js'

test('inviteCodeFromLink: berbagai format link/kode', () => {
  assert.equal(bot.inviteCodeFromLink('https://chat.whatsapp.com/AbCdEfGh1234567'), 'AbCdEfGh1234567')
  assert.equal(bot.inviteCodeFromLink('chat.whatsapp.com/AbCdEfGh1234567'), 'AbCdEfGh1234567')
  assert.equal(bot.inviteCodeFromLink('AbCdEfGh1234567'), 'AbCdEfGh1234567')
  assert.equal(bot.inviteCodeFromLink('https://chat.whatsapp.com/?code=AbCdEfGh1234567'), 'AbCdEfGh1234567')
  assert.equal(bot.inviteCodeFromLink('https://example.com/abc'), null, 'domain lain ditolak')
  assert.equal(bot.inviteCodeFromLink('pendek'), null, 'kode terlalu pendek')
  assert.equal(bot.inviteCodeFromLink(''), null)
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

test('joinGroupByInvite & leaveGroup: memanggil API socket', async () => {
  const sock = makeSock()
  const gid = await bot.joinGroupByInvite(sock, 'https://chat.whatsapp.com/AbCdEfGh1234567')
  assert.equal(gid, G1)
  await bot.leaveGroup(sock, G1)
  assert.ok(sock.sent.some((s) => s.content.left === true))
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