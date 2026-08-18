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
        '  Cycle 1-4 & 15-18 tiap bulan, tenggat tgl 3/17 jam 11:30.',
        '  Summary 17:00 tiap hari, summary terakhir 23:58, reset 24:00.',
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
        '*Otomatis:* kamu akan menerima DM pengingat sebelum tenggat,',
        'dan DM pemberitahuan setelah tenggat lewat bila belum lapor.',
        '',
        '*Admin:* !lapor dan !check juga bisa dikirim dari DM (private chat) ke bot.',
      ]
      return reply(sock, m, lines.join('\n'))
    },
  },
]