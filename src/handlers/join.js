import { reply, registerGroup, joinGroupByInvite, leaveGroup, groupMeta } from '../bot.js'
import * as db from '../db.js'

const JOIN_MSG = (name = '') =>
  `Berhasil bergabung ke grup${name ? ` *${name}*` : ''}.\nGrup otomatis terdaftar. Anggota tinggal kirim !bantuan untuk melihat cara lapor.`

export default [
  {
    name: 'join',
    aliases: ['gabung', 'masuk', 'autojoin'],
    permission: 'admin',
    async run(sock, m, { bot }) {
      if (!m.args) {
        return reply(
          sock, m,
          'Gunakan: !join <link atau kode undangan>\nContoh: !join https://chat.whatsapp.com/AbCdEfGh1234567',
        )
      }
      if (!bot.inviteCodeFromLink(m.args)) {
        return reply(sock, m, 'Link tidak valid. Contoh: https://chat.whatsapp.com/AbCdEfGh1234567')
      }

      try {
        const gid = await joinGroupByInvite(sock, m.args)
        registerGroup(gid)

        const joined = db.get('joined_invites', 'list', [])
        const code = bot.inviteCodeFromLink(m.args)
        if (!joined.includes(code)) {
          joined.push(code)
          db.set('joined_invites', 'list', joined)
        }

        let subject = ''
        try {
          subject = (await groupMeta(sock, gid, true)).subject || ''
        } catch {
          subject = ''
        }
        return reply(sock, m, JOIN_MSG(subject))
      } catch (err) {
        console.error(`[join] Gagal bergabung:`, err?.message)
        return reply(sock, m, 'Gagal bergabung: link tidak valid, sudah kedaluwarsa, atau hak akses tidak memungkinkan.')
      }
    },
  },
  {
    name: 'leave',
    aliases: ['keluar'],
    permission: 'admin',
    async run(sock, m, { db }) {
      if (!m.isGroup) {
        return reply(sock, m, 'Kirim !leave di dalam grup yang ingin ditinggalkan bot.')
      }
      try {
        const groups = db.get('meta', 'groups', []).filter((g) => g !== m.jid)
        db.set('meta', 'groups', groups)
        await leaveGroup(sock, m.jid)
        return reply(sock, m, 'Bot meninggalkan grup ini. Sampai jumpa!')
      } catch (err) {
        console.error(`[leave] Gagal keluar dari ${m.jid}:`, err?.message)
        return reply(sock, m, 'Gagal keluar dari grup. Coba lagi atau keluarkan bot secara manual dari info grup.')
      }
    },
  },
  {
    name: 'grup',
    aliases: ['groups', 'daftargrup'],
    permission: 'admin',
    async run(sock, m, { db, bot }) {
      const groups = db.get('meta', 'groups', [])
      if (groups.length === 0) {
        return reply(sock, m, 'Belum ada grup yang terdaftar. Tambahkan bot ke grup atau gunakan !join <link>.')
      }
      const lines = ['*Grup Terdaftar*', '']
      for (const gid of groups) {
        let label = gid
        try {
          const meta = await groupMeta(sock, gid, true)
          label = meta.subject || gid
        } catch {
          label = `${gid} (tidak dapat diakses)`
        }
        lines.push(`- ${label}`)
      }
      lines.push('', `Total: ${groups.length} grup`)
      return reply(sock, m, lines.join('\n'))
    },
  },
]