import { reply, groupMeta, botJidOf, nonReporters, sendMention, isController, memberParticipants } from '../bot.js'

function displayName(db, jid, fallback = '') {
  return db.get('names', jid, '') || fallback
}

function jidToNumber(jid) {
  return jid.split('@')[0]
}

export default [
  {
    name: 'status',
    aliases: ['cek', 'lihat'],
    permission: 'all',
    async run(sock, m, { db, time }) {
      if (!m.isGroup) {
        const groups = db.get('meta', 'groups', [])
        if (!(await isController(sock, groups, m.sender))) {
          return reply(sock, m, 'Perintah ini hanya bisa digunakan di dalam grup, atau oleh admin grup via DM.')
        }
      }

      const now = new Date()
      const period = time.periodId(now)
      const reports = db.get('reports', period, {})
      const groupIds = m.isGroup ? [m.jid] : db.get('meta', 'groups', [])
      if (groupIds.length === 0) {
        return reply(sock, m, 'Belum ada grup yang terdaftar. Tambahkan bot ke grup atau gunakan !join <link>.')
      }

      const myJid = botJidOf(sock)
      const parts = []
      const mentions = []

      for (const gid of groupIds) {
        let meta
        try {
          meta = await groupMeta(sock, gid, true)
        } catch {
          continue
        }
        const due = nonReporters(myJid, meta, reports)
        const memberIds = new Set(memberParticipants(meta, myJid).map((p) => p.id))
        const done = Object.entries(reports)
          .filter(([jid]) => memberIds.has(jid))
          .map(([, r]) => r)

        const lines = []
        if (groupIds.length > 1) {
          lines.push(`*Grup: ${meta.subject || gid}*`)
          lines.push('')
        }
        lines.push(`*Status Laporan - Periode ${time.formatRange(period)}*`)
        lines.push(`Tenggat: ${time.formatDeadline()} WITA`)
        lines.push('')
        lines.push(`Sudah lapor (${done.length}):`)
        lines.push(done.length === 0 ? '-' : done.map((r) => `✅ ${r.name}${r.late ? ' (terlambat)' : ''}`).join('\n'))
        lines.push('')
        lines.push(`Belum lapor (${due.length}):`)
        lines.push(due.length === 0 ? '-' : `❌ ${due.map((p) => displayName(db, p.id, jidToNumber(p.id))).join(', ')}`)

        parts.push(lines.join('\n'))
        mentions.push(...due.map((p) => p.id))
      }

      if (parts.length === 0) {
        return reply(sock, m, 'Tidak ada grup yang dapat diakses.')
      }

      await sendMention(sock, m.jid, parts.join('\n\n'), mentions, m)
    },
  },
]