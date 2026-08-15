import qrcode from 'qrcode-terminal'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { config } from './src/config.js'
import * as db from './src/db.js'
import * as time from './src/time.js'
import * as bot from './src/bot.js'
import { loadCommands, loadJobs } from './src/registry.js'
import { startScheduler } from './src/scheduler.js'

const COMMAND_PREFIX = '!'
const LOCK_FILE = 'bot.lock'

/** Cegah dua instance bot berjalan bersamaan (penyebab konflik sesi WhatsApp). */
function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const pid = Number(readFileSync(LOCK_FILE, 'utf8'))
      if (pid > 0 && isProcessAlive(pid)) {
        console.error(`[lock] Instance bot lain masih berjalan (PID ${pid}).`)
        console.error('[lock] Hentikan dulu, lalu jalankan ulang.')
        process.exit(1)
      }
      console.warn(`[lock] File lock basi (PID ${pid} tidak aktif), diambil alih.`)
    } catch (err) {
      console.warn('[lock] File lock tidak dapat dibaca, ditimpa.')
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid))
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

function releaseLock() {
  try {
    if (Number(readFileSync(LOCK_FILE, 'utf8')) === process.pid) unlinkSync(LOCK_FILE)
  } catch {
    /* file lock sudah tidak ada */
  }
}

function normalizePhone(phone) {
  let digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`
  return digits
}

/** Gabung otomatis ke grup-grup di config.auto_join_groups (dicek 1x per link). */
async function processAutoJoin(sock) {
  const links = config.auto_join_groups || []
  if (links.length === 0) return

  const done = db.get('joined_invites', 'list', [])
  const logger = async (link, ok, extra = '') => {
    console.log(`[autojoin] ${ok ? 'OK' : 'GAGAL'} ${link}${extra ? ` - ${extra}` : ''}`)
  }

  for (const link of links) {
    const code = bot.inviteCodeFromLink(link)
    if (!code) {
      await logger(link, false, 'link tidak dikenali')
      continue
    }
    if (done.includes(code)) {
      await logger(link, true, 'sudah pernah diproses')
      continue
    }
    try {
      const gid = await bot.joinGroupByInvite(sock, link)
      bot.registerGroup(gid)
      done.push(code)
      db.set('joined_invites', 'list', done)
      await logger(link, true, `masuk grup ${gid}`)
    } catch (err) {
      await logger(link, false, err?.message || 'link tidak valid/kedaluwarsa')
    }
  }
}

async function main() {
  acquireLock()

  db.load()

  const commands = await loadCommands()
  const jobs = await loadJobs()

  console.log('[bot] Bot Laporan WhatsApp dimulai...')
  console.log(`[bot] Zona waktu: ${config.timezone} | Tenggat default: ${config.deadline}`)
  console.log('[bot] Ctrl+C untuk berhenti')

  const appCtx = {
    config,
    db,
    time,
    bot,
    commands,
  }

  const botHandle = await bot.createBot({
    onQr(qr) {
      console.log('\n[bot] Scan QR berikut dengan WhatsApp pada nomor bot:\n')
      qrcode.generate(qr, { small: true })
      console.log('\n[bot] Atau gunakan: node index.js --pair <nomor> untuk kode pairing\n')
    },
    onOpen(sock) {
      console.log(`[bot] Login sebagai: ${bot.botJidOf(sock)}`)
      void processAutoJoin(sock)
    },
    onMessage(sock, m) {
      if (!m.message) return

      const jid = m.key.remoteJid
      const isGroup = jid.endsWith('@g.us')
      const sender = m.key.participant || jid
      const pushName = (m.pushName || '').trim()

      // Simpan nama & daftarkan grup untuk SEMUA pesan, bukan hanya perintah.
      if (pushName && db.get('names', sender, '') !== pushName) {
        db.set('names', sender, pushName)
      }
      if (isGroup) bot.registerGroup(jid)

      const text = bot.extractText(m)
      if (!text || !text.startsWith(COMMAND_PREFIX)) return

      // Pesan fromMe (dari HP nomor bot) hanya diproses bila berupa perintah.
      // Balasan yang dihasilkan bot tidak pernah diawali "!" sehingga aman dari loop.
      if (m.key?.fromMe) {
        const ownJid = bot.botJidOf(sock)
        const ownSender = m.key.participant || m.key.remoteJid
        if (ownSender !== ownJid) return
      }

      const rest = text.slice(COMMAND_PREFIX.length).trim()
      const [word, ...args] = rest.split(/\s+/)
      const cmd = commands.get(word.toLowerCase())
      if (!cmd) return

      const checkPermission = async () => {
        if (cmd.permission !== 'admin') return true
        if (sender === bot.botJidOf(sock)) return true
        if (!isGroup) {
          const groups = db.get('meta', 'groups', [])
          return bot.isController(sock, groups, sender)
        }
        const meta = await bot.groupMeta(sock, jid)
        return bot.isGroupAdmin(meta, sender)
      }

      const msg = {
        jid,
        isGroup,
        sender,
        pushName,
        key: m.key,
        message: m.message,
        args: args.join(' ').trim(),
      }

      checkPermission().then(async (ok) => {
        if (!ok) {
          await safeReply(sock, msg, 'Akses ditolak. Perintah ini hanya untuk admin grup.')
          return
        }
        try {
          await cmd.run(sock, msg, appCtx)
        } catch (err) {
          console.error(`[cmd] "${cmd.name}" error:`, err?.message)
          await safeReply(sock, msg, `Terjadi kesalahan: ${err?.message}`)
        }
      })
    },
  })

async function safeReply(sock, msg, text) {
  try {
    await bot.reply(sock, msg, text)
  } catch (err) {
    console.error('[cmd] Gagal mengirim balasan:', err?.message)
  }
}

  appCtx.sock = botHandle.getSock

  const intervalMs = config.check_interval_seconds * 1000
  startScheduler(intervalMs, jobs, appCtx)
  console.log(`[scheduler] Aktif, cek setiap ${config.check_interval_seconds} detik`)

  const pairIdx = process.argv.indexOf('--pair')
  if (pairIdx > -1) {
    const phone = process.argv[pairIdx + 1]
    if (phone) {
      const number = normalizePhone(phone)
      setTimeout(async () => {
        try {
          const code = await botHandle.getSock().requestPairingCode(number)
          console.log(`\n[bot] Kode pairing untuk ${number}: ${code}\n`)
        } catch (err) {
          console.error('[bot] Gagal meminta kode pairing:', err?.message)
        }
      }, 3_000)
    } else {
      console.log('[bot] Gunakan: node index.js --pair 6281234567890')
    }
  }
}

main().catch((err) => {
  console.error('[bot] Gagal startup:', err)
  process.exit(1)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[bot] ${sig} diterima, berhenti...`)
    releaseLock()
    process.exit(0)
  })
}

process.on('exit', releaseLock)

// Error tak terduga tidak boleh mematikan bot secara senyap.
process.on('unhandledRejection', (reason) => {
  console.error('[bot] Unhandled rejection:', reason instanceof Error ? reason.message : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[bot] Uncaught exception:', err?.message)
})