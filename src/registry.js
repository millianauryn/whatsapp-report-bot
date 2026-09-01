import bantuan from './handlers/bantuan.js'
import check from './handlers/check.js'
import lapor from './handlers/lapor.js'
import exclude from './handlers/exclude.js'
import reminder from './jobs/reminder.js'
import deadlineAlert from './jobs/deadlineAlert.js'
import periodReset from './jobs/periodReset.js'

export const commands = new Map()
for (const c of [...bantuan, ...check, ...lapor, ...exclude]) {
  commands.set(c.name, c)
  for (const a of c.aliases || []) commands.set(a, c)
}

export const jobs = [reminder, deadlineAlert, periodReset]
