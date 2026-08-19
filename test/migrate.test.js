import { test } from 'node:test'
import assert from 'node:assert/strict'
import { G1, cleanup } from './helpers.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { migrateData } from '../src/migrate.js'

db.load()

test.after(() => cleanup())

test('preset: tanpa pengaturan jadwal -> grup terdaftar dapat 2xsebulan 11:30 (sekali saja)', async () => {
  db.clear('settings')
  db.clear('reports')
  db.clear('flags')
  db.set('meta', 'groups', [G1])
  db.del('meta', 'preset_done')

  migrateData()

  assert.deepEqual(time.groupSchedule(G1), { cadence: 'semimonthly', deadline: '11:30' })
  assert.equal(db.get('meta', 'preset_done', false), true, 'penanda preset dibuat')

  db.clear('settings')
  db.set('meta', 'groups', [G1])
  migrateData()

  assert.equal(time.groupSchedule(G1).cadence, 'daily', 'kembali ke bawaan, tidak di-preset ulang')

  db.clear('settings')
  time.setGroupSchedule(G1, null)
})

test('preset: tanpa grup terdaftar -> tidak dijalankan, data tetap kosong', async () => {
  db.clear('settings')
  db.set('meta', 'groups', [])
  db.del('meta', 'preset_done')

  migrateData()

  assert.deepEqual(db.get('settings', 'groups', {}), {}, 'tidak ada jadwal dibuat')
  assert.equal(db.get('meta', 'preset_done', false), false, 'penanda preset tidak dibuat')
  assert.equal(time.groupSchedule(G1).cadence, 'daily', 'default tetap')
})
