import { reply, groupMeta, botJidOf, nonReporters, sendText, memberParticipants, reportListLines, getBotIdentifiers } from '../bot.js'
import { config } from '../config.js'

export default [
  {
    name: 'check',
    aliases: ['ingatkan', 'pengingat'],
    permission: 'all',
    async run(sock, m, { db, time }) {
      const now = new Date()
      const centerGroup = config.manual_lapor_group
      const isCenterGroup = m.isGroup && m.jid === centerGroup

      // Jika dari grup center: periksa SEMUA grup terdaftar
      // Jika dari grup lain: periksa HANYA grup tersebut
      // Jika dari DM: periksa SEMUA grup
      const allGroups = db.get('meta', 'groups', [])
      const groupIds = isCenterGroup 
        ? allGroups
        : (m.isGroup ? [m.jid] : allGroups)

      if (groupIds.length === 0) {
        return reply(sock, m, 'Belum ada grup yang terdaftar. Tambahkan bot ke grup lewat link undangan yang diizinkan (config.allowed_group_links).')
      }

      const { pn: myJid, lid: botLid } = getBotIdentifiers(sock)
      const parts = []

      for (const gid of groupIds) {
        let meta = null
        try {
          meta = await groupMeta(sock, gid, true)
        } catch (e) {
          // Fallback jika gagal fetch metadata grup
          meta = { subject: gid, participants: [] }
        }

        const schedule = time.groupSchedule(gid)
        const state = time.scheduleState(now, schedule)
        const lines = []
        
        const groupTitle = meta?.subject ? `${meta.subject} (${gid.split('@')[0]})` : gid
        lines.push(`*📋 Grup: ${groupTitle}*`)
        lines.push('')

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
        const due = meta ? nonReporters(myJid, meta, reports, botLid) : []
        
        // Ambil semua yang sudah lapor dari database (termasuk input manual)
        const done = Object.entries(reports).map(([jid, r]) => ({
          jid,
          name: r.name || db.get('names', jid, '') || jid.split('@')[0],
          late: r.late
        }))

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

      if (isCenterGroup) {
        // Jika dari grup center, gabungkan semua hasil dan kirim HANYA ke grup center
        const fullMessage = parts.map(p => p.lines.join('\n')).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n')
        await reply(sock, m, fullMessage)
      } else {
        // Kirim ke masing-masing grup seperti biasa
        for (const r of parts) {
          await sendText(sock, r.gid, r.lines.join('\n'), m.jid === r.gid ? m : undefined)
        }
      }
    },
  },
]