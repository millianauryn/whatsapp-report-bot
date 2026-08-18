import { appendFileSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOG_DIR = path.join(__dirname, '..')
const KEEP_DAYS = 7

const pad = (n) => String(n).padStart(2, '0')

function stamp() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function logFile() {
  return path.join(LOG_DIR, `bot.log.${new Date().toISOString().slice(0, 10)}`)
}

function write(line) {
  try {
    appendFileSync(logFile(), `${stamp()} ${line}\n`)
  } catch {
    /* jangan sampai kegagalan logging menghentikan bot */
  }
}

/** Mirror semua console.log/error/warn ke bot.log.<tanggal>, simpan 7 hari. */
export function initLogger() {
  const origLog = console.log
  const origError = console.error
  const origWarn = console.warn

  console.log = (...a) => {
    origLog(...a)
    write(a.map(String).join(' '))
  }
  console.error = (...a) => {
    origError(...a)
    write(`ERROR ${a.map(String).join(' ')}`)
  }
  console.warn = (...a) => {
    origWarn(...a)
    write(`WARN ${a.map(String).join(' ')}`)
  }

  try {
    const now = Date.now()
    for (const f of readdirSync(LOG_DIR)) {
      if (!f.startsWith('bot.log.')) continue
      const m = f.match(/bot\.log\.(\d{4}-\d{2}-\d{2})/)
      if (m && now - new Date(m[1]).getTime() > KEEP_DAYS * 86_400_000) {
        unlinkSync(path.join(LOG_DIR, f))
      }
    }
  } catch {
    /* bersihkan arsip: opsional */
  }

  write('=== bot start ===')
  origLog(`[logger] Logging ke file aktif: bot.log.<tanggal> (simpan ${KEEP_DAYS} hari)`)
}