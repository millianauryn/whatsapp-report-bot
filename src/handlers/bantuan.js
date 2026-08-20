import { reply } from '../bot.js'

export default [
  {
    name: 'bantuan',
    aliases: ['help', 'menu'],
    permission: 'all',
    async run(sock, m) {
      const lines = [
        '*Bantuan Bot Laporan*',
        '',
        'Jadwal laporan grup ini: 2x sebulan, otomatis.',
        '',
        '!lapor <nama>',
        '  Kirim laporanmu (cukup nama)',
        '  Contoh: !lapor Budi Santoso',
        '',
        '!check',
        '  (Admin) Lihat list siapa yang sudah/belum lapor',
        '',
        '!bantuan',
        '  Tampilkan bantuan ini',
        '',
        '*Otomatis:* kamu akan menerima DM pengingat pas jam tenggat,',
        'dan DM pemberitahuan setelah tenggat lewat bila belum lapor.',
        '',
        '*Admin:* !lapor dan !check juga bisa dikirim dari DM (private chat) ke bot.',
      ]
      return reply(sock, m, lines.join('\n'))
    },
  },
]