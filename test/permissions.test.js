import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, BOT_JID, G1, G2, ADMIN, MEMBER_A, MEMBER_B, OUTSIDER } from './helpers.js'
import { checkPermission, checkPermissionSafe } from '../src/permissions.js'
import * as db from '../src/db.js'
import * as bot from '../src/bot.js'

db.load()
db.set('meta', 'groups', [G1, G2])

const sock = makeSock()

const cmdAdmin = { permission: 'admin' }
const cmdAll = { permission: 'all' }

test('izin all: siapa pun boleh, di grup maupun DM', async () => {
  assert.equal(await checkPermission(cmdAll, { isGroup: true, sender: MEMBER_A, jid: G1 }, sock), true)
  assert.equal(await checkPermission(cmdAll, { isGroup: false, sender: OUTSIDER, jid: 'x' }, sock), true)
})

test('izin admin di grup: admin boleh, anggota biasa tidak', async () => {
  assert.equal(await checkPermission(cmdAdmin, { isGroup: true, sender: ADMIN, jid: G1 }, sock), true)
  assert.equal(await checkPermission(cmdAdmin, { isGroup: true, sender: MEMBER_B, jid: G1 }, sock), false)
})

test('izin admin dari DM: admin salah satu grup terdaftar boleh, orang luar tidak', async () => {
  assert.equal(await checkPermission(cmdAdmin, { isGroup: false, sender: ADMIN, jid: 'dm' }, sock), true)
  assert.equal(await checkPermission(cmdAdmin, { isGroup: false, sender: OUTSIDER, jid: 'dm' }, sock), false)
})

test('nomor bot sendiri = master di mana pun', async () => {
  assert.equal(await checkPermission(cmdAdmin, { isGroup: true, sender: BOT_JID, jid: G1 }, sock), true)
  assert.equal(await checkPermission(cmdAdmin, { isGroup: false, sender: BOT_JID, jid: 'dm' }, sock), true)
})

test('admin grup terdaftar lain tetap dianggap pengendali', async () => {
  const g2Admin = ADMIN // admin superadmin di G2 juga
  assert.equal(await checkPermission(cmdAdmin, { isGroup: false, sender: g2Admin, jid: 'dm' }, sock), true)
})

test('grup tidak dikenal: meta gagal -> ditolak (versi aman)', async () => {
  const metaFailSock = makeSock()
  assert.equal(
    await checkPermissionSafe(cmdAdmin, { isGroup: true, sender: ADMIN, jid: '999@g.us' }, metaFailSock),
    false,
  )
})