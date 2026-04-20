import { createServer, IncomingMessage } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer, WebSocket, RawData } from 'ws'
import { db } from './src/lib/db'
import { addLog } from './src/lib/log-store'
import { VoicePipeline } from './src/voice/pipeline'
import { checkRateLimit, recordUsage } from './src/lib/rate-limiter'
import { notifyAdmins } from './src/lib/alerts'
import { logAudit } from './src/lib/audit'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const port = parseInt(process.env.PORT || '3000')

app.prepare().then(() => {
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/widget.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    handle(req, res, parse(req.url!, true))
  })

  // Two WebSocket routes on the same HTTP server:
  //   /voice — browser widget (linear16 @ 16kHz)
  //   /phone — Twilio Media Streams (mulaw @ 8kHz)
  const wssVoice = new WebSocketServer({ noServer: true })
  const wssPhone = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '', true)
    if (pathname === '/voice') {
      wssVoice.handleUpgrade(req, socket, head, (ws) => wssVoice.emit('connection', ws, req))
    } else if (pathname === '/phone') {
      wssPhone.handleUpgrade(req, socket, head, (ws) => wssPhone.emit('connection', ws, req))
    } else {
      socket.destroy()
    }
  })

  const wss = wssVoice

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = parse(req.url || '', true)
    const token = url.query.token as string
    const endUserSnId = (url.query.user as string) || ''
    addLog('info', 'ws', 'Connection. Token: ' + (token ? token.substring(0, 12) + '...' : 'NONE') + (endUserSnId ? ' end_user=' + endUserSnId : ''))

    const buffer: { data: RawData; isBinary: boolean }[] = []
    let authed = false
    let pipeline: VoicePipeline | null = null
    let tenantRef: any = null
    let instanceRef: any = null

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!authed) {
        buffer.push({ data, isBinary })
        addLog('info', 'ws', 'Buffered (auth pending). binary=' + isBinary)
        return
      }
      processMessage(data, isBinary)
    })

    const connectionStartTime = Date.now()

    ws.on('close', (code) => {
      addLog('info', 'ws', 'Closed code=' + code, { tenantId: tenantRef?.id })
      if (tenantRef) {
        const durationMin = Math.round((Date.now() - connectionStartTime) / 60000 * 100) / 100
        if (durationMin > 0.01) {
          const stats = pipeline ? pipeline.getUsageStats() : { inputTokens: 0, outputTokens: 0, toolCalls: 0 }
          addLog('info', 'pipeline', 'Usage: ' + durationMin + ' min', { tenantId: tenantRef.id })
          recordUsage(tenantRef.id, durationMin, stats.inputTokens, stats.outputTokens, stats.toolCalls)
            .catch((err: any) => addLog('error', 'pipeline', 'Usage record failed: ' + err.message, { tenantId: tenantRef.id }))
        }
      }
      if (pipeline) pipeline.stop().catch(() => {})
    })
    ws.on('error', (err) => addLog('error', 'ws', 'Err: ' + err.message))

    const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); else clearInterval(ping) }, 30000)
    ws.on('close', () => clearInterval(ping))

    let audioChunks = 0
    function processMessage(rawData: RawData, isBinary: boolean) {
      if (!pipeline || !instanceRef) return
      if (isBinary) {
        audioChunks++
        if (audioChunks === 1 || audioChunks % 50 === 0) {
          addLog('info', 'stt', 'Audio chunk #' + audioChunks + ' size=' + Buffer.from(rawData as ArrayBuffer).length, { tenantId: tenantRef.id })
        }
        pipeline.feedAudio(Buffer.from(rawData as ArrayBuffer))
        return
      }
      const str = rawData.toString()
      addLog('info', 'ws', 'RECV: ' + str.substring(0, 100), { tenantId: tenantRef.id })
      let msg: any
      try { msg = JSON.parse(str) } catch { return }
      if (msg.type === 'start') {
        addLog('info', 'pipeline', 'STARTING (orchestrator will pick agent)...', { tenantId: tenantRef.id })
        pipeline.start(undefined, endUserSnId || undefined, msg.originPortal)
          .then(() => addLog('info', 'pipeline', 'Started OK', { tenantId: tenantRef.id }))
          .catch((e: any) => {
            addLog('error', 'pipeline', 'FAIL: ' + e.message, { tenantId: tenantRef.id, data: { stack: e.stack?.substring(0, 500) } })
            send(ws, { type: 'error', message: e.message })
          })
      } else if (msg.type === 'stop') { pipeline.stop().catch(() => {}) }
      else if (msg.type === 'text' && msg.text) { pipeline.processText(msg.text) }
      else if (msg.type === 'confirm') { pipeline.handleConfirmation(msg.toolSysId, msg.inputParams, msg.confirmed).catch(() => {}) }
    }

    // Async auth — resolve token → Instance → Tenant
    ;(async () => {
      if (!token) { ws.close(4001, 'Token required'); return }
      try {
        const apiToken = await db.apiToken.findUnique({
          where: { token },
          include: { instance: { include: { tenant: true } }, tenant: true },
        })
        if (!apiToken?.active) { ws.close(4003, 'Invalid token'); return }

        // Prefer instance-linked token, fallback to tenant's first instance
        if (apiToken.instance && apiToken.instance.tenant) {
          instanceRef = apiToken.instance
          tenantRef = apiToken.instance.tenant
        } else if (apiToken.tenant) {
          tenantRef = apiToken.tenant
          instanceRef = await db.instance.findFirst({
            where: { tenantId: tenantRef.id, active: true },
            orderBy: { createdAt: 'asc' },
          })
          if (!instanceRef) { ws.close(4003, 'No instance configured'); return }
        } else {
          ws.close(4003, 'Invalid token'); return
        }

        db.apiToken.update({ where: { id: apiToken.id }, data: { lastUsed: new Date() } }).catch(() => {})

        // Plan quota gate. Rejects the connection before any LLM/STT/TTS is spun up
        // so exhausted tenants can't keep bleeding through.
        const gate = await checkRateLimit(tenantRef.id)
        if (!gate.allowed) {
          addLog('warn', 'ws', 'Quota gate blocked connection: ' + gate.reason + ' (used ' + gate.usage?.minutes + '/' + gate.usage?.limit + ')', { tenantId: tenantRef.id })
          await notifyAdmins({
            tenantId: tenantRef.id,
            severity: 'warn',
            kind: 'quota.exceeded',
            message: gate.reason || 'Quota exceeded',
            data: { usage: gate.usage },
          })
          try { ws.send(JSON.stringify({ type: 'error', code: 'quota_exceeded', message: gate.reason, usage: gate.usage })) } catch {}
          ws.close(4402, 'Quota exceeded')
          return
        }
        // Heads-up when a tenant crosses 80% of their limit (per connection, cheap to check)
        if (gate.usage && gate.usage.limit && gate.usage.minutes / gate.usage.limit >= 0.8 && gate.usage.minutes / gate.usage.limit < 1) {
          notifyAdmins({
            tenantId: tenantRef.id,
            severity: 'info',
            kind: 'quota.nearing',
            message: `Tenant at ${Math.round(gate.usage.minutes / gate.usage.limit * 100)}% of plan quota`,
            data: { usage: gate.usage },
          }).catch(() => {})
        }
      } catch (err: any) { addLog('error', 'ws', 'Auth error: ' + err.message); ws.close(4500, 'Error'); return }

      addLog('info', 'ws', 'Authed. Tenant=' + tenantRef.id + ' Instance=' + instanceRef.id + ' SN=' + instanceRef.snInstanceUrl, { tenantId: tenantRef.id })

      // Pipeline uses Instance credentials
      pipeline = new VoicePipeline({
        id: tenantRef.id,
        snInstanceUrl: instanceRef.snInstanceUrl,
        snUsername: instanceRef.snUsername,
        snPassword: instanceRef.snPassword,
      })
      pipeline.on('ready', (d: any) => { addLog('info', 'pipeline', 'READY ' + d.sessionId, { tenantId: tenantRef.id }); send(ws, { type: 'ready', ...d }) })
      pipeline.on('state', (s: string) => send(ws, { type: 'state', state: s }))
      pipeline.on('transcript', (d: any) => send(ws, { type: 'transcript', ...d }))
      pipeline.on('user_message', (t: string) => { addLog('info', 'pipeline', 'USER: ' + t.substring(0, 80), { tenantId: tenantRef.id }); send(ws, { type: 'user_message', text: t }) })
      pipeline.on('agent_message', (t: string) => { addLog('info', 'pipeline', 'AGENT: ' + t.substring(0, 80), { tenantId: tenantRef.id }); send(ws, { type: 'agent_message', text: t }) })
      pipeline.on('audio', (b: Buffer) => { if (ws.readyState === WebSocket.OPEN) ws.send(b) })
      pipeline.on('error', (e: any) => { addLog('error', 'pipeline', String(e.message || e), { tenantId: tenantRef.id }); send(ws, { type: 'error', message: e.message || 'Error' }) })
      pipeline.on('ended', () => { addLog('info', 'pipeline', 'ENDED', { tenantId: tenantRef.id }); send(ws, { type: 'ended' }) })
      pipeline.on('navigate', (d: any) => { addLog('info', 'pipeline', 'NAV ' + (d.urls?.length || 0) + ' url(s)', { tenantId: tenantRef.id }); send(ws, { type: 'navigate', urls: d.urls }) })
      pipeline.on('attachment_requested', (d: any) => { addLog('info', 'pipeline', 'Attachment requested: ' + d.reason, { tenantId: tenantRef.id }); send(ws, { type: 'attachment_requested', url: d.url, reason: d.reason }) })

      authed = true
      addLog('info', 'ws', 'Replaying ' + buffer.length + ' buffered msg(s)', { tenantId: tenantRef.id })
      for (const b of buffer) processMessage(b.data, b.isBinary)
      buffer.length = 0
    })()
  })

  // ── /phone — Twilio Media Streams bridge ──
  // Twilio sends JSON text frames with base64-encoded mulaw@8k payloads.
  // We identify the tenant/agent from the `phoneId` query param set by
  // /api/phone/incoming (which already authenticated the call), plan-gate,
  // then bridge the stream into a VoicePipeline configured for 'phone' audio.
  wssPhone.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = parse(req.url || '', true)
    const phoneId = (url.query.phoneId as string) || ''
    addLog('info', 'phone-ws', 'Phone stream connecting phoneId=' + phoneId)

    let pipeline: VoicePipeline | null = null
    let streamSid = ''
    let tenantRef: any = null
    let phoneRef: any = null
    const connectionStartTime = Date.now()
    let frameCount = 0

    function sendTwilio(obj: any) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
    }

    ws.on('close', (code) => {
      addLog('info', 'phone-ws', 'Closed code=' + code, { tenantId: tenantRef?.id })
      if (tenantRef) {
        const durationMin = Math.round((Date.now() - connectionStartTime) / 60000 * 100) / 100
        if (durationMin > 0.01) {
          const stats = pipeline ? pipeline.getUsageStats() : { inputTokens: 0, outputTokens: 0, toolCalls: 0 }
          recordUsage(tenantRef.id, durationMin, stats.inputTokens, stats.outputTokens, stats.toolCalls)
            .catch((err: any) => addLog('error', 'phone-ws', 'Usage record failed: ' + err.message, { tenantId: tenantRef.id }))
        }
      }
      if (pipeline) pipeline.stop().catch(() => {})
    })
    ws.on('error', (err) => addLog('error', 'phone-ws', 'Err: ' + err.message))

    ws.on('message', async (data: RawData) => {
      let msg: any
      try { msg = JSON.parse(data.toString()) } catch { return }

      switch (msg.event) {
        case 'connected':
          addLog('info', 'phone-ws', 'Twilio protocol connected: ' + msg.protocol)
          return

        case 'start': {
          streamSid = msg.start?.streamSid || msg.streamSid || ''
          addLog('info', 'phone-ws', 'Stream start sid=' + streamSid + ' callSid=' + (msg.start?.callSid || ''))

          // Resolve phone → tenant/agent/instance
          if (!phoneId) { ws.close(1008, 'phoneId required'); return }
          const phone = await db.phoneNumber.findUnique({
            where: { id: phoneId },
            include: { tenant: true, agent: true, instance: true },
          })
          if (!phone || !phone.active) { ws.close(1008, 'Unknown phone'); return }
          if (!phone.instance?.active || !phone.instance.snInstanceUrl) { ws.close(1011, 'No SN instance'); return }

          // Second-line plan gate (webhook already checked, but the phoneId could be
          // replayed and the plan may have changed between TwiML and Media Stream)
          if (phone.tenant.plan !== 'PRO_VOICE' && phone.tenant.plan !== 'ENTERPRISE') {
            addLog('warn', 'phone-ws', 'Plan gate blocked stream — ' + phone.tenant.plan, { tenantId: phone.tenantId })
            ws.close(1008, 'Plan not eligible'); return
          }

          // Quota gate
          const gate = await checkRateLimit(phone.tenantId)
          if (!gate.allowed) {
            addLog('warn', 'phone-ws', 'Quota blocked: ' + gate.reason, { tenantId: phone.tenantId })
            await notifyAdmins({
              tenantId: phone.tenantId,
              severity: 'warn',
              kind: 'quota.exceeded',
              message: 'Phone call rejected — quota exceeded',
              data: { usage: gate.usage, channel: 'phone' },
            })
            ws.close(4402, 'Quota exceeded'); return
          }

          tenantRef = phone.tenant
          phoneRef = phone

          pipeline = new VoicePipeline(
            {
              id: phone.tenant.id,
              snInstanceUrl: phone.instance.snInstanceUrl,
              snUsername: phone.instance.snUsername,
              snPassword: phone.instance.snPassword,
            },
            { audioFormat: 'phone' },
          )

          pipeline.on('ready', (d: any) => addLog('info', 'phone-ws', 'Pipeline ready ' + d.sessionId, { tenantId: tenantRef.id }))
          pipeline.on('user_message', (t: string) => addLog('info', 'phone-ws', 'USER: ' + t.substring(0, 80), { tenantId: tenantRef.id }))
          pipeline.on('agent_message', (t: string) => addLog('info', 'phone-ws', 'AGENT: ' + t.substring(0, 80), { tenantId: tenantRef.id }))
          pipeline.on('audio', (b: Buffer) => {
            if (ws.readyState !== WebSocket.OPEN || !streamSid) return
            // Convert binary mulaw@8k buffer → base64 → Twilio media frame
            sendTwilio({
              event: 'media',
              streamSid,
              media: { payload: b.toString('base64') },
            })
          })
          pipeline.on('error', (e: any) => addLog('error', 'phone-ws', String(e.message || e), { tenantId: tenantRef.id }))
          pipeline.on('ended', () => { try { ws.close(1000, 'Call ended') } catch {} })

          // Start the pipeline bound to this phone number's agent
          const agentSnId = phone.agent?.snAgentId || undefined
          pipeline.start(agentSnId, undefined, 'phone')
            .then(() => addLog('info', 'phone-ws', 'Pipeline started', { tenantId: tenantRef.id }))
            .catch((e: any) => {
              addLog('error', 'phone-ws', 'Start failed: ' + e.message, { tenantId: tenantRef.id })
              try { ws.close(1011, 'Pipeline failed') } catch {}
            })
          return
        }

        case 'media': {
          if (!pipeline) return
          frameCount++
          if (frameCount === 1 || frameCount % 200 === 0) {
            addLog('debug', 'phone-ws', 'Audio frame #' + frameCount, { tenantId: tenantRef?.id })
          }
          const payload = msg.media?.payload
          if (typeof payload !== 'string') return
          const buf = Buffer.from(payload, 'base64')
          pipeline.feedAudio(buf)
          return
        }

        case 'stop':
          addLog('info', 'phone-ws', 'Twilio stop', { tenantId: tenantRef?.id })
          if (pipeline) pipeline.stop().catch(() => {})
          return

        case 'mark':
          // Optional — Twilio acks named marks we sent. Not used yet.
          return

        default:
          return
      }
    })
  })

  server.listen(port, () => {
    addLog('info', 'server', 'ZeVox on port ' + port)
    console.log('> ZeVox at http://localhost:' + port)
  })
})

function send(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}
