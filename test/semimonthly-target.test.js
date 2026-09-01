import './helpers.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jobs } from '../src/registry.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { config } from '../src/config.js'

const GID = '120363411450968353@g.us'
const BOT = '6285391863505@s.whatsapp.net'
const MEMBER = '6282222222222@s.whatsapp.net'
const PERIOD = '2026-09-01'

const job = (name) => jobs.find((item) => item.name === name)
const ctx = (sock) => ({ db, time, config, sock: () => sock })

function makeSock() {
  const sent = []
  return {
    sent,
    user: { id: '6285391863505:7@s.whatsapp.net' },
    async sendMessage(jid, content, options) {
      sent.push({ jid, content, options })
    },
    async groupMetadata(gid) {
      if (gid !== GID) throw new Error('grup tidak ditemukan')
      return {
        id: GID,
        subject: 'Grup Uji Semimonthly',
        participants: [{ id: BOT }, { id: MEMBER }],
      }
    },
  }
}

function reset() {
  db.clear('flags')
  db.clear('reports')
  db.clear('settings')
  db.clear('names')
  db.set('meta', 'groups', [GID])
  db.set('settings', 'alertEnabled', true)
  time.setGroupSchedule(GID, { cadence: 'semimonthly', deadline: '11:30' })
  time.setGroupSummaryTime(GID, '17:00')
}

db.load()

test('GID target: semimonthly kirim summary, reminder, lalu reset saat masuk gap', async () => {
  reset()

  const summarySock = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-01T09:00:30.000Z'), ctx(summarySock))
  assert.ok(summarySock.sent.some((message) => message.jid === GID && message.content.text.includes('Summary Harian')))
  assert.equal(db.get('flags', PERIOD)[`${GID}:summary:2026-09-01`], true)

  const reminderSock = makeSock()
  await job('reminder').run(new Date('2026-09-03T03:30:30.000Z'), ctx(reminderSock))
  assert.equal(reminderSock.sent.filter((message) => message.jid === MEMBER).length, 0)
  assert.ok(reminderSock.sent.some((message) => message.jid === GID && message.content.text.includes('Pengingat Laporan')))
  assert.equal(db.get('flags', PERIOD)[`${GID}:reminder:11:30`], true)

  db.set('reports', PERIOD, { [GID]: { [MEMBER]: { name: 'Anggota', text: '', time: '2026-09-03T02:00:00.000Z', late: false } } })
  const finalSock = makeSock()
  await job('deadlineAlert').run(new Date('2026-09-04T15:58:30.000Z'), ctx(finalSock))
  assert.ok(finalSock.sent.some((message) => message.jid === GID && message.content.text.includes('Summary Terakhir')))

  await job('periodReset').run(new Date('2026-09-04T16:00:00.000Z'), ctx(makeSock()))
  assert.equal(db.get('reports', PERIOD, null), null)
  assert.equal(db.get('flags', PERIOD, null), null)

  const gapSock = makeSock()
  await job('reminder').run(new Date('2026-09-10T04:00:00.000Z'), ctx(gapSock))
  await job('deadlineAlert').run(new Date('2026-09-10T09:00:30.000Z'), ctx(gapSock))
  assert.equal(gapSock.sent.length, 0)
})
