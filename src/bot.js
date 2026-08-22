import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys'
import { useEncryptedAuthState } from './authState.js'
import path from 'node:path'
import { config } from './config.js'
import * as db from './db.js'

const META_TTL = 60_000
const metaCache = new Map()

export function botJidOf(sock) {
  const id = sock?.user?.id || ''
  return `${id.split(':')[0]}@s.whatsapp.net`
}

export async function groupMeta(sock, gid, force = false) {
  const cached = metaCache.get(gid)
  if (!force && cached && Date.now() - cached.at < META_TTL) return cached.meta
  const meta = await sock.groupMetadata(gid)
  metaCache.set(gid, { meta, at: Date.now() })
  return meta
}

export function isGroupAdmin(meta, userJid) {
  const p = meta?.participants?.find((x) => x.id === userJid)
  return !!p && (p.admin === 'admin' || p.admin === 'superadmin')
}

/** Pengendali: nomor bot sendiri (master) ATAU admin di salah satu grup terdaftar. */
export async function isController(sock, groupIds, userJid) {
  if (userJid === botJidOf(sock)) return true
  for (const gid of groupIds || []) {
    try {
      const meta = await groupMeta(sock, gid)
      if (isGroupAdmin(meta, userJid)) return true
    } catch {
      continue
    }
  }
  return false
}

/** Peserta non-admin non-bot (anggota biasa). */
export function memberParticipants(meta, myJid, botLid) {
  return (meta?.participants || []).filter((p) => {
    if (p.id === myJid) return false
    if (p.id === botLid) return false
    if (config.exclude_admins && (p.admin === 'admin' || p.admin === 'superadmin')) return false
    return true
  })
}

/** Daftar peserta grup yang belum lapor (tidak termasuk bot, opsional admin). */
export function nonReporters(myJid, meta, reports = {}, botLid) {
  return (meta?.participants || []).filter((p) => {
    if (p.id === myJid) return false
    if (p.id === botLid) return false
    if (config.exclude_admins && (p.admin === 'admin' || p.admin === 'superadmin')) return false
    return !reports[p.id]
  })
}

/** Ambil identitas bot: PN (628...@s.whatsapp.net) dan LID (xxx:xx@lid). */
export function getBotIdentifiers(sock) {
  const pn = botJidOf(sock)
  const lid = sock?.user?.id
  return { pn, lid }
}

/** Resolve LID ke PN menggunakan contact list WhatsApp. Untuk LID modern, kirim ke LID langsung. */
export async function resolveLidToPn(sock, lid) {
  try {
    const contact = await sock.fetchContact(lid)
    console.log(`[resolve] ${lid} -> fetchContact ${contact?.id||'null'}`)
    if (contact?.id && contact.id.endsWith('@s.whatsapp.net')) return contact.id
    return lid
  } catch(e) {
    console.log(`[resolve] ${lid} fetchContact fail ${e.message} -> keep lid`)
    return lid
  }
}

/** Batch resolve multiple LIDs ke PNs. */
export async function resolveLidsToPns(sock, lids) {
  const results = {}
  for (const lid of lids) {
    results[lid] = await resolveLidToPn(sock, lid)
  }
  return results
}

/** Queue group mention fallback ketika DM gagal. */
export async function queueGroupMention(gid, targetLid, text) {
  const { messageQueue } = await import('./messageQueue.js')
  messageQueue.enqueue({
    jid: gid,
    text: `@${targetLid.split('@')[0]} ${text}`,
    mentions: [targetLid],
    type: 'mention'
  })
}

/** Nama per nomor: nama dari !lapor selalu menang; nama WhatsApp (pushName)
 * hanya mengisi bila belum ada nama tersimpan — tidak pernah menimpa. */
export function captureName(dbStore, jid, pushName) {
  const name = (pushName || '').trim()
  if (name && !dbStore.get('names', jid, '')) {
    dbStore.set('names', jid, name)
    return true
  }
  return false
}

/** Baris list laporan untuk recap & !check. */
export function reportListLines(done, due, dbStore, doneLabel = 'Sudah lapor', botIdentifiers = {}) {
  const botPn = botIdentifiers.pn?.replace(/:\d+@/, '@').split('@')[0] || ''
  const botLid = botIdentifiers.lid?.split('@')[0] || ''
  const isBot = (id) => {
    if (!id) return false
    const normalized = String(id).replace(/:\d+@/, '@').split('@')[0]
    return normalized === botPn || normalized === botLid
  }
  
  return [
    `${doneLabel} (${done.length}):`,
    done.length ? done.filter(r => !isBot(r.jid)).map((r) => `✅ ${r.name}`).join('\n') : '  -',
    '',
    `Belum lapor (${due.length}):`,
    due.length ? due.filter(p => !isBot(p.id)).map((p) => `❌ ${dbStore.get('names', p.id, '') || p.id.split('@')[0]}`).join('\n') : '  -',
  ]
}

