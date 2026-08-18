import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { useEncryptedAuthState } from '../src/authState.js'

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'auth-'))
  return dir
}

test('simpan lalu muat ulang: creds & keys sama persis', async () => {
  const dir = tempDir()
  const { state, saveCreds } = await useEncryptedAuthState(dir)
  state.creds.me = { id: '6285391863505@s.whatsapp.net' }
  state.creds.noiseKey = { private: Buffer.from('rahasia'), public: Buffer.from('publik') }
  await state.keys.set({ 'pre-key': { id1: 'value1', id2: { private: Buffer.from('pk1'), public: Buffer.from('pk2') } } })
  saveCreds()

  const sessFile = path.join(dir, 'session.enc')
  assert.ok(existsSync(sessFile), 'session.enc harus ada')
  const raw = readFileSync(sessFile, 'utf8')
  assert.ok(!raw.includes('value1'), 'isi sesi tidak boleh plaintext')

  const again = await useEncryptedAuthState(dir)
  assert.equal(again.state.creds.me.id, '6285391863505@s.whatsapp.net')
  assert.ok(Buffer.isBuffer(again.state.creds.noiseKey.private), 'Buffer di creds harus utuh setelah dimuat')
  assert.ok(Buffer.isBuffer(again.state.creds.noiseKey.public), 'Buffer public di creds harus utuh')
  assert.equal((await again.state.keys.get('pre-key', ['id1'])).id1, 'value1')
  const id2 = (await again.state.keys.get('pre-key', ['id2'])).id2
  assert.ok(Buffer.isBuffer(id2.private), 'Buffer di keys harus utuh setelah dimuat')
  assert.ok(Buffer.isBuffer(id2.public))
})

test('kunci dibuat otomatis dengan mode 600', async () => {
  const dir = tempDir()
  await useEncryptedAuthState(dir)
  const keyFile = path.join(dir, 'auth.key')
  assert.ok(existsSync(keyFile), 'auth.key harus dibuat')
  assert.equal(readFileSync(keyFile).length, 32, 'kunci harus 32 byte')
  assert.equal(statSync(keyFile).mode & 0o777, 0o600, 'mode harus 600')
})

test('kunci salah -> login baru (creds kosong)', async () => {
  const dir = tempDir()
  const { state, saveCreds } = await useEncryptedAuthState(dir)
  state.creds.me = { id: 'x' }
  saveCreds()

  const keyFile = path.join(dir, 'auth.key')
  writeFileSync(keyFile, Buffer.alloc(32, 7))

  const again = await useEncryptedAuthState(dir)
  assert.equal(again.state.creds.me, undefined, 'harus mulai dari nol')
})

test('file sesi korup -> login baru, tidak crash', async () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, 'session.enc'), 'sampah bukan base64')
  const { state } = await useEncryptedAuthState(dir)
  assert.equal(state.creds.me, undefined)
})