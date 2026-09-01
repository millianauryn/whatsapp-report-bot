import { reply, groupMeta, botJidOf, nonReporters, sendText, memberParticipants, reportListLines, getBotIdentifiers } from '../bot.js'

export default [
  {
    name: 'check',
    aliases: ['ingatkan', 'pengingat'],
    permission: 'all',
    async run(sock, m, { db, time }) {
      const now = new Date()
      const groupIds = m.isGroup ? [m.jid] : db.get('meta', 'groups', [])
      if (groupIds.length === 0) {
        return reply(sock, m, 'Belum ada grup yang terdaftar. Tambahkan bot ke grup lewat link undangan yang diizinkan (config.allowed_group_links).')
      }

      const { pn: myJid, lid: botLid } = getBotIdentifiers(sock)
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
            : 'Periode belum dibuka. Cek jadwal dengan !check.')
          parts.push({ gid, lines })
          continue
        }

        const reports = db.get('reports', state.periodId, {})[gid] || {}
        const due = nonReporters(myJid, meta, reports, botLid)
        const memberIds = new Set(memberParticipants(meta, myJid, botLid).map((p) => p.id))
        const done = Object.entries(reports)
          .filter(([jid]) => memberIds.has(jid))
          .map(([, r]) => r)

        lines.push(`*Cek Laporan - Periode ${state.periodLabel}*`)
        lines.push(`Jadwal: ${time.describeSchedule(schedule)}`)
        lines.push(`Tenggat: ${state.deadlineText} WITA`)
        lines.push('')
        lines.push(...reportListLines(done, due, db, 'Sudah lapor', { pn: myJid, lid: botLid }))

        parts.push({ gid, lines })
      }

      if (parts.length === 0) {
        return reply(sock, m, 'Tidak ada grup yang dapat diakses.')
      }

      for (const r of parts) {
        // List saja, tanpa mention dan tanpa DM.
        await sendText(sock, r.gid, r.lines.join('\n'), m.jid === r.gid ? m : undefined)
      }
    },
  },
]