import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as time from '../src/time.js'

test('parseDeadline: format valid', () => {
  const p = time.parseDeadline('Jumat 21:00')
  assert.deepEqual(p, { day: 4, hour: 21, minute: 0 })
  assert.deepEqual(time.parseDeadline('sabtu 12:30'), { day: 5, hour: 12, minute: 30 })
  assert.deepEqual(time.parseDeadline('monday 08:15'), { day: 0, hour: 8, minute: 15 })
})

test('parseDeadline: format invalid -> null', () => {
  assert.equal(time.parseDeadline(''), null)
  assert.equal(time.parseDeadline('Jumat'), null)
  assert.equal(time.parseDeadline('Jumat 25:00'), null)
  assert.equal(time.parseDeadline('Jumat 21:99'), null)
  assert.equal(time.parseDeadline('HariX 21:00'), null)
  assert.equal(time.parseDeadline('21:00'), null)
})

test('periodId: Senin = awal minggu (WITA)', () => {
  // Rabu 19 Agu 2026 00:30 UTC = 08:30 WITA -> minggu 17-23 Agu
  assert.equal(time.periodId(new Date('2026-08-19T00:30:00.000Z')), '2026-08-17')
  // Senin 17 Agu 2026 01:00 WITA (17 Agu 2026 17:00 UTC sebelumnya) -> tetap minggu 17
  assert.equal(time.periodId(new Date('2026-08-16T17:00:00.000Z')), '2026-08-17')
})

test('formatRange: rentang Senin-Minggu', () => {
  const r = time.formatRange('2026-08-17')
  assert.match(r, /17/)
  assert.match(r, /23/)
})

test('deadlineState: tenggat + jendela, null untuk format invalid', () => {
  const anchor = new Date('2026-08-19T00:00:00.000Z') // dalam minggu 17 Agu (WITA)
  const st = time.deadlineState(anchor, 'Jumat 21:00')
  assert.ok(st, 'state harus ada')
  // Jumat 21:00 WITA = Jumat 13:00 UTC
  assert.equal(new Date(st.instant).toISOString(), '2026-08-21T13:00:00.000Z')
  // Minggu 24:00 = Senin 00:00 WITA berikutnya = Minggu 16:00 UTC
  assert.equal(new Date(st.weekEnd).toISOString(), '2026-08-23T16:00:00.000Z')
  assert.equal(time.deadlineState(anchor, 'tidak valid'), null)
})

test('isAfterDeadline: sebelum vs sesudah tenggat', () => {
  // Kamis 20 Agu 2026 10:00 UTC (18:00 WITA) -> sebelum Jumat 21:00 WITA
  assert.equal(time.isAfterDeadline(new Date('2026-08-20T10:00:00.000Z')), false)
  // Jumat 21 Agu 2026 15:00 UTC (23:00 WITA) -> sesudah
  assert.equal(time.isAfterDeadline(new Date('2026-08-21T15:00:00.000Z')), true)
})

test('formatDeadline: rapi dari berbagai format', () => {
  assert.equal(time.formatDeadline('sabtu 8:05'), 'Sabtu 08:05')
  assert.equal(time.formatDeadline('Jumat 21:00'), 'Jumat 21:00')
  assert.equal(time.formatDeadline('tidak valid'), 'tidak valid', 'invalid dikembalikan apa adanya')
})