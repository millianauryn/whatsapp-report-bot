import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, chmodSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { initAuthCreds } from '@whiskeysockets/baileys'

/**
 * State auth Baileys yang aman & sederhana:
 * - SEMUA kredensial disimpan dalam 1 file terenkripsi (AES-256-GCM).
 * - Kunci sesi (auth.key, mode 600) di dalam folder auth — folder mandiri,
 *   aman dipindah; HANYA auth.key yang harus disisihkan saat backup.
 * - Folder auth mode 700, file mode 600.
 * - File rusak / kunci salah / belum ada -> login baru (creds kosong).
 */
const SESSION_FILE = 'session.enc'
const KEY_FILE = 'auth.key'
const ALGO = 'aes-256-gcm'

function encrypt(json, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(json), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

function decrypt(b64, key) {
  const buf = Buffer.from(b64, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, key, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  const data = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()])
  return JSON.parse(data.toString('utf8'))
}

/** Kunci 32 byte: buat otomatis bila belum ada (mode 600), di dalam folder auth. */
function ensureKey(authDir) {
  const keyFile = path.join(authDir, KEY_FILE)
  if (existsSync(keyFile)) return readFileSync(keyFile)
  const key = crypto.randomBytes(32)
  writeFileSync(keyFile, key, { mode: 0o600 })
  console.log(`[auth] Kunci sesi dibuat: ${keyFile} (mode 600)`)
  return key
}

function saveEncrypted(authDir, key, payload) {
  mkdirSync(authDir, { recursive: true, mode: 0o700 })
  chmodSync(authDir, 0o700)
  const target = path.join(authDir, SESSION_FILE)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, encrypt(payload, key), { mode: 0o600 })
  renameSync(tmp, target)
}

/** JSON.stringify mengubah Buffer jadi {type:'Buffer',data:[...]} — kembalikan jadi Buffer. */
function revertBuffers(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(revertBuffers)
  if (obj.type === 'Buffer' && Array.isArray(obj.data)) return Buffer.from(obj.data)
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = revertBuffers(v)
  return out
}

function loadEncrypted(authDir, key) {
  try {
    return revertBuffers(decrypt(readFileSync(path.join(authDir, SESSION_FILE), 'utf8'), key))
  } catch {
    return null
  }
}

/** KeyStore Baileys di atas satu objek keys di memori. */
function makeKeyStore(keys) {
  return {
    async get(type, ids) {
      const out = {}
      for (const id of ids || []) out[id] = keys[type]?.[id]
      return out
    },
    async set(data) {
      for (const [type, entries] of Object.entries(data)) {
        keys[type] = keys[type] || {}
        for (const [id, value] of Object.entries(entries)) keys[type][id] = value
      }
    },
    all() {
      return keys
    },
  }
}

/**
 * Ganti useMultiFileAuthState: state + saveCreds dengan penyimpanan
 * terenkripsi 1 file. Dipakai createBot (lihat src/bot.js).
 */
export async function useEncryptedAuthState(authDir) {
  const dir = path.resolve(authDir)
  const key = ensureKey(dir)

  let creds, keys
  const saved = loadEncrypted(dir, key)
  if (saved) {
    creds = saved.creds
    keys = saved.keys || {}
    console.log(`[auth] Sesi dimuat dari ${SESSION_FILE}`)
  } else {
    creds = initAuthCreds()
    keys = {}
    console.log('[auth] Tidak ada sesi tersimpan — login baru (QR/pairing)')
  }

  const store = makeKeyStore(keys)
  const saveCreds = () => saveEncrypted(dir, key, { creds, keys: store.all() })
  return { state: { creds, keys: store }, saveCreds }
}