import { groupMeta, botJidOf, nonReporters, sendText, getBotIdentifiers, resolveLidsToPns, queueGroupMention, reportListLines, memberParticipants } from '../bot.js'
import { getReminderMode } from '../time.js'

/**
 * DM pengingat ke peserta yang belum lapor, per grup:
 * - cadence biasa: N menit sebelum tenggat (config.reminder_minutes_before)
 * - 2xsebulan: PERSIS jam tenggat (reminder pas 11:30, alert menyusul 1 menit kemudian)
 */
export default {
  name: 'reminder',
  async run(now, { db, time, config, sock }) {
    console.log(`[reminder] tick ${now.toISOString()} groups=${db.get('meta','groups',[]).length}`)
    const sockObj = sock()
    if (!sockObj) { console.log('[reminder] no sock'); return }
    const { pn: myJid, lid: botLid } = getBotIdentifiers(sockObj)
    const groups = db.get('meta', 'groups', [])

    for (const gid of groups) {
      const schedule = time.groupSchedule(gid)
      const state = time.scheduleState(now, schedule)
      if (!state) { console.log(`[reminder] no state for ${gid} schedule`, schedule); continue }

      const flags = db.get('flags', state.periodId, {})
      const flagKey = `${gid}:reminder:${state.deadlineText}`
      if (flags[flagKey]) { console.log(`[reminder] flag exists ${flagKey}`); continue }

      const t = now.getTime()
      const reminderMode = time.getReminderMode(schedule, config)
      const inWindow = reminderMode === 'at_deadline'
        ? (t >= state.instant && t < state.instant + 60_000)
        : (t >= state.instant - config.reminder_minutes_before * 60_000 && t < state.instant)
      console.log(`[reminder] Checking ${gid}: mode=${reminderMode}, inWindow=${inWindow}, deadline=${state.deadlineText} now=${new Date(t).toISOString()} instant=${new Date(state.instant).toISOString()}`)
      if (!inWindow) continue

      let meta
      try {
        meta = await groupMeta(sockObj, gid)
      } catch {
        continue
      }

      const reports = db.get('reports', state.periodId, {})[gid] || {}
      const due = nonReporters(myJid, meta, reports, botLid)
      console.log(`[reminder] ${gid}: ${due.length} users due:`, due.map(p => p.id))
      if (due.length === 0) continue

      // Resolve LIDs to PNs for DM delivery
      const lids = due.map(p => p.id)
      console.log(`[reminder] Resolving LIDs:`, lids)
      const resolvedPns = await resolveLidsToPns(sockObj, lids)
      console.log(`[reminder] Resolved PNs:`, resolvedPns)

      // Get member IDs for filtering done
      const memberIds = new Set(memberParticipants(meta, myJid).map((p) => p.id))
      const done = Object.entries(reports)
        .filter(([jid]) => memberIds.has(jid))
        .map(([, r]) => r)

      let allSent = true
      for (const p of due) {
        const name = db.get('names', p.id, '') || ''
        const custom = db.get('settings', 'reminderDmText', '')
        const defaultText = [
          `Pengingat Laporan - ${state.periodLabel}`,
          '',
          `Halo${name ? ` ${name}` : ''}, kamu belum mengirim laporan untuk periode ini.`,
          `Tenggat: ${state.deadlineText} WITA.`,
          '',
          'Kirim laporanmu di grup dengan format:',
          '!lapor <nama>',
        ].join('\n')
        const template = custom || defaultText
        const text = template
          .replaceAll('{nama}', name ? ` ${name}` : '')
          .replaceAll('{tenggat}', state.deadlineText)
          .replaceAll('{periode}', state.periodLabel)
        const targetJid = resolvedPns[p.id] || p.id
        console.log(`[reminder] Sending to ${p.id} -> ${targetJid}`)
        try {
          await sendText(sockObj, targetJid, text)
          console.log(`[reminder] DM sent to ${targetJid}`)
        } catch (err) {
          console.error(`[reminder] Gagal DM ${p.id} -> ${targetJid}:`, err?.message)
          // Fallback: queue group mention
          if (err.message.includes('463') || err.message.includes('account restricted')) {
            await queueGroupMention(gid, p.id, text)
            console.log(`[reminder] Queued group mention fallback for ${p.id}`)
          }
          allSent = false
        }
      }

      // Only set flag if all DMs succeeded
      if (allSent) {
        flags[flagKey] = true
        db.set('flags', state.periodId, flags)
        console.log(`[reminder] DM pengingat terkirim ${gid} periode ${state.periodId}`)
        
        // Send group summary after successful DMs
        try {
          const summaryLines = reportListLines(done, due, db, 'Sudah lapor', { pn: myJid, lid: botLid })
          const summaryHeader = `*Pengingat Laporan - ${state.periodLabel}*\nJadwal: ${time.describeSchedule(schedule)}\nTenggat: ${state.deadlineText} WITA\n`
          await sendText(sockObj, gid, summaryHeader + '\n' + summaryLines.join('\n'))
          console.log(`[reminder] Summary terkirim ke grup ${gid}`)
        } catch (err) {
          console.error(`[reminder] Gagal kirim summary ke grup ${gid}:`, err?.message)
        }
      } else {
        console.log(`[reminder] Beberapa DM gagal, flag tidak diset untuk retry ${gid}`)
      }
    }
  },
}