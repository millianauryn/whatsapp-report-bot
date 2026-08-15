import { groupMeta, botJidOf, nonReporters, sendText, sendMention, registerGroup, memberParticipants } from '../bot.js'

/** DM ke yang belum lapor tepat saat tenggat lewat + ringkasan di grup (1x per periode). */
export default {
  name: 'deadlineAlert',
  async run(now, { db, time, sock }) {
    if (!db.get('settings', 'alertEnabled', true)) return

    const period = time.periodId(now)
    const flags = db.get('flags', period, {})
    if (flags.alertSent) return

    const state = time.deadlineState(now)
    if (!state) return

    const t = now.getTime()
    if (t < state.instant || t >= state.weekEnd) return

    // Kunci flag SEBELUM mengirim: jika ada kegagalan di tengah proses,
    // alert tidak akan dikirim ulang pada cek berikutnya (tetap 1x per periode).
    flags.alertSent = true
    db.set('flags', period, flags)
    console.log(`[deadlineAlert] Alert tenggat terkirim untuk periode ${period}`)

    const sockObj = sock()
    if (!sockObj) return

    const myJid = botJidOf(sockObj)
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
      const due = nonReporters(myJid, meta, reports)
      if (due.length === 0) continue

      const custom = db.get('settings', 'alertDmText', '')
      const defaultText = [
        `Tenggat Laporan Sudah Lewat - ${range}`,
        '',
        'Halo{nama}, kamu BELUM mengirim laporan dan tenggat ({tenggat} WITA) sudah lewat.',
        '',
        'Kamu masih bisa kirim laporan (akan ditandai terlambat):',
        '!lapor <nama> - <keterangan>',
      ].join('\n')
      const template = custom || defaultText

      for (const p of due) {
        const name = db.get('names', p.id, '') || ''
        const text = template
          .replaceAll('{nama}', name ? ` ${name}` : '')
          .replaceAll('{tenggat}', deadlineText)
          .replaceAll('{periode}', range)
        try {
          await sendText(sockObj, p.id, text)
        } catch (err) {
          console.error(`[deadlineAlert] Gagal DM ${p.id}:`, err?.message)
        }
      }

      const memberIds = new Set(memberParticipants(meta, myJid).map((p) => p.id))
      const done = Object.entries(reports)
        .filter(([jid]) => memberIds.has(jid))
        .map(([, r]) => r)
      try {
        await sendMention(
          sockObj, gid,
          [
            `*Tenggat Laporan Lewat - ${range}*`,
            `Tenggat: ${deadlineText} WITA`,
            '',
            `Sudah lapor (${done.length}):`,
            done.length ? done.map((r) => `✅ ${r.name}${r.late ? ' (terlambat)' : ''}`).join('\n') : '  -',
            '',
            `Belum lapor (${due.length}):`,
            due.length ? due.map((p) => `❌ ${db.get('names', p.id, '') || p.id.split('@')[0]}`).join('\n') : '  -',
            '',
            'DM pengingat sudah dikirim ke yang belum lapor.',
          ].join('\n'),
          due.map((p) => p.id),
        )
      } catch (err) {
        console.error(`[deadlineAlert] Gagal kirim recap di ${gid}:`, err?.message)
      }
    }
  },
}