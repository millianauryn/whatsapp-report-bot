import { groupMeta, botJidOf, nonReporters, sendText, sendMention, memberParticipants, reportListLines } from '../bot.js'

function recapLines(state, done, due, db, header, cadenceLabel, doneLabel = 'Sudah lapor') {
  return [
    header,
    `Jadwal: ${cadenceLabel}`,
    `Tenggat: ${state.deadlineText} WITA`,
    '',
    ...reportListLines(done, due, db, doneLabel),
  ]
}

/**
 * Per grup, 3 jenis event (semua 1x, terkunci dengan flag):
 * - alert: tenggat lewat (DM ke yang belum lapor + recap grup). Untuk 2xsebulan
 *   menyusul 1 menit setelah reminder yang dikirim pas jam tenggat.
 * - summary harian: jam 17:00 tiap hari selama cycle (khusus 2xsebulan).
 * - summary terakhir: 23:58 di hari terakhir periode (2xsebulan & bulanan).
 */
export default {
  name: 'deadlineAlert',
  async run(now, { db, time, sock }) {
    if (!db.get('settings', 'alertEnabled', true)) return

    const sockObj = sock()
    if (!sockObj) return
    const myJid = botJidOf(sockObj)
    const groups = db.get('meta', 'groups', [])
    const day = time.dayKey(now)
    const t = now.getTime()

    for (const gid of groups) {
      const schedule = time.groupSchedule(gid)
      const state = time.scheduleState(now, schedule)
      if (!state) continue

      const flags = db.get('flags', state.periodId, {})
      const cadenceLabel = time.describeSchedule(schedule)

      // Prioritas jendela sempit dulu (summary 17:00 & summary akhir), lalu alert.
      let event = null
      if (state.hasDailySummary && state.days.includes(day) && !flags[`${gid}:summary:${day}`]) {
        const f = time.localFields(now)
        const s17 = time.realInstantOf(f.year, f.month, f.day, 17, 0)
        // Tepat 17:00 saja (1 menit); lewat tidak terkirim. Flag mengunci 1x/hari.
        if (t >= s17 && t < s17 + 60_000) event = { type: 'summary', flag: `${gid}:summary:${day}` }
      }
      if (!event && state.hasFinalSummary && !flags[`${gid}:final`]) {
        if (t >= state.periodEnd - 2 * 60_000 && t < state.periodEnd) event = { type: 'final', flag: `${gid}:final` }
      }
      if (!event && !flags[`${gid}:alert`]) {
        if (t >= state.instant + state.alertDelayMs && t < state.periodEnd) event = { type: 'alert', flag: `${gid}:alert` }
      }
      if (!event) continue

      let meta
      try {
        meta = await groupMeta(sockObj, gid)
      } catch {
        continue
      }

      const reports = db.get('reports', state.periodId, {})[gid] || {}
      const due = nonReporters(myJid, meta, reports)
      const memberIds = new Set(memberParticipants(meta, myJid).map((p) => p.id))
      const done = Object.entries(reports)
        .filter(([jid]) => memberIds.has(jid))
        .map(([, r]) => r)

      // Kunci flag SEBELUM mengirim: kegagalan di tengah tidak akan mengirim ulang.
      flags[event.flag] = true
      db.set('flags', state.periodId, flags)
      console.log(`[deadlineAlert] ${event.type} ${gid} periode ${state.periodId}`)

      if (event.type === 'alert') {
        const custom = db.get('settings', 'alertDmText', '')
        const defaultText = [
          `Tenggat Laporan Sudah Lewat - ${state.periodLabel}`,
          '',
          'Halo{nama}, kamu BELUM mengirim laporan dan tenggat ({tenggat} WITA) sudah lewat.',
          '',
          'Kamu masih bisa kirim laporan:',
          '!lapor <nama>',
        ].join('\n')
        const template = custom || defaultText
        for (const p of due) {
          const name = db.get('names', p.id, '') || ''
          const text = template
            .replaceAll('{nama}', name ? ` ${name}` : '')
            .replaceAll('{tenggat}', state.deadlineText)
            .replaceAll('{periode}', state.periodLabel)
          try {
            await sendText(sockObj, p.id, text)
          } catch (err) {
            console.error(`[deadlineAlert] Gagal DM ${p.id}:`, err?.message)
          }
        }
        const lines = recapLines(state, done, due, db, `*Tenggat Laporan Lewat - ${state.periodLabel}*`, cadenceLabel)
        lines.push('', 'DM pengingat sudah dikirim ke yang belum lapor.')
        try {
          await sendMention(sockObj, gid, lines.join('\n'), due.map((p) => p.id))
        } catch (err) {
          console.error(`[deadlineAlert] Gagal kirim recap di ${gid}:`, err?.message)
        }
        continue
      }

      const header = event.type === 'final'
        ? `*Summary Terakhir - ${state.periodLabel}*`
        : `*Summary Harian ${time.formatDateLabel(now)} - ${state.periodLabel}*`
      // Summary harian 17:00 = check otomatis per hari: hanya laporan HARI ITU yang ditampilkan.
      const isDaily = event.type === 'summary'
      const doneList = isDaily
        ? done.filter((r) => r.time && time.dayKey(new Date(r.time)) === day)
        : done
      const lines = recapLines(state, doneList, due, db, header, cadenceLabel, isDaily ? 'Sudah lapor hari ini' : undefined)
      if (event.type === 'final') {
        lines.push('', 'Periode berakhir malam ini (24:00 WITA).')
        // Cari jadwal berikutnya dari akhir periode (karena saat ini masih di hari terakhir)
        const next = time.nextPeriodInfo(new Date(state.periodEnd), schedule)
        if (next) lines.push(`Laporan berikutnya: ${next.periodLabel} (tenggat ${next.deadlineText} WITA).`)
      }
      try {
        // Check otomatis = list saja, tanpa mention.
        await sendText(sockObj, gid, lines.join('\n'))
      } catch (err) {
        console.error(`[deadlineAlert] Gagal kirim summary di ${gid}:`, err?.message)
      }
    }
  },
}