/**
 * Bersihkan data periode lama per grup (dijalankan tiap tick):
 * hapus laporan & flag untuk semua periode yang bukan periode aktif grup itu.
 * Di periode gap (2xsebulan/bulanan) data cycle yang sudah lewat ikut dibersihkan.
 */
export default {
  name: 'periodReset',
  async run(now, { db, time }) {
    const groups = db.get('meta', 'groups', [])

    for (const gid of groups) {
      const state = time.scheduleState(now, time.groupSchedule(gid))
      const current = state ? state.periodId : null

      for (const p of db.keys('reports')) {
        if (p === current) continue
        const byGroup = db.get('reports', p, {})
        if (!byGroup[gid]) continue
        delete byGroup[gid]
        if (Object.keys(byGroup).length === 0) db.del('reports', p)
        else db.set('reports', p, byGroup)
        console.log(`[periodReset] ${gid}: laporan periode ${p} dibersihkan`)
      }

      for (const p of db.keys('flags')) {
        if (p === current) continue
        const f = db.get('flags', p, {})
        let changed = false
        for (const k of Object.keys(f)) {
          if (k.startsWith(`${gid}:`)) {
            delete f[k]
            changed = true
          }
        }
        if (changed) {
          if (Object.keys(f).length === 0) db.del('flags', p)
          else db.set('flags', p, f)
          console.log(`[periodReset] ${gid}: flag periode ${p} dibersihkan`)
        }
      }
    }
  },
}