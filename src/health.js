import { createServer } from 'node:http'
import { config } from './config.js'
import * as db from './db.js'
import * as bot from './bot.js'
import * as time from './time.js'

const HEALTH_PORT = process.env.BOT_HEALTH_PORT || config.health_port || 3000
const HEALTH_HOST = process.env.BOT_HEALTH_HOST || config.health_host || '0.0.0.0'
const HEALTH_TOKEN = process.env.BOT_HEALTH_TOKEN || config.health_token || null

let server = null
let waConnected = false
let lastMessageTime = 0
let connectionLostTime = null

function checkAuth(req) {
  if (!HEALTH_TOKEN) return true
  const auth = req.headers.authorization
  return auth === `Bearer ${HEALTH_TOKEN}`
}

function setWaConnected(connected) {
  waConnected = connected
  if (!connected) {
    connectionLostTime = Date.now()
  } else {
    connectionLostTime = null
  }
}

function updateLastMessageTime() {
  lastMessageTime = Date.now()
}

function getUptime() {
  return process.uptime() * 1000
}

function getStatus() {
  if (!waConnected) return 'offline'
  if (Date.now() - lastMessageTime > 60_000) return 'degraded'
  return 'healthy'
}

function createHandler(sockGetter, groupsGetter) {
  return async (req, res) => {
    if (req.url?.startsWith('/set-group-summary-time') && req.method === 'POST') {
      if (!checkAuth(req)) { res.writeHead(401); res.end('Unauthorized'); return }
      let body=''; for await(const c of req) body+=c
      try {
        const { gid, summary_time } = JSON.parse(body || '{}')
        if (!gid || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(summary_time || '')) throw new Error('need valid gid and summary_time')
        const all = db.get('settings', 'groups', {})
        if (!all[gid]) throw new Error('unknown group')
        all[gid].summary_time = summary_time
        db.set('settings', 'groups', all)
        const today = time.dayKey(new Date())
        const flags = db.get('flags', today, {})
        delete flags[`${gid}:summary:${today}`]
        db.set('flags', today, flags)
        res.writeHead(200, {'Content-Type':'application/json'})
        res.end(JSON.stringify({ ok: true, gid, summary_time }))
      } catch(e){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false, error:e.message}))}
      return
    }
    if (req.url?.startsWith('/update-deadline') && req.method === 'POST') {
      if (!checkAuth(req)) { res.writeHead(401); res.end('Unauthorized'); return }
      let body=''; for await(const c of req) body+=c
      try {
        const { deadline, gid } = JSON.parse(body||'{}')
        if(!deadline) throw new Error('need deadline')
        const all = db.get('settings','groups',{})
        if (gid) {
          all[gid] = { cadence:'daily', deadline }
          db.set('settings','groups', all)
          const today = time.dayKey(new Date())
           const flags = db.get('flags', today, {})
           delete flags[`${gid}:reminder:${deadline}`]
           delete flags[`${gid}:summary:${today}`]
           db.set('flags', today, flags)
          res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true, deadline, gid}))
        } else {
          const groups = db.get('meta','groups',[])
          for(const g of groups) all[g] = { cadence:'daily', deadline }
          db.set('settings','groups', all)
          const today = new Date().toISOString().slice(0,10)
          db.set('flags', today, {})
          res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true, deadline, groups}))
        }
      } catch(e){ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false, error:e.message}))}
      return
    }
    if (!checkAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    const sock = sockGetter?.()
    const groups = groupsGetter?.() || []

    const status = getStatus()
    const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503

    const body = {
      status,
      wa_connected: waConnected,
      uptime_ms: Math.floor(getUptime()),
      last_message_ms: lastMessageTime || null,
      connection_lost_ms: connectionLostTime,
      groups_served: groups.length,
      bot_jid: sock ? `${sock.user?.id || 'unknown'}` : null,
      timestamp: new Date().toISOString()
    }

    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body, null, 2))
  }
}

function start(sockGetter, groupsGetter) {
  if (server) return server

  const handler = createHandler(sockGetter, groupsGetter)
  server = createServer(handler)

  return new Promise((resolve, reject) => {
    server.listen(HEALTH_PORT, HEALTH_HOST, (err) => {
      if (err) return reject(err)
      console.log(`[health] HTTP server listening on ${HEALTH_HOST}:${HEALTH_PORT}`)
      resolve(server)
    })
  })
}

function stop() {
  if (server) {
    server.close()
    server = null
  }
}

export const healthServer = {
  start,
  stop,
  setWaConnected,
  updateLastMessageTime,
  getStatus: () => getStatus()
}