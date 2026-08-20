import * as db from './db.js'

/**
 * Preset jadwal 2xsebulan 11:30 untuk grup terdaftar yang belum punya jadwal.
 * Idempoten: setiap koneksi terbuka, grup baru tanpa jadwal ikut dipreset.
 */
export function migrateData() {
  const groups = db.get('meta', 'groups', [])
  if (groups.length === 0) return
  const all = db.get('settings', 'groups', {})
  let added = 0
  for (const gid of groups) {
    if (!all[gid]) {
      all[gid] = { cadence: 'semimonthly', deadline: '11:30' }
      added++
    }
  }
  if (added > 0) {
    db.set('settings', 'groups', all)
    console.log(`[migrate] preset jadwal 2xsebulan 11:30 untuk ${added} grup`)
  }
}