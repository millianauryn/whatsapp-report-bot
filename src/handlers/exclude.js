import { config } from '../config.js'

/** Toggle exclude_admins: admin ikut/diluar daftar belum lapor & DM reminder. */
export default [
  {
    name: 'exclude',
    aliases: ['ex adm'],
    permission: 'all',
    async run(sock, m) {
      const was = config.exclude_admins
      config.exclude_admins = !was
      const now = config.exclude_admins ? 'ADMIN DIKECUALI' : 'ADMIN DITAMPILKAN'
      return reply(sock, m, `✅ ${now}\n(config.exclude_admins: ${config.exclude_admins})`)
    },
  },
]