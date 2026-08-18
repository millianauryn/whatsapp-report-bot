import { reply, groupMeta, botJidOf, nonReporters, sendMention, isController, memberParticipants } from '../bot.js'

function displayName(db, jid, fallback = '') {
  return db.get('names', jid, '') || fallback
}

function jidToNumber(jid) {
  return jid.split('@')[0]
}

export default [
  {
    name: 'check',
    aliases: ['ingatkan', 'pengingat'],
    permission: 'admin',
    async run(sock, m, { db, time }) {
      if (!m.isGroup) {
        const groups = db.get('meta', 'groups', [])
        if (!(await isController(sock, groups, m.sender))) {
          return reply(sock, m, 'Perintah ini hanya bisa digunakan di dalam grup, atau oleh admin grup via DM.')
        }
      }

      const now = new Date()
      const groupIds = m.isGroup ? [m.jid] : db.get('meta', 'groups', [])
      if (groupIds.length === 0) {
        return reply(sock, m, 'Belum ada grup yang terdaftar. Tambahkan bot ke grup atau gunakan !join <link>.')
      }

      const myJid = botJidOf(sock)
      const parts = []

      for (const gid of groupIds) {
        let meta
        try {
          meta = await groupMeta(sock, gid, true)
        } catch {
          continue
        }

        const schedule = time.groupSchedule(gid)
        const state = time.scheduleState(now, schedule)
        const lines = []
        if (groupIds.length > 1) {
          lines.push(`*Grup: ${meta.subject || gid}*`)
          lines.push('')
        }

        if (!state) {
          const next = time.nextPeriodInfo(now, schedule)
          lines.push(`*Cek Laporan - ${time.describeSchedule(schedule)}*`)
          lines.push(next
            ? `Periode belum dibuka. Jadwal berikutnya: ${next.periodLabel} (tenggat ${next.deadlineText} WITA).`
            : 'Periode belum dibuka. Cek jadwal dengan !tenggat.')
          parts.push({ gid, lines, mentions: [] })
          continue
        }

        const reports = db.get('reports', state.periodId, {})[gid] || {}
        const due = nonReporters(myJid, meta, reports)
        const memberIds = new Set(memberParticipants(meta, myJid).map((p) => p.id))
        const done = Object.entries(reports)
          .filter(([jid]) => memberIds.has(jid))
          .map(([, r]) => r)

        lines.push(`*Cek Laporan - Periode ${state.periodLabel}*`)
        lines.push(`Jadwal: ${time.describeSchedule(schedule)}`)
        lines.push(`Tenggat: ${state.deadlineText} WITA`)
        lines.push('')
        lines.push(`Sudah lapor (${done.length}):`)
        lines.push(done.length ? done.map((r) => `✅ ${r.name}`).join('\n') : '  -')
        lines.push('')
        lines.push(`Belum lapor (${due.length}):`)
        lines.push(due.length ? due.map((p) => `❌ ${displayName(db, p.id, jidToNumber(p.id))}`).join('\n') : '  -')

        parts.push({ gid, lines, mentions: due.map((p) => p.id) })
      }

      if (parts.length === 0) {
        return reply(sock, m, 'Tidak ada grup yang dapat diakses.')
      }

      for (const r of parts) {
        await sendMention(sock, r.gid, r.lines.join('\n'), r.mentions, m.jid === r.gid ? m : undefined)
      }
    },
  },
]