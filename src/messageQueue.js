import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs'
import { config } from './config.js'

const QUEUE_FILE = process.env.BOT_QUEUE_FILE || config.queue_file || './queue.jsonl'
const FLUSH_INTERVAL_MS = config.queue_flush_interval_ms || 500
const MAX_QUEUE_SIZE = config.queue_max_size || 10000

const queue = []
let processing = false
let workerTimer = null
let flushPromise = null

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function loadQueue() {
  if (!existsSync(QUEUE_FILE)) return
  try {
    const content = readFileSync(QUEUE_FILE, 'utf8').trim()
    if (!content) return
    const lines = content.split('\n')
    for (const line of lines) {
      if (line.trim()) {
        const item = JSON.parse(line)
        queue.push(item)
      }
    }
    console.log(`[queue] Loaded ${queue.length} pending messages`)
  } catch (err) {
    console.error('[queue] Failed to load:', err.message)
  }
}

function persistQueue() {
  if (queue.length === 0) {
    try { writeFileSync(QUEUE_FILE, '') } catch {}
    return
  }
  const tmp = `${QUEUE_FILE}.tmp`
  const content = queue.map(item => JSON.stringify(item)).join('\n') + '\n'
  writeFileSync(tmp, content)
  renameSync(tmp, QUEUE_FILE)
}

function enqueue(item) {
  if (queue.length >= MAX_QUEUE_SIZE) {
    console.warn('[queue] Max size reached, dropping oldest')
    queue.shift()
  }
  const entry = {
    id: generateId(),
    created: new Date().toISOString(),
    attempts: 0,
    ...item
  }
  queue.push(entry)
  persistQueue()
  scheduleFlush()
  return entry.id
}

function scheduleFlush() {
  if (workerTimer) return
  workerTimer = setTimeout(() => {
    workerTimer = null
    processQueue()
  }, FLUSH_INTERVAL_MS)
}

async function processQueue() {
  if (processing || queue.length === 0) return
  processing = true

  const sock = globalThis.__botSock?.()
  if (!sock) {
    processing = false
    if (queue.length > 0) scheduleFlush()
    return
  }

  const batch = queue.splice(0, 50)
  for (const item of batch) {
    try {
      if (item.type === 'mention') {
        await sock.sendMessage(item.jid, { text: item.text, mentions: item.mentions }, item.quoted ? { quoted: item.quoted } : undefined)
      } else {
        await sock.sendMessage(item.jid, { text: item.text }, item.quoted ? { quoted: item.quoted } : undefined)
      }
    } catch (err) {
      console.error(`[queue] Send failed for ${item.id}:`, err.message)
      item.attempts++
      if (item.attempts < 3) {
        queue.unshift(item)
      } else {
        console.error(`[queue] Dropped after 3 attempts: ${item.id}`)
      }
    }
  }
  persistQueue()
  processing = false
  if (queue.length > 0) scheduleFlush()
}

function getStats() {
  return {
    pending: queue.length,
    processing,
    maxSize: MAX_QUEUE_SIZE
  }
}

function clear() {
  queue.length = 0
  persistQueue()
}

export const messageQueue = {
  load: loadQueue,
  enqueue,
  getStats,
  clear,
  processQueue,
  FLUSH_INTERVAL_MS
}