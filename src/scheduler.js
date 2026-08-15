/** Menjalankan semua job terjadwal secara berkala (real-time, mengikuti jam lokal WITA). */
export function startScheduler(intervalMs, jobs, ctx) {
  let running = false

  const tick = async () => {
    if (running) return
    running = true
    try {
      const now = new Date()
      for (const job of jobs) {
        try {
          await job.run(now, ctx)
        } catch (err) {
          console.error(`[scheduler] Job "${job.name}" gagal:`, err?.message)
        }
      }
    } finally {
      running = false
    }
  }

  tick()
  return setInterval(tick, Math.max(5_000, intervalMs))
}