import { groupMeta, botJidOf, nonReporters, sendText } from '../bot.js'

/**
 * DM pengingat ke peserta yang belum lapor, per grup:
 * - cadence biasa: N menit sebelum tenggat (config.reminder_minutes_before)
 * - 2xsebulan: PERSIS jam tenggat (reminder pas 11:30, alert menyusul 1 menit kemudian)
 */
export default {
  name: 'reminder',
  async run(now, { db, time, config, sock }) {
    const sockObj = sock()
    if (!sockObj) return
    const myJid = botJidOf(sockObj)
    const groups = db.get('meta', 'groups', [])

    for (const gid of groups) {
      const schedule = time.groupSchedule(gid)
      const state = time.scheduleState(now, schedule)
      if (!state) continue

      const flags = db.get('flags', state.periodId, {})
      const flagKey = `${gid}:reminder`
      if (flags[flagKey]) continue

      const t = now.getTime()
      const inWindow = state.reminderAtInstant
        ? (t >= state.instant && t < state.instant + 60_000)
        : (t >= state.instant - config.reminder_minutes_before * 60_000 && t < state.instant)
      if (!inWindow) continue

      let meta
      try {
        meta = await groupMeta(sockObj, gid)
      } catch {
        continue
      }

      const reports = db.get('reports', state.periodId, {})[gid] || {}
      const due = nonReporters(myJid, meta, reports)
      if (due.length === 0) continue

      for (const p of due) {
        const name = db.get('names', p.id, '') || ''
        const text = [
          `Pengingat Laporan - ${state.periodLabel}`,
          '',
          `Halo${name ? ` ${name}` : ''}, kamu belum mengirim laporan untuk periode ini.`,
          `Tenggat: ${state.deadlineText} WITA.`,
          '',
          'Kirim laporanmu di grup dengan format:',
          '!lapor <nama>',
        ].join('\n')
        try {
          await sendText(sockObj, p.id, text)
        } catch (err) {
          console.error(`[reminder] Gagal DM ${p.id}:`, err?.message)
        }
      }

      flags[flagKey] = true
      db.set('flags', state.periodId, flags)
      console.log(`[reminder] DM pengingat terkirim ${gid} periode ${state.periodId}`)
    }
  },
}