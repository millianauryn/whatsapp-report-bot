import { test } from 'node:test'
import assert from 'node:assert/strict'
import { G1, G2, cleanup } from './helpers.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { migrateData } from '../src/migrate.js'

db.load()

test.after(() => cleanup())

test('preset: tanpa pengaturan jadwal -> grup terdaftar dapat 2xsebulan 11:30', () => {
  db.clear('settings')
  db.clear('reports')
  db.clear('flags')
  db.set('meta', 'groups', [G1])

  migrateData()

  assert.deepEqual(time.groupSchedule(G1), { cadence: 'semimonthly', deadline: '11:30', summary_time: undefined })
})

test('preset: idempoten + jadwal custom grup tidak disentuh', () => {
  db.clear('settings')
  db.set('meta', 'groups', [G1])
  time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })

  migrateData()

  assert.deepEqual(time.groupSchedule(G1), { cadence: 'weekly', deadline: 'Jumat 21:00', summary_time: undefined }, 'jadwal custom dipertahankan')
  
  db.clear('settings')
  db.set('meta', 'groups', [G1])
  migrateData()

  assert.deepEqual(time.groupSchedule(G1), { cadence: 'semimonthly', deadline: '11:30', summary_time: undefined }, 'pengaturan hilang -> preset kembali')

  time.setGroupSchedule(G1, null)
})

test('preset: grup baru yang bergabung setelahnya ikut dipreset', () => {
  db.clear('settings')
  db.set('meta', 'groups', [G1])
  time.setGroupSchedule(G1, { cadence: 'weekly', deadline: 'Jumat 21:00' })
  migrateData()

  db.set('meta', 'groups', [G1, G2])
  migrateData()

  assert.deepEqual(time.groupSchedule(G1), { cadence: 'weekly', deadline: 'Jumat 21:00', summary_time: undefined }, 'yang sudah punya jadwal tetap')
  assert.deepEqual(time.groupSchedule(G2), { cadence: 'semimonthly', deadline: '11:30', summary_time: undefined }, 'grup baru dapat preset')

  db.clear('settings')
  time.setGroupSchedule(G1, null)
  time.setGroupSchedule(G2, null)
})

test('preset: tanpa grup terdaftar -> tidak dijalankan, data tetap kosong', () => {
  db.clear('settings')
  db.set('meta', 'groups', [])

  migrateData()

  assert.deepEqual(db.get('settings', 'groups', {}), {}, 'tidak ada jadwal dibuat')
  assert.equal(time.groupSchedule(G1).cadence, 'daily', 'default tetap')
})