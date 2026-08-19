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
export function memberParticipants(meta, myJid) {
  return (meta?.participants || []).filter((p) => {
    if (p.id === myJid) return false
    if (config.exclude_admins && (p.admin === 'admin' || p.admin === 'superadmin')) return false
    return true
  })
}

/** Daftar peserta grup yang belum lapor (tidak termasuk bot, opsional admin). */
export function nonReporters(myJid, meta, reports = {}) {
  return (meta?.participants || []).filter((p) => {
    if (p.id === myJid) return false
    if (config.exclude_admins && (p.admin === 'admin' || p.admin === 'superadmin')) return false
    return !reports[p.id]
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
export function reportListLines(done, due, dbStore, doneLabel = 'Sudah lapor') {
  return [
    `${doneLabel} (${done.length}):`,
    done.length ? done.map((r) => `✅ ${r.name}`).join('\n') : '  -',
    '',
    `Belum lapor (${due.length}):`,
    due.length ? due.map((p) => `❌ ${dbStore.get('names', p.id, '') || p.id.split('@')[0]}`).join('\n') : '  -',
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
  await sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined)
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

    sock.ev.on('group-participants.update', (u) => {
      if (!u.participants.includes(botJidOf(sock))) return
      if (u.action === 'add') {
        // Hanya grup dari link yang diizinkan yang dilayani; ditambahkan langsung -> diabaikan.
        if (!shouldServeGroup(u.id)) {
          console.log(`[bot] Grup tidak diizinkan, diabaikan: ${u.id}`)
          return
        }
        registerGroup(u.id)
      }
      if (u.action === 'remove') unregisterGroup(u.id)
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