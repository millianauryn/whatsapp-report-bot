import qrcode from 'qrcode-terminal'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { config } from './src/config.js'
import * as db from './src/db.js'
import * as time from './src/time.js'
import * as bot from './src/bot.js'
import { commands, jobs } from './src/registry.js'
import { startScheduler } from './src/scheduler.js'
import { checkPermissionSafe } from './src/permissions.js'
import { migrateData } from './src/migrate.js'

import { healthServer } from './src/health.js'

const COMMAND_PREFIX = '!'

async function main() {

  db.load()
  console.log('[config] loaded groups', db.get('meta','groups',[]), 'settings', db.get('settings','groups',{}))

  console.log('[bot] Bot Laporan WhatsApp dimulai...')
  console.log(`[bot] Zona waktu: ${config.timezone} | Jadwal default: ${config.deadline}`)
  console.log('[bot] Ctrl+C untuk berhenti')

  const appCtx = {
    config,
    db,
    time,
  }

  const botHandle = await bot.createBot({
    onQr(qr) {
      console.log('\n[bot] Scan QR berikut dengan WhatsApp pada nomor bot:\n')
      qrcode.generate(qr, { small: true })
      console.log('\n[bot] Atau gunakan: node index.js --pair <nomor> untuk kode pairing\n')
    },
    onOpen: async (sock) => {
      console.log(`[bot] Login sebagai: ${bot.botJidOf(sock)}`)
      // Hanya grup dari link yang diizinkan yang di-join & dilayani; lalu preset jadwal.
      await bot.joinAllowedGroups(sock)
      migrateData()

      // Start health server after bot is connected
      healthServer.setWaConnected(true)
      await healthServer.start(
        () => botHandle.getSock(),
        () => db.get('meta', 'groups', [])
      )
    },
    onMessage: async (sock, m) => {
      if (!m.message) return

      const jid = m.key.remoteJid
      const isGroup = jid.endsWith('@g.us')

      // 🔒 BLOKIR TOTAL DM: Bot tidak menerima pesan/perintah apapun dari private chat
      if (!isGroup) return

      const sender = m.key.participant || jid

      // Hanya layani grup allowlist — invite manual = diam total (tanpa health update / capture)
      if (isGroup && !bot.shouldServeGroup(jid)) return

      // Update health check timestamp
      healthServer.updateLastMessageTime()

      // Di luar cycle (monthly/semimonthly): bot diam total, tidak merespons siapapun.
      if (isGroup && !time.isGroupActive(jid)) return

      const pushName = (m.pushName || '').trim()

      // Nama per nomor: nama dari !lapor selalu menang; nama WhatsApp hanya
      // mengisi bila belum ada nama tersimpan (tidak pernah menimpa).
      bot.captureName(db, sender, m.pushName)

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

      const msg = {
        jid,
        isGroup,
        sender,
        pushName,
        key: m.key,
        message: m.message,
        args: args.join(' ').trim(),
      }

      checkPermissionSafe(cmd, msg, sock).then(async (ok) => {
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
    onConnectionUpdate: (update) => {
      if (update.connection === 'open') {
        healthServer.setWaConnected(true)
        console.log('[health] WhatsApp connected')
      } else if (update.connection === 'close') {
        healthServer.setWaConnected(false)
        console.log('[health] WhatsApp disconnected:', update.lastDisconnect?.error?.message || 'unknown')
      }
    }
  })

async function safeReply(sock, msg, text) {
  try {
    await bot.sendText(sock, msg.jid, text)
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
      const digits = String(phone).replace(/\D/g, '')
      const number = digits.startsWith('0') ? `62${digits.slice(1)}` : digits
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
    process.exit(0)
  })
}

// Error tak terduga tidak boleh mematikan bot secara senyap.
process.on('unhandledRejection', (reason) => {
  console.error('[bot] Unhandled rejection:', reason instanceof Error ? reason.message : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[bot] Uncaught exception:', err?.message)
})