# Alur Otomatis per Jadwal Grup

> Kembali ke [README utama](../README.md)

## Daily / Weekly / Monthly

```txt
tenggat        tenggat + 1mnt      17:00
deadline ─────► alert DM + recap ────► summary otomatis
(reminder DM)    (DM + recap grup)    (auto !check ke grup)
```

## 2x Sebulan (Semimonthly)

```
tgl 1/15 00:00        tgl 3/17 11:30           tgl 4/18 17:00        tgl 4/18 23:58   tgl 5/19 00:00
periode dibuka  ─────►  reminder DM (pas jam)  ►  summary harian  ───►  summary        ►  reset + lapor
lapor diterima   │    lalu alert DM + recap         (17:00, tiap        terakhir          ditolak
                   │    1 mnt kemudian)              hari cycle)       (23:58)           (gap)
```

- Summary **17:00** dikirim tiap hari selama cycle (4x per cycle)
- Lapor setelah tenggat sampai akhir periode tetap diterima (tanpa penanda terlambat)
- Di tanggal sela (5–14 dan 19–31) `!lapor` ditolak dengan info jadwal berikutnya
- Grup baru yang bergabung setelahnya otomatis dipreset sama (2xsebulan 11:30)

## Cara Bot Masuk Grup (hanya link yang diizinkan)

Bot **hanya bekerja di grup yang link undangannya terdaftar** di `config.json` → `allowed_group_links`:

1. Buat link undangan grup di WhatsApp (grup boleh terbuka/bebas bergabung, atau Anda sebagai admin menambahkan).
2. Isi `allowed_group_links` dengan link tersebut (bisa lebih dari satu), lalu restart bot.
3. Saat start, bot join grup dari tiap link, mendaftarkannya, dan mulai melayani (reminder/alert/recap hanya untuk grup itu).
4. Grup yang pernah di-join tersimpan di `data.json` (`meta.joined_links`) — restart tidak akan join ulang, hanya memastikan grup tetap terdaftar.

**Grup lain diabaikan total:** bot yang ditambahkan langsung ke grup lain (bukan via link diizinkan) tidak akan terdaftar, tidak membalas, dan tidak mengirim recap atau summary. Grup yang dikeluarkan bot-nya langsung berhenti dilayani.
