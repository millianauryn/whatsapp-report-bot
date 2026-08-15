import { reply, isController } from '../bot.js'

export default [
  {
    name: 'alert',
    aliases: ['notif', 'alerttenggat'],
    permission: 'admin',
    async run(sock, m, { db }) {
      if (!m.isGroup) {
        const groups = db.get('meta', 'groups', [])
        if (!(await isController(sock, groups, m.sender))) {
          return reply(sock, m, 'Perintah ini hanya bisa digunakan di dalam grup, atau oleh admin grup via DM.')
        }
      }

      const arg = m.args.toLowerCase()
      if (!arg) {
        const state = db.get('settings', 'alertEnabled', true)
        return reply(sock, m, `Alert tenggat saat ini: ${state ? 'NYALA' : 'MATI'}\nUbah dengan: !alert on / !alert off`)
      }

      if (arg === 'on') {
        db.set('settings', 'alertEnabled', true)
        return reply(sock, m, 'Alert tenggat otomatis: NYALA. DM pengingat akan dikirim ke yang belum lapor saat tenggat lewat.')
      }
      if (arg === 'off') {
        db.set('settings', 'alertEnabled', false)
        return reply(sock, m, 'Alert tenggat otomatis: MATI. Bot tidak akan mengirim DM/recap otomatis saat tenggat lewat. (Manual !check tetap berfungsi.)')
      }
      return reply(sock, m, 'Format salah. Gunakan: !alert on / !alert off')
    },
  },
  {
    name: 'alertdm',
    aliases: ['alertpesan', 'alerttext'],
    permission: 'admin',
    async run(sock, m, { db }) {
      if (!m.isGroup) {
        const groups = db.get('meta', 'groups', [])
        if (!(await isController(sock, groups, m.sender))) {
          return reply(sock, m, 'Perintah ini hanya bisa digunakan di dalam grup, atau oleh admin grup via DM.')
        }
      }

      const arg = m.args.trim()
      if (!arg) {
        const current = db.get('settings', 'alertDmText', '')
        return reply(
          sock, m,
          current
            ? `Teks DM alert saat ini:\n---\n${current}\n---\nUbah: !alertdm <teks> | Kembali ke bawaan: !alertdm reset`
            : 'Teks DM alert masih bawaan (default).\nUbah dengan: !alertdm <teks>\nVariabel: {nama}, {tenggat}, {periode}\nKembali ke bawaan: !alertdm reset',
        )
      }

      if (arg.toLowerCase() === 'reset') {
        db.del('settings', 'alertDmText')
        return reply(sock, m, 'Teks DM alert dikembalikan ke bawaan (default).')
      }

      db.set('settings', 'alertDmText', arg)
      return reply(sock, m, `Teks DM alert disimpan:\n---\n${arg}\n---\nVariabel yang tersedia: {nama}, {tenggat}, {periode}`)
    },
  },
]