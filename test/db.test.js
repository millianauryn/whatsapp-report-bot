import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'db-test-'))
process.env.BOT_DATA_FILE = path.join(dir, 'data.json')

const { load, get, set, del, clear, save } = await import('../src/db.js')

test('load: file kosong/belum ada -> dibuat', () => {
  load()
  assert.equal(get('reports', '2026-08-17', null), null)
  assert.ok(existsSync(process.env.BOT_DATA_FILE))
})

test('set/get/del: siklus penyimpanan dasar', () => {
  set('reports', '2026-08-17', { a: 1 })
  assert.deepEqual(get('reports', '2026-08-17'), { a: 1 })
  assert.equal(get('reports', 'tidak-ada', 'fallback'), 'fallback')
  del('reports', '2026-08-17')
  assert.equal(get('reports', '2026-08-17', null), null)
})

test('persistensi: tersimpan ke file, terbaca setelah load ulang', () => {
  set('names', '6281111@s.whatsapp.net', 'Budi')
  const raw = JSON.parse(readFileSync(process.env.BOT_DATA_FILE, 'utf8'))
  assert.equal(raw.collections.names['6281111@s.whatsapp.net'], 'Budi')
})

test('clear: koleksi dikosongkan', () => {
  set('flags', 'x', { y: 1 })
  clear('flags')
  assert.equal(get('flags', 'x', 'ada'), 'ada')
})

test('restart data: isi file lama tetap setelah load() baru', () => {
  const prev = readFileSync(process.env.BOT_DATA_FILE, 'utf8')
  load()
  const raw = JSON.parse(readFileSync(process.env.BOT_DATA_FILE, 'utf8'))
  assert.ok(prev.length > 0)
  assert.deepEqual(raw.collections, JSON.parse(prev).collections)
})

test.after(() => rmSync(dir, { recursive: true, force: true }))