import { reply, isController } from '../bot.js'

const USAGE = '!lapor <nama> - <keterangan>'
const EXAMPLE = 'Contoh: !lapor Budi Santoso - Menyelesaikan laporan mingguan\nKeterangan boleh dikosongkan: !lapor Budi Santoso'

export function parseLapor(text) {
  const m = text.match(/^([\s\S]*?)\s*-\s*([\s\S]+)$/)
  if (m) {
    const name = m[1].trim()
    const detail = m[2].trim()
    if (name && detail) return { name, detail }
  }
  const name = text.trim().replace(/\s*-\s*$/, '')
  if (!name) return null
  return { name, detail: '' }
}

export default [
  {
    name: 'lapor',
    aliases: ['laporkan', 'report'],
    permission: 'all',
    async run(sock, m, { db, time }) {
      if (!m.isGroup) {
        const groups = db.get('meta', 'groups', [])
        if (!(await isController(sock, groups, m.sender))) {
          return reply(sock, m, 'Perintah ini hanya bisa digunakan di dalam grup, atau oleh admin grup via DM.')
        }
      }

      const parsed = parseLapor(m.args)
      if (!parsed) {
        return reply(sock, m, `Format salah. Gunakan: ${USAGE}\n${EXAMPLE}`)
      }

      const period = time.periodId(new Date())
      const reports = db.get('reports', period, {})
      const existing = reports[m.sender]

      if (existing) {
        return reply(
          sock, m,
          `Kamu sudah mengirim laporan minggu ini:\n"${existing.text}"\nSatu laporan per minggu. Hubungi admin bila perlu penggantian.`,
        )
      }

      const nameMismatch = m.pushName && parsed.name.toLowerCase() !== m.pushName.toLowerCase()
      const late = time.isAfterDeadline(new Date())

      reports[m.sender] = {
        name: parsed.name,
        text: parsed.detail,
        time: new Date().toISOString(),
        late,
      }
      db.set('reports', period, reports)
      // Simpan nama dari laporan agar nama di !check cocok dengan nama tersimpan.
      if (db.get('names', m.sender, '') !== parsed.name) {
        db.set('names', m.sender, parsed.name)
      }

      let out = `Laporan diterima, terima kasih ${parsed.name}!`
      if (parsed.detail) {
        out += `\nKeterangan: ${parsed.detail}`
      }
      if (nameMismatch) {
        out += `\n\n(Catatan: nama tidak sama dengan nama WhatsApp kamu "${m.pushName}". Laporan tetap dicatat.)`
      }
      if (late) {
        out += `\n\n[TERLAMBAT] Laporan dikirim setelah tenggat (${time.formatDeadline()} WITA).`
      }
      return reply(sock, m, out)
    },
  },
]