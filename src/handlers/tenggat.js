import { reply, isController } from '../bot.js'

const USAGE = '!tenggat <hari> <jam:menit>'
const EXAMPLE = 'Contoh: !tenggat Jumat 21:00 atau !tenggat sabtu 12:30'

export default [
  {
    name: 'tenggat',
    aliases: ['deadline', 'batas'],
    permission: 'admin',
    async run(sock, m, { db, time }) {
      if (!m.isGroup) {
        const groups = db.get('meta', 'groups', [])
        if (!(await isController(sock, groups, m.sender))) {
          return reply(sock, m, 'Perintah ini hanya bisa digunakan di dalam grup, atau oleh admin grup via DM.')
        }
      }

      if (!m.args) {
        return reply(
          sock, m,
          `Tenggat saat ini: ${time.formatDeadline()} WITA\nUbah dengan: ${USAGE}`,
        )
      }

      if (!time.parseDeadline(m.args)) {
        return reply(
          sock, m,
          `Format salah. Gunakan: ${USAGE}\n${EXAMPLE}`,
        )
      }

      const period = time.periodId(new Date())
      db.set('deadline', 'override', m.args)
      db.set('flags', period, {})

      return reply(
        sock, m,
        `Tenggat diubah menjadi ${time.formatDeadline()} WITA. Berlaku real-time untuk periode ini.`,
      )
    },
  },
  {
    name: 'reset',
    aliases: ['mulai', 'resetlapor', 'hapuslapor'],
    permission: 'admin',
    async run(sock, m, { db, time }) {
      const period = time.periodId(new Date())
      const reports = db.get('reports', period, {})

      if (m.args) {
        const q = m.args.toLowerCase().trim()
        const digits = q.replace(/\D/g, '')
        const matches = Object.entries(reports).filter(([jid, r]) => {
          const name = (r.name || '').toLowerCase()
          const stored = (db.get('names', jid, '') || '').toLowerCase()
          const num = jid.split('@')[0]
          return name === q || name.includes(q) || stored === q || stored.includes(q) || (digits && num.includes(digits))
        })
        if (matches.length === 0) {
          return reply(sock, m, `Tidak ada laporan yang cocok dengan "${m.args}". Cek dengan !status.`)
        }
        for (const [jid] of matches) delete reports[jid]
        db.set('reports', period, reports)
        const names = matches.map(([, r]) => r.name).join(', ')
        return reply(sock, m, `Laporan berikut direset: ${names}\nYang bersangkutan bisa kirim !lapor lagi.`)
      }

      db.del('reports', period)
      db.del('flags', period)
      return reply(sock, m, 'Periode baru dimulai. Laporan dan penanda pengingat periode ini sudah direset.')
    },
  },
]