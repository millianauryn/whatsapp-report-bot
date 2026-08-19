import * as db from './db.js'

/**
 * Preset jadwal 2xsebulan 11:30 untuk grup terdaftar — dijalankan SEKALI
 * (penanda meta.preset_done; dipanggil setiap koneksi terbuka).
 */
export function migrateData() {
  const groups = db.get('meta', 'groups', [])
  if (groups.length === 0 || db.get('meta', 'preset_done', false)) return
  const all = db.get('settings', 'groups', {})
  if (Object.keys(all).length === 0) {
    for (const gid of groups) all[gid] = { cadence: 'semimonthly', deadline: '11:30' }
    db.set('settings', 'groups', all)
    console.log(`[migrate] preset jadwal 2xsebulan 11:30 untuk ${groups.length} grup terdaftar`)
  }
  db.set('meta', 'preset_done', true)
}
