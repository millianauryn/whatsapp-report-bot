import { reply } from '../bot.js'

export default [
  {
    name: 'bantuan',
    aliases: ['help', 'menu'],
    permission: 'all',
    async run(sock, m) {
      const lines = [
        '*Bantuan Bot Laporan*',
        'Simpan nomor bot di kontak sebelum kirim !lapor pertama kali',        
        '',
        'Jadwal laporan grup ini: 2x sebulan, otomatis.',
        '',
        '!lapor <kode_perusahaan>, <nama>',
        '  Contoh: !lapor kode perusahaan, nama',
        '',
        '!check',
        '  (Admin) Lihat list siapa yang sudah/belum lapor',
        '',
        '!bantuan',
        '  Tampilkan bantuan ini',
        '',
      ]
      return reply(sock, m, lines.join('\n'))
    },
  },
]