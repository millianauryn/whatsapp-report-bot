import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSock, G1, G2, MEMBER_A, MEMBER_B, cleanup } from './helpers.js'
import * as db from '../src/db.js'
import * as time from '../src/time.js'
import { migrateData } from '../src/migrate.js'

db.load()

test.after(() => cleanup())

test('migrate: reports flat -> per grup (1 grup terdaftar)', async () => {
  db.clear('reports')
  db.clear('flags')
  db.clear('settings')
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', {
    [MEMBER_A]: { name: 'Budi', text: 'x', time: '', late: false },
    [MEMBER_B]: { name: 'Dewi', text: 'x', time: '', late: false },
  })
  db.set('flags', '2026-08-17', { '2026-08-17:2026-08-21': true })
  db.set('deadline', 'override', 'Jumat 21:00')
  db.set('meta', 'lastPeriod', '2026-08-10')

  await migrateData(makeSock())

  assert.deepEqual(db.get('reports', '2026-08-17', {})[G1], {
    [MEMBER_A]: { name: 'Budi', text: 'x', time: '', late: false },
    [MEMBER_B]: { name: 'Dewi', text: 'x', time: '', late: false },
  })
  assert.deepEqual(time.groupSchedule(G1), { cadence: 'weekly', deadline: 'Jumat 21:00' }, 'override jadi jadwal grup')
  assert.equal(db.get('deadline', 'override', null), null)
  assert.equal(db.get('flags', '2026-08-17', null), null, 'flags lama dibersihkan')
  assert.equal(db.get('meta', 'lastPeriod', null), null)

  db.clear('settings')
  time.setGroupSchedule(G1, null)
})

test('migrate: multi grup -> laporan disalin ke grup sesuai keanggotaan', async () => {
  db.clear('reports')
  db.clear('flags')
  db.clear('settings')
  db.set('meta', 'groups', [G1, G2])
  // MEMBER_A ada di G1 & G2; MEMBER_B hanya di G1
  db.set('reports', '2026-08-17', {
    [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false },
    [MEMBER_B]: { name: 'B', text: 'x', time: '', late: false },
  })

  await migrateData(makeSock())

  const nested = db.get('reports', '2026-08-17', {})
  assert.ok(nested[G1][MEMBER_A], 'A di G1')
  assert.ok(nested[G1][MEMBER_B], 'B di G1')
  assert.ok(nested[G2][MEMBER_A], 'A di G2')
  assert.equal(nested[G2][MEMBER_B], undefined, 'B tidak di G2')

  db.clear('settings')
  time.setGroupSchedule(G1, null)
  time.setGroupSchedule(G2, null)
})

test('migrate: data sudah ter-nested -> tidak diubah', async () => {
  db.clear('reports')
  db.set('meta', 'groups', [G1])
  db.set('reports', '2026-08-17', {
    [G1]: { [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false } },
  })

  await migrateData(makeSock())

  assert.deepEqual(db.get('reports', '2026-08-17', {})[G1], {
    [MEMBER_A]: { name: 'A', text: 'x', time: '', late: false },
  })
})

test('preset: tanpa pengaturan jadwal -> grup terdaftar dapat 2xsebulan 11:30 (sekali saja)', async () => {
  db.clear('settings')
  db.clear('reports')
  db.clear('flags')
  db.set('meta', 'groups', [G1])
  db.del('meta', 'preset_done')

  await migrateData(makeSock())

  assert.deepEqual(time.groupSchedule(G1), { cadence: 'semimonthly', deadline: '11:30' })
  assert.equal(db.get('meta', 'preset_done', false), true, 'penanda preset dibuat')

  db.clear('settings')
  db.set('meta', 'groups', [G1])
  await migrateData(makeSock())

  assert.equal(time.groupSchedule(G1).cadence, 'daily', 'kembali ke bawaan, tidak di-preset ulang')

  db.clear('settings')
  time.setGroupSchedule(G1, null)
})