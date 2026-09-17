import { isController, groupMeta, isGroupAdmin, sendText, botJidOf, extractText, reply } from '../bot.js'
import { config } from '../config.js'

const USAGE = '!lapor <nama>'
const EXAMPLE = 'Contoh: !lapor PBJ budi'

/** Nama saja. */
export function parseLapor(text) {
  const name = text.trim()
  if (!name) return null
  return { name, detail: '' }
}

async function submitOne(sock, msg, { db, time }, gid) {
  const now = new Date()
  const schedule = time.groupSchedule(gid)
  const state = time.scheduleState(now, schedule)
  if (!state) return { ok: false, reason: 'closed', schedule }

  const byGroup = db.get('reports', state.periodId, {})
  const reports = byGroup[gid] || (byGroup[gid] = {})
  const existing = reports[msg.sender]
  if (existing) return { ok: false, reason: 'duplicate' }

  const parsed = parseLapor(msg.args)
  const late = false

  reports[msg.sender] = {
    name: parsed.name,
    text: parsed.detail,
    time: now.toISOString(),
    late,
  }
  db.set('reports', state.periodId, byGroup)
  if (!db.get('names', msg.sender, '')) {
    db.set('names', msg.sender, parsed.name)
  }
  return { ok: true, state, late, name: parsed.name, pushName: msg.pushName }
}

export default [
  {
    name: 'lapor',
    aliases: ['laporkan', 'report'],
    permission: 'all',
    async run(sock, m, ctx) {
      const { db, time } = ctx

      // === MASUK GRUP ===
      if (m.isGroup) {
        // Cek apakah pengirim admin grup
        const isBotAdmin = await isController(sock, db.get('meta', 'groups', []), m.sender)
        if (!isBotAdmin) {
          // Bukan admin grup — cek cycle semimonthly
          const now = new Date()
          const schedule = time.groupSchedule(m.jid)
          const state = time.scheduleState(now, schedule)
          if (!state) {
            // Di luar cycle 1-4 & 15-18 -> notifikasi tapi izinkan lapor
            return reply(sock, m, `⏸️ Bot sedang tidak aktif di luar cycle semimonthly.\nCycle aktif: hari 1-4 & 15-18 setiap bulan. Laporan tetap bisa dikirim.`)
          }
        }
        // Jika admin atau sudah lewat cek cycle, lanjut proses

        // Parse input
        const parsed = parseLapor(m.args)
        if (!parsed) {
          // Format salah -> diam di group (hindari spam)
          return
        }

        // Jalankan submit laporan
        const res = await submitOne(sock, m, ctx, m.jid)

        // Jika gagal (duplikat) -> diam total, kirim ke owner bot saja
        if (!res.ok) {
          if (res.reason === 'duplicate') {
            // Duplicate jangan kirim balasan di group sama sekali
          }
          // Jika periode tutup atau error lain -> diam total
          return
        }

        // === KIRIM LAPORAN KE OWNER BOT via DM ===
        const botJid = botJidOf(sock)
        await sendText(sock, botJid, `Laporan diterima, terima kasih ${res.name}!`)
        if (res.pushName && res.name.toLowerCase() !== res.pushName.toLowerCase()) {
          await sendText(sock, botJid, `\n\n(Catatan: nama tidak sama dengan nama WhatsApp kamu "${res.pushName}". Laporan tetap dicatat.)`)
        }

        // Balasan di GRUP DIAKTIFKAN TIDAK (silent)
        return
      }

      // === MASUK DM (private chat) ===
      if (!m.isGroup) {
        // Dari DM, hanyalah controller/admin yang bisa lapor
        if (!(await isController(sock, db.get('meta', 'groups', []), m.sender))) {
          return // diam, bukan controller
        }

        const parsed = parseLapor(m.args)
        if (!parsed) {
          return // format salah, diam
        }

        const res = await submitOne(sock, m, ctx, m.jid)
        if (!res.ok) {
          if (res.reason === 'duplicate') {
            return // duplicate, diam
          }
          return // error, diam
        }

        // Kirim konfirmasi ke owner bot
        const botJid = botJidOf(sock)
        await sendText(sock, botJid, `Laporan diterima, terima kasih ${res.name}!`)
        if (res.pushName && res.name.toLowerCase() !== res.pushName.toLowerCase()) {
          await sendText(sock, botJid, `\n\n(Catatan: nama tidak sama dengan nama WhatsApp kamu "${res.pushName}". Laporan tetap dicatat.)`)
        }
        return
      }
    },
  },
  {
    name: 'manual-lapor',
    aliases: ['lapor-manual', 'mlapor'],
    permission: 'all',
    async run(sock, m, ctx) {
      const { db, time } = ctx

      // Hanya bisa dipakai di grup yang dikonfigurasi
      const allowedGroup = config.manual_lapor_group
      if (allowedGroup && m.jid !== allowedGroup) {
        return // tidak dipakai di grup ini, diam total
      }

      // Argumen: !manual-lapor <gid_target> <lid_user> <nama> [tanggal]
      const rawArgs = (m.args || '').trim()
      if (!rawArgs) {
        return reply(sock, m, `❌ Format salah. Gunakan:\n!manual-lapor <gid_target> <lid_user> <nama> [tanggal]`)
      }

      // Parse parts
      const parts = rawArgs.split(/\s+/).filter((p) => p)
      if (parts.length < 3) {
        return reply(sock, m, `❌ Format salah. Gunakan:\n!manual-lapor <gid_target> <lid_user> <nama> [tanggal]\nContoh:\n!manual-lapor 120363146493532165@g.us 204247287226396@lid PBJ Budi`)
      }

      let targetGid = parts[0]
      let targetLid = parts[1]

      // Auto-normalisasi GID
      if (!targetGid.includes('@')) {
        targetGid = `${targetGid}@g.us`
      }

      // Auto-normalisasi LID
      if (!targetLid.includes('@')) {
        targetLid = `${targetLid}@lid`
      }

      // Validasi format
      if (!targetGid.endsWith('@g.us')) {
        return reply(sock, m, `❌ Target grup harus ID grup WhatsApp (@g.us). Contoh: 120363146493532165@g.us`)
      }

      // Opsional: tanggal (argumen terakhir jika format tanggal valid YYYY-MM-DD atau ISO)
      const lastPart = parts[parts.length - 1]
      const dateRegex = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?$/
      let isDate = false
      let manualDate = ''
      let nameParts = parts.slice(2)

      if (parts.length >= 4 && dateRegex.test(lastPart)) {
        isDate = true
        manualDate = lastPart
        nameParts = parts.slice(2, parts.length - 1)
      }

      const name = nameParts.join(' ').trim()
      if (!name) {
        return reply(sock, m, `❌ Nama pengguna tidak boleh kosong.`)
      }

      // Tentukan timestamp
      let timestamp
      if (isDate && manualDate) {
        const dateMatch = manualDate.match(dateRegex)
        if (!dateMatch) {
          return reply(sock, m, `❌ Format tanggal salah. Gunakan YYYY-MM-DD atau YYYY-MM-DDTHH:mm:ss`)
        }
        const datePart = dateMatch[1]
        const timePart = dateMatch[2] || '00:00:00'
        const [y, month, d] = datePart.split('-').map(Number)
        const timeSegments = timePart.split(':').map(Number)
        const h = timeSegments[0] || 0
        const min = timeSegments[1] || 0
        const s = timeSegments[2] || 0
        timestamp = new Date(Date.UTC(y, month - 1, d, h, min, s)).toISOString()
      } else {
        timestamp = new Date().toISOString()
      }

      // Tentukan periodId berdasarkan jadwal grup target
      const targetSchedule = time.groupSchedule(targetGid)
      const refDate = new Date(timestamp)
      const state = time.scheduleState(refDate, targetSchedule)

      // Fallback periodId jika di luar cycle
      let periodIdVal
      if (state) {
        periodIdVal = state.periodId
      } else {
        const f = time.localFields(refDate)
        if (targetSchedule.cadence === 'semimonthly') {
          const startDay = f.day <= 15 ? 1 : 15
          periodIdVal = `${f.year}-${String(f.month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`
        } else if (targetSchedule.cadence === 'daily') {
          periodIdVal = time.dayKey(refDate)
        } else if (targetSchedule.cadence === 'weekly') {
          periodIdVal = time.periodId(refDate)
        } else {
          periodIdVal = `${f.year}-${String(f.month).padStart(2, '0')}`
        }
      }

      // Cek duplikat: apakah user sudah lapor di periode ini
      const byGroup = db.get('reports', periodIdVal, {})
      const reports = byGroup[targetGid] || (byGroup[targetGid] = {})
      if (reports[targetLid]) {
        return reply(sock, m, `⚠️ User *${name}* sudah tercatat lapor di grup *${targetGid}* untuk periode *${periodIdVal}*.`)
      }

      // Simpan laporan manual ke database
      reports[targetLid] = {
        name,
        text: '',
        time: timestamp,
        late: false,
      }
      db.set('reports', periodIdVal, byGroup)

      // Simpan nama ke names jika belum ada
      if (!db.get('names', targetLid, '')) {
        db.set('names', targetLid, name)
      }

      // Konfirmasi ke grup manual
      const dateDisplay = isDate ? manualDate : 'sekarang'
      return reply(sock, m, `✅ Laporan *${name}* berhasil diinput ke grup *${targetGid}*\n📅 Periode: ${periodIdVal}\n⏰ Waktu: ${dateDisplay}\n\nData sudah masuk dan akan tampil di *!check* serta summary deadline.`)
    },
  },
]