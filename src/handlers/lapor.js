import { isController, groupMeta, isGroupAdmin, sendText, botJidOf } from '../bot.js'

const USAGE = '!lapor <nama>'
const EXAMPLE = 'Contoh: !lapor PBJ budi'

/** Nama saja. */
export function parseLapor(text) {
  const name = text.trim()
  if (!name) return null
  return { name, detail: '' }
}

async function submitOne(sock, msg, { db, time }, gid) {
  const now = new Date()
  const schedule = time.groupSchedule(gid)
  const state = time.scheduleState(now, schedule)
  if (!state) return { ok: false, reason: 'closed', schedule }

  const byGroup = db.get('reports', state.periodId, {})
  const reports = byGroup[gid] || (byGroup[gid] = {})
  const existing = reports[msg.sender]
  if (existing) return { ok: false, reason: 'duplicate' }

  const parsed = parseLapor(msg.args)
  const late = false

  reports[msg.sender] = {
    name: parsed.name,
    text: parsed.detail,
    time: now.toISOString(),
    late,
  }
  db.set('reports', state.periodId, byGroup)
  if (db.get('names', msg.sender, '') !== parsed.name) {
    db.set('names', msg.sender, parsed.name)
  }
  return { ok: true, state, late, name: parsed.name, pushName: msg.pushName }
}

export default [
  {
    name: 'lapor',
    aliases: ['laporkan', 'report'],
    permission: 'all',
    async run(sock, m, ctx) {
      const { db, time } = ctx

      // === MASUK GRUP ===
      if (m.isGroup) {
        // Cek izin: hanyalah controller/admin grup
        if (!(await isController(sock, db.get('meta', 'groups', []), m.sender))) {
          // Admin tidak diketahui atau tidak terdaftar -> diam total
          return
        }

        // Parse input
        const parsed = parseLapor(m.args)
        if (!parsed) {
          // Format salah -> diam di group (hindari spam)
          return
        }

        // Jalankan submit laporan
        const res = await submitOne(sock, m, ctx, m.jid)

        // Jika gagal (duplikat) -> diam total, kirim ke owner bot saja
        if (!res.ok) {
          if (res.reason === 'duplicate') {
            // Duplicate jangan kirim balasan di group sama sekali
            // Kirim ke owner bot sebagai catatan internal (opsional)
            // return // jangan kirim balasan sama sekali di group
          }
          // Jika periode tutup atau error lain -> diam total
          return
        }

        // === KIRIM LAPORAN KE OWNER BOT via DM ===
        const botJid = botJidOf(sock)
        await sendText(sock, botJid, `Laporan diterima, terima kasih ${res.name}!`)
        if (res.pushName && res.name.toLowerCase() !== res.pushName.toLowerCase()) {
          await sendText(sock, botJid, `\n\n(Catatan: nama tidak sama dengan nama WhatsApp kamu "${res.pushName}". Laporan tetap dicatat.)`)
        }

        // Balasan di GRUP DIAKTIFKAN TIDAK (silent)
        // Tidak ada reply() di sini -> grup tetap sunta
        return
      }

      // === MASUK DM (private chat) ===
      if (!m.isGroup) {
        // Dari DM, hanyalah controller/admin yang bisa lapor
        if (!(await isController(sock, db.get('meta', 'groups', []), m.sender))) {
          return // diam, bukan controller
        }

        const parsed = parseLapor(m.args)
        if (!parsed) {
          return // format salah, diam
        }

        const res = await submitOne(sock, m, ctx, m.jid)
        if (!res.ok) {
          if (res.reason === 'duplicate') {
            return // duplicate, diam
          }
          return // error, diam
        }

        // Kirim konfirmasi ke owner bot
        const botJid = botJidOf(sock)
        await sendText(sock, botJid, `Laporan diterima, terima kasih ${res.name}!`)
        if (res.pushName && res.name.toLowerCase() !== res.pushName.toLowerCase()) {
          await sendText(sock, botJid, `\n\n(Catatan: nama tidak sama dengan nama WhatsApp kamu "${res.pushName}". Laporan tetap dicatat.)`)
        }
        // Balasan di DM jangan ditampilkan (hindari konfirmasi berulang)
        return
      }
    },
  },
]