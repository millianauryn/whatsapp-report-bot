import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Memuat semua perintah dari src/handlers/. Setiap file mengekspor array perintah. */
export async function loadCommands() {
  const commands = new Map()
  const dir = path.join(__dirname, 'handlers')
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = await import(path.join(dir, f))
    for (const c of mod.default || []) {
      if (!c?.name) continue
      commands.set(c.name, c)
      for (const alias of c.aliases || []) commands.set(alias, c)
    }
  }
  return commands
}

/** Memuat semua job terjadwal dari src/jobs/. */
export async function loadJobs() {
  const jobs = []
  const dir = path.join(__dirname, 'jobs')
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const mod = await import(path.join(dir, f))
    if (mod.default?.name) jobs.push(mod.default)
  }
  return jobs
}