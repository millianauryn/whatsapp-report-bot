import * as db from './db.js'
import { groupMeta } from './bot.js'

/**
 * Migrasi data lama -> model per grup (dijalankan sekali saat login):
 * 1) reports flat { periode: { jid: laporan } } -> { periode: { gid: { jid: laporan } } }
 * 2) deadline.override (global) -> jadwal mingguan untuk semua grup terdaftar
 * 3) flags lama dihapus (transien, akan dihitung ulang) + meta.lastPeriod dihapus
 */
export async function migrateData(sock) {
  const groups = db.get('meta', 'groups', [])

  const override = db.get('deadline', 'override', null)
  if (override) {
    const all = db.get('settings', 'groups', {})
    let changed = false
    for (const gid of groups) {
      if (!all[gid]) {
        all[gid] = { cadence: 'weekly', deadline: override }
        changed = true
      }
    }
    if (changed) {
      db.set('settings', 'groups', all)
      console.log(`[migrate] deadline global -> jadwal mingguan untuk ${groups.length} grup terdaftar`)
    }
    db.del('deadline', 'override')
  }

  for (const period of db.keys('reports')) {
    const value = db.get('reports', period, {})
    const first = Object.values(value)[0]
    const isFlat = first && typeof first === 'object' && !first[groups[0]] && 'name' in first
    if (!isFlat) continue

    const nested = {}
    if (groups.length === 1) {
      nested[groups[0]] = value
    } else {
      const metas = new Map()
      for (const gid of groups) {
        try {
          metas.set(gid, await groupMeta(sock, gid, true))
        } catch {
          continue
        }
      }
      const memberGroups = new Map()
      for (const [gid, meta] of metas) {
        for (const p of meta.participants || []) {
          const list = memberGroups.get(p.id) || []
          list.push(gid)
          memberGroups.set(p.id, list)
        }
      }
      for (const [jid, rep] of Object.entries(value)) {
        for (const gid of memberGroups.get(jid) || []) {
          nested[gid] = nested[gid] || {}
          nested[gid][jid] = rep
        }
      }
    }
    db.set('reports', period, nested)
    console.log(`[migrate] laporan periode ${period} dipindah ke model per grup (${Object.keys(nested).length} grup)`)
  }

  if (db.keys('flags').length > 0) {
    db.clear('flags')
    console.log('[migrate] flags lama dibersihkan')
  }
  db.del('meta', 'lastPeriod')

  // Preset jadwal: keputusan pertama tentang jadwal grup = 2xsebulan 11:30
  // (dilakukan SEKALI saja; penanda meta.preset_done mencegah override
  //  bila pemilik memilih !tenggat default di kemudian hari).
  if (!db.get('meta', 'preset_done', false) && groups.length > 0) {
    const all = db.get('settings', 'groups', {})
    if (Object.keys(all).length === 0) {
      for (const gid of groups) all[gid] = { cadence: 'semimonthly', deadline: '11:30' }
      db.set('settings', 'groups', all)
      console.log(`[migrate] preset jadwal 2xsebulan 11:30 untuk ${groups.length} grup terdaftar`)
    }
    db.set('meta', 'preset_done', true)
  }
}