export function registerGroup(gid) {
  const groups = db.get('meta', 'groups', [])
  if (!groups.includes(gid)) {
    groups.push(gid)
    db.set('meta', 'groups', groups)
    console.log(`[bot] Grup terdaftar: ${gid}`)
  }
}

export function unregisterGroup(gid) {
  const groups = db.get('meta', 'groups', [])
  if (groups.includes(gid)) {
    db.set('meta', 'groups', groups.filter((g) => g !== gid))
    console.log(`[bot] Grup dihapus dari daftar: ${gid}`)
  }
}

/** True jika grup ada di daftar grup yang diizinkan (meta.groups). */
export function shouldServeGroup(gid) {
  return db.get('meta', 'groups', []).includes(gid)
}

/** Ekstrak kode undangan dari link (atau kode polos) untuk chat.whatsapp.com. */
export function inviteCodeFromLink(input) {
  const m = String(input).trim().match(/^(?:https:\/\/chat\.whatsapp\.com\/)?([A-Za-z0-9_-]{15,})$/)
  return m ? m[1] : null
}

/**
 * Join & daftarkan hanya grup dari link yang diizinkan (config.allowed_group_links).
 * Grup sudah pernah di-join (meta.joined_links) tidak di-join ulang, hanya
 * dipastikan tetap terdaftar.
 */
export async function joinAllowedGroups(sock, links = config.allowed_group_links) {
  const joined = db.get('meta', 'joined_links', {})
  for (const link of links || []) {
    const code = inviteCodeFromLink(link)
    if (!code) {
      console.log(`[join] GAGAL ${link} - link tidak dikenali`)
      continue
    }
    const existing = joined[code]
    if (existing) {
      registerGroup(existing)
      console.log(`[join] ${existing} sudah terdaftar dari link ${code}`)
      continue
    }
    try {
      const gid = await sock.groupAcceptInvite(code)
      joined[code] = gid
      db.set('meta', 'joined_links', joined)
      registerGroup(gid)
      console.log(`[join] OK ${link} - masuk grup ${gid}`)
    } catch (err) {
      console.log(`[join] GAGAL ${link} - ${err?.message || 'link tidak valid/kedaluwarsa'}`)
    }
  }
}

export async function sendText(sock, jid, text, quoted) {
  const res = await sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined)
  console.log(`[sendText] to ${jid} id ${res?.key?.id||'?'} status ${res?.status||'?'}`)
  // wait briefly for receipt
  return res
}

export async function sendMention(sock, jid, text, mentionJids, quoted) {
  await sock.sendMessage(jid, { text, mentions: mentionJids }, quoted ? { quoted } : undefined)
}

export async function reply(sock, m, text) {
  await sendText(sock, m.jid, text, m)
}

export function extractText(m) {
  const msg = m.message || {}
  for (const t of ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage']) {
    const v = msg[t]
    if (t === 'conversation' && typeof v === 'string') return v.trim()
    if (v && typeof v === 'object') {
      if (typeof v.text === 'string' && v.text.trim()) return v.text.trim()
      if (typeof v.caption === 'string' && v.caption.trim()) return v.caption.trim()
    }
  }
  return ''
}

export async function createBot(handlers) {
  let sock
  let stopped = false
  let attempts = 0
  const authDir = path.join(process.cwd(), config.auth_dir)

  async function connect() {
    const { state, saveCreds } = await useEncryptedAuthState(authDir)
    sock = makeWASocket({ auth: state, markOnlineOnConnect: false })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (u) => {
      if (u.qr) {
        attempts = 0
        handlers.onQr?.(u.qr)
      }
      if (u.connection === 'open') {
        attempts = 0
        console.log('[bot] Terhubung ke WhatsApp')
        handlers.onOpen?.(sock)
      }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode
        const reason = u.lastDisconnect?.error?.message || ''
        if (stopped) return
        if (code === DisconnectReason.loggedOut) {
          console.log('[bot] Nomor ini sudah logout dari WhatsApp Web. Scan ulang QR dibutuhkan.')
          return handlers.onLoggedOut?.()
        }
        const delay = Math.min(30_000, 1_500 * 2 ** Math.min(attempts, 6))
        attempts += 1
        console.log(`[bot] Koneksi tertutup (${code}${reason ? ` - ${reason}` : ''}).`)
        console.log(`[bot] Mencoba lagi dalam ${Math.round(delay / 1000)} detik...`)
        setTimeout(connect, delay)
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      for (const m of messages) {
        if (m.key?.fromMe || !m.message) continue
        try {
          handlers.onMessage?.(sock, m)
        } catch (err) {
          console.error('[bot] Error saat proses pesan:', err?.message)
        }
      }
    })

    // Bot dikeluarkan dari grup -> berhenti melayani (join hanya lewat link, lihat joinAllowedGroups).
    sock.ev.on('group-participants.update', (u) => {
      if (u.participants.includes(botJidOf(sock)) && u.action === 'remove') unregisterGroup(u.id)
    })
  }

  await connect()

  return {
    getSock: () => sock,
    stop() {
      stopped = true
      sock?.end(new Error('stopped by user'))
    },
  }
}