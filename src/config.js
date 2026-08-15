import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = JSON.parse(readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'))

export const config = {
  deadline: raw.deadline || 'Jumat 21:00',
  timezone: raw.timezone || 'Asia/Makassar',
  reminder_minutes_before:
    Number.isFinite(raw.reminder_minutes_before) ? raw.reminder_minutes_before : 60,
  check_interval_seconds:
    Number.isFinite(raw.check_interval_seconds) ? raw.check_interval_seconds : 30,
  exclude_admins: !!raw.exclude_admins,
  auto_join_groups: Array.isArray(raw.auto_join_groups) ? raw.auto_join_groups : [],
  data_file: raw.data_file || 'data.json',
  auth_dir: raw.auth_dir || 'auth_info',
}