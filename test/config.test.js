import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateConfig } from '../src/config.js'

test('config valid: semua nilai diterima apa adanya', () => {
  const c = validateConfig({
    deadline: 'Jumat 21:00',
    timezone: 'Asia/Makassar',
    reminder_minutes_before: 60,
    check_interval_seconds: 30,
    exclude_admins: true,
    auto_join_groups: ['https://chat.whatsapp.com/abc'],
  })
  assert.equal(c.deadline, 'Jumat 21:00')
  assert.equal(c.timezone, 'Asia/Makassar')
  assert.equal(c.reminder_minutes_before, 60)
  assert.equal(c.check_interval_seconds, 30)
  assert.equal(c.exclude_admins, true)
  assert.deepEqual(c.auto_join_groups, ['https://chat.whatsapp.com/abc'])
})

test('config 0/negatif/teks: diperbaiki otomatis', () => {
  const c = validateConfig({ reminder_minutes_before: 0, check_interval_seconds: 0 })
  assert.equal(c.reminder_minutes_before, 60, '0 menit = reminder mati senyap -> 60')
  assert.equal(c.check_interval_seconds, 30, 'interval 0 -> 30')
  assert.equal(validateConfig({ reminder_minutes_before: -5 }).reminder_minutes_before, 60)
  assert.equal(validateConfig({ reminder_minutes_before: 'abc' }).reminder_minutes_before, 60)
  assert.equal(validateConfig({ check_interval_seconds: 2 }).check_interval_seconds, 30, 'di bawah 10 -> 30')
})

test('config deadline invalid: diperbaiki ke Jumat 21:00', () => {
  assert.equal(validateConfig({ deadline: 'Jumat' }).deadline, 'Jumat 21:00')
  assert.equal(validateConfig({ deadline: '25:99' }).deadline, 'Jumat 21:00')
  assert.equal(validateConfig({ deadline: '' }).deadline, 'Jumat 21:00')
})

test('config deadline valid: jam/menit batas diperiksa', () => {
  assert.equal(validateConfig({ deadline: 'sabtu 23:59' }).deadline, 'sabtu 23:59')
  assert.equal(validateConfig({ deadline: 'Minggu 00:00' }).deadline, 'Minggu 00:00')
  assert.equal(validateConfig({ deadline: 'Jumat 24:00' }).deadline, 'Jumat 21:00', 'jam 24 tidak valid')
  assert.equal(validateConfig({ deadline: 'Jumat 21:60' }).deadline, 'Jumat 21:00', 'menit 60 tidak valid')
  assert.equal(validateConfig({ deadline: 'HariX 21:00' }).deadline, 'Jumat 21:00', 'hari tidak dikenal')
})

test('config timezone invalid: diperbaiki ke Asia/Makassar', () => {
  assert.equal(validateConfig({ timezone: 'jakarta' }).timezone, 'Asia/Makassar')
  assert.equal(validateConfig({ timezone: 'UTC' }).timezone, 'UTC')
})

test('config default kosong: fallback standar', () => {
  const c = validateConfig({})
  assert.equal(c.deadline, 'Jumat 21:00')
  assert.equal(c.timezone, 'Asia/Makassar')
  assert.equal(c.reminder_minutes_before, 60)
  assert.equal(c.check_interval_seconds, 30)
  assert.equal(c.exclude_admins, true, 'default true (admin tidak wajib lapor)')
  assert.deepEqual(c.auto_join_groups, [])
})