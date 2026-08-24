import { reply, isController, groupMeta } from '../bot.js'

const USAGE = '!lapor <nama>'
const EXAMPLE = 'Contoh: !lapor Budi Santoso'

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
  if (existing) return { ok: false, reason: 'duplicate', existing }

  const parsed = parseLapor(msg.args)
  const late = now.getTime() >= state.instant

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
      if (!m.isGroup) {
        const groups = db.get('meta', 'groups', [])
        // !lapor boleh semua orang di grup, tapi dari DM hanya pengendali (admin).
        if (!(await isController(sock, groups, m.sender))) {
          return reply(sock, m, 'Perintah ini hanya bisa digunakan di dalam grup, atau oleh admin grup via DM.')
        }

        const parsed = parseLapor(m.args)
        if (!parsed) {
          return reply(sock, m, `Format salah. Gunakan: ${USAGE}\n${EXAMPLE}`)
        }

        const results = []
        for (const gid of groups) {
          const res = await submitOne(sock, m, ctx, gid)
          if (!res.ok) continue
          let label = gid
          try {
            label = (await groupMeta(sock, gid, true)).subject || gid
          } catch {
            /* label fallback */
          }
          results.push({ label, res })
        }

        if (results.length === 0) {
          return reply(sock, m, 'Periode laporan sedang tidak dibuka di grup mana pun. Cek jadwal dengan !check.')
        }
        const out = [
          `Laporan diterima di ${results.length} grup:`,
          ...results.map(({ label }) => `- ${label}`),
        ].join('\n')
        return reply(sock, m, out)
      }

      const parsed = parseLapor(m.args)
      if (!parsed) {
        return reply(sock, m, `Format salah. Gunakan: ${USAGE}\n${EXAMPLE}`)
      }

      const res = await submitOne(sock, m, ctx, m.jid)
      if (!res.ok) {
        if (res.reason === 'duplicate') {
          return reply(
            sock, m,
            `Kamu sudah mengirim laporan periode ini: ${res.existing.name}\nSatu laporan per periode. Hubungi admin bila perlu penggantian.`,
          )
        }
        const schedule = time.groupSchedule(m.jid)
        const next = time.nextPeriodInfo(new Date(), schedule)
        return reply(
          sock, m,
          next
            ? `Periode laporan saat ini belum dibuka.\nJadwal berikutnya: ${next.periodLabel} (tenggat ${next.deadlineText} WITA).`
            : 'Periode laporan saat ini belum dibuka. Cek jadwal dengan !check.',
        )
      }

      const nameMismatch = res.pushName && res.name.toLowerCase() !== res.pushName.toLowerCase()
      let out = `Laporan diterima, terima kasih ${res.name}!`
      if (nameMismatch) {
        out += `\n\n(Catatan: nama tidak sama dengan nama WhatsApp kamu "${res.pushName}". Laporan tetap dicatat.)`
      }
      return reply(sock, m, out)
    },
  },
]