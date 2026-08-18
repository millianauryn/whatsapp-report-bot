import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'bot-test-'))
process.env.BOT_DATA_FILE = path.join(dir, 'data.json')

export function cleanup() {
  rmSync(dir, { recursive: true, force: true })
}

const BOT_JID = '6285391863505@s.whatsapp.net'
const G1 = '120363429605878784@g.us'
const G2 = '120363429605878785@g.us'

const ADMIN = '6281111111111@s.whatsapp.net'
const MEMBER_A = '6282222222222@s.whatsapp.net'
const MEMBER_B = '6283333333333@s.whatsapp.net'
const OUTSIDER = '6284444444444@s.whatsapp.net'

const GROUPS = {
  [G1]: {
    id: G1,
    subject: 'Grup Uji 1',
    participants: [
      { id: BOT_JID },
      { id: ADMIN, admin: 'admin' },
      { id: MEMBER_A },
      { id: MEMBER_B },
    ],
  },
  [G2]: {
    id: G2,
    subject: 'Grup Uji 2',
    participants: [
      { id: BOT_JID },
      { id: ADMIN, admin: 'superadmin' },
      { id: MEMBER_A },
    ],
  },
}

/** Socket tiruan: menangkap semua pesan terkirim + meta grup dari GROUPS. */
export function makeSock() {
  const sent = []
  return {
    sent,
    user: { id: '6285391863505:7@s.whatsapp.net' },
    async sendMessage(jid, content, options) {
      sent.push({ jid, content, options })
    },
    async groupMetadata(gid) {
      if (!GROUPS[gid]) throw new Error(`grup tidak ditemukan: ${gid}`)
      return structuredClone(GROUPS[gid])
    },
    async groupAcceptInvite(code) {
      sent.push({ jid: 'system', content: { invite: code }, options: undefined })
      return G1
    },
    async groupLeave(jid) {
      sent.push({ jid, content: { left: true }, options: undefined })
    },
  }
}

export function makeMsg(overrides = {}) {
  return {
    jid: G1,
    isGroup: true,
    sender: MEMBER_A,
    pushName: 'Anggota A',
    args: '',
    key: { remoteJid: G1, fromMe: false },
    message: { conversation: 'x' },
    ...overrides,
  }
}

/** Cari pesan terkirim pertama yang cocok (berisi teks / ke jid). */
export function findSent(sock, jid = null, contains = null) {
  return sock.sent.find((s) => {
    if (jid && s.jid !== jid) return false
    if (contains !== null && !String(s.content.text ?? '').includes(contains)) return false
    return true
  })
}

export function textsTo(sock, jid) {
  return sock.sent.filter((s) => s.jid === jid).map((s) => String(s.content.text ?? ''))
}

export { BOT_JID, G1, G2, ADMIN, MEMBER_A, MEMBER_B, OUTSIDER, GROUPS }