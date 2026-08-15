import { groupMeta, botJidOf, nonReporters, sendText, registerGroup } from '../bot.js'

/** DM pengingat ke peserta yang belum lapor, saat mendekati tenggat (1x per periode). */
export default {
  name: 'reminder',
  async run(now, { db, time, config, sock }) {
    const period = time.periodId(now)
    const flags = db.get('flags', period, {})
    if (flags.reminderSent) return

    const state = time.deadlineState(now)
    if (!state) return

    const windowStart = state.instant - config.reminder_minutes_before * 60_000
    const t = now.getTime()
    if (t < windowStart || t >= state.instant) return

    const sockObj = sock()
    if (!sockObj) return

    const range = time.formatRange(period)
    const deadlineText = state.deadlineText
    const groups = db.get('meta', 'groups', [])

    for (const gid of groups) {
      let meta
      try {
        meta = await groupMeta(sockObj, gid)
        registerGroup(gid)
      } catch {
        continue
      }
      const reports = db.get('reports', period, {})
      const due = nonReporters(botJidOf(sockObj), meta, reports)
      if (due.length === 0) continue

      for (const p of due) {
        const name = db.get('names', p.id, '') || ''
        const text = [
          `Pengingat Laporan - ${range}`,
          '',
          `Halo${name ? ` ${name}` : ''}, kamu belum mengirim laporan minggu ini.`,
          `Tenggat: ${deadlineText} WITA.`,
          '',
          'Kirim laporanmu di grup dengan format:',
          '!lapor <nama> - <keterangan> (keterangan boleh kosong)',
        ].join('\n')
        try {
          await sendText(sockObj, p.id, text)
        } catch (err) {
          console.error(`[reminder] Gagal DM ${p.id}:`, err?.message)
        }
      }
    }

    flags.reminderSent = true
    db.set('flags', period, flags)
    console.log(`[reminder] DM pengingat terkirim untuk periode ${period}`)
  },
}