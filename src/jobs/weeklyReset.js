/** Menyiapkan periode baru otomatis setiap Senin 00:00 WITA: bersihkan data periode lama. */
export default {
  name: 'weeklyReset',
  async run(now, { db, time }) {
    const period = time.periodId(now)
    const last = db.get('meta', 'lastPeriod', null)

    if (last === null) {
      db.set('meta', 'lastPeriod', period)
      return
    }

    if (last !== period) {
      db.del('reports', last)
      db.del('flags', last)
      db.set('meta', 'lastPeriod', period)
      console.log(`[weeklyReset] Periode baru dimulai: ${period} (${time.formatRange(period)})`)
    }
  },
}