import { config } from './src/config.js'
import { useEncryptedAuthState } from './src/authState.js'
import makeWASocket from '@whiskeysockets/baileys'
import path from 'node:path'

const target = process.argv[2] || '147076893675545@s.whatsapp.net'
const text = process.argv[3] || 'Test DM - ' + new Date().toLocaleString('id-ID', {timeZone: config.timezone})

const authDir = path.join(process.cwd(), config.auth_dir)
const { state, saveCreds } = await useEncryptedAuthState(authDir)
const sock = makeWASocket({ auth: state, markOnlineOnConnect: false })
sock.ev.on('creds.update', saveCreds)
sock.ev.on('connection.update', async (u) => {
  if (u.connection === 'open') {
    console.log('[test] connected as', sock.user.id)
    try {
      // resolve LID if needed - try fetchContact
      let jid = target
      if (target.endsWith('@lid')) {
        try { const c = await sock.fetchContact(target); if(c?.id) jid=c.id } catch {}
      }
      console.log('[test] sending to', jid)
      await sock.sendMessage(jid, { text })
      console.log('[test] DM sent OK to', jid)
    } catch(e){ console.error('[test] send failed', e.message, e.stack?.slice(0,300)) }
    setTimeout(()=>{ sock.end(); process.exit(0)}, 1500)
  }
  if (u.connection==='close') console.log('[test] close', u.lastDisconnect?.error?.message)
})
setTimeout(()=>{ console.error('[test] timeout'); process.exit(1)}, 20000)
