import * as bot from './bot.js'
import * as db from './db.js'

/**
 * Izin perintah:
 * - 'all'   -> semua boleh
 * - 'admin' -> nomor bot sendiri (master), atau admin grup.
 *   Di dalam grup: admin grup tersebut.
 *   Dari DM: admin minimal satu grup terdaftar.
 */
export async function checkPermission(cmd, { isGroup, sender, jid }, sock) {
  if (cmd.permission !== 'admin') return true
  if (sender === bot.botJidOf(sock)) return true
  if (!isGroup) {
    const groups = db.get('meta', 'groups', [])
    return bot.isController(sock, groups, sender)
  }
  const meta = await bot.groupMeta(sock, jid)
  return bot.isGroupAdmin(meta, sender)
}

/** Versi aman untuk pemakaian di jalur pesan: kegagalan meta = ditolak. */
export async function checkPermissionSafe(cmd, m, sock) {
  try {
    return await checkPermission(cmd, m, sock)
  } catch {
    return false
  }
}