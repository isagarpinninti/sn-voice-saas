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
import { getTelephonyProvider } from './src/lib/telephony'

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

  // Three WebSocket routes on the same HTTP server:
  //   /voice      — browser widget (linear16 @ 16kHz)
  //   /phone      — Twilio/Telnyx Media Streams (mulaw @ 8kHz)
  //   /transcribe — SN Voice Assistant transcription widget (linear16 @ 16kHz)
  const wssVoice = new WebSocketServer({ noServer: true })
  const wssPhone = new WebSocketServer({ noServer: true })
  const wssTranscribe = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '', true)
    if (pathname === '/voice') {
      wssVoice.handleUpgrade(req, socket, head, (ws) => wssVoice.emit('connection', ws, req))
    } else if (pathname === '/phone') {
      wssPhone.handleUpgrade(req, socket, head, (ws) => wssPhone.emit('connection', ws, req))
    } else if (pathname === '/transcribe') {
      wssTranscribe.handleUpgrade(req, socket, head, (ws) => wssTranscribe.emit('connection', ws, req))
    } else {
      socket.destroy()
    }
  })

  // ── /transcribe — SN Voice Assistant transcription widget ──
  // Opens two parallel Deepgram connections per session:
  //   dgOrig:  language=multi → transcript in spoken language + detected_language
  //   dgTrans: language=multi + translate=true → English translation
  // Both receive the same audio. The browser decides which to display.
  wssTranscribe.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = parse(req.url || '', true)
    const token = url.query.token as string
    addLog('info', 'transcribe-ws', 'Connection. Token: ' + (token ? token.substring(0, 12) + '...' : 'NONE'))

    let authed = false

    // Auth: validate token before opening Deepgram connections
    ;(async () => {
      if (!token) { ws.close(4001, 'Token required'); return }
      try {
        const apiToken = await db.apiToken.findUnique({
          where: { token },
          include: { instance: true, tenant: true },
        })
        if (!apiToken?.active) { ws.close(4003, 'Invalid token'); return }
        authed = true
        addLog('info', 'transcribe-ws', 'Authed. TenantId=' + (apiToken.tenantId || apiToken.tenant?.id || '?'))
      } catch (err: any) {
        addLog('error', 'transcribe-ws', 'Auth error: ' + err.message)
        ws.close(4500, 'Auth error'); return
      }

      const dgKey = process.env.DEEPGRAM_API_KEY
      if (!dgKey) { ws.close(1011, 'STT not configured'); return }

      const dgBase = 'wss://api.deepgram.com/v1/listen'
      const dgParams = 'model=nova-3&language=multi&detect_language=true&smart_format=true&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1'
      const dgHeaders = { headers: { Authorization: `Token ${dgKey}` } }

      const dgOrig  = new WebSocket(`${dgBase}?${dgParams}`, dgHeaders)
      const dgTrans = new WebSocket(`${dgBase}?${dgParams}&translate=true`, dgHeaders)

      let origReady  = false
      let transReady = false

      function send(data: object) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
      }

      function checkReady() {
        if (origReady && transReady) send({ type: 'ready' })
      }

      dgOrig.on('open', () => { origReady = true; checkReady() })
      dgTrans.on('open', () => { transReady = true; checkReady() })

      dgOrig.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          const text = msg.channel?.alternatives?.[0]?.transcript
          if (!text) return
          send({
            type: 'transcript',
            text,
            isFinal: msg.is_final || false,
            speechFinal: msg.speech_final || false,
            detectedLanguage: msg.channel?.detected_language || '',
          })
        } catch {}
      })

      dgTrans.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          const text = msg.channel?.alternatives?.[0]?.transcript
          if (!text) return
          send({
            type: 'translation',
            text,
            isFinal: msg.is_final || false,
            speechFinal: msg.speech_final || false,
          })
        } catch {}
      })

      dgOrig.on('error',  (e) => addLog('error', 'transcribe-ws', 'DG-orig error: '  + e.message))
      dgTrans.on('error', (e) => addLog('error', 'transcribe-ws', 'DG-trans error: ' + e.message))
      dgOrig.on('close',  () => addLog('info',  'transcribe-ws', 'DG-orig closed'))
      dgTrans.on('close', () => addLog('info',  'transcribe-ws', 'DG-trans closed'))

      ws.on('message', (data: RawData, isBinary: boolean) => {
        if (!authed) return
        if (isBinary) {
          if (dgOrig.readyState  === WebSocket.OPEN) dgOrig.send(data)
          if (dgTrans.readyState === WebSocket.OPEN) dgTrans.send(data)
        }
      })

      ws.on('close', () => {
        addLog('info', 'transcribe-ws', 'Browser closed — shutting down DG connections')
        try { dgOrig.close() }  catch {}
        try { dgTrans.close() } catch {}
      })

      ws.on('error', (e) => addLog('error', 'transcribe-ws', 'Browser WS error: ' + e.message))

      const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); else clearInterval(ping) }, 30000)
      ws.on('close', () => clearInterval(ping))
    })()
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

  // ── /phone — telephony Media Streams bridge ──
  // Provider-neutral: all provider-specific framing lives behind TelephonyProvider.
  // This handler identifies the tenant/agent from the `phoneId` custom parameter
  // set by /api/phone/incoming (which already authenticated the call), plan-gates,
  // then bridges the stream into a VoicePipeline configured for 'phone' audio.
  wssPhone.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = parse(req.url || '', true)
    // Provider is embedded in the stream URL by /api/phone/incoming. Unknown
    // values fall back to the env default inside getTelephonyProvider.
    const providerName = (url.query.provider as string) || undefined
    const provider = getTelephonyProvider(providerName as any)
    // Fallback from URL query — kept for older cached stream responses that
    // still include phoneId as a query string during a provider cut-over.
    const queryPhoneId = (url.query.phoneId as string) || ''
    let phoneId = queryPhoneId
    addLog('info', 'phone-ws', `Phone stream connecting (${provider.name}) queryPhoneId=` + queryPhoneId + ' rawUrl=' + (req.url || ''))

    let pipeline: VoicePipeline | null = null
    let streamSid = ''
    let tenantRef: any = null
    let phoneRef: any = null
    const connectionStartTime = Date.now()
    let frameCount = 0

    ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : ''
      addLog('info', 'phone-ws', 'Closed code=' + code + (reasonStr ? ' reason=' + reasonStr : ''), { tenantId: tenantRef?.id })
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
      const ev = provider.parseStreamEvent(data as Buffer)

      switch (ev.type) {
        case 'connected':
          addLog('info', 'phone-ws', `Provider protocol connected (${provider.name})` + (ev.protocol ? ': ' + ev.protocol : ''))
          return

        case 'start': {
          streamSid = ev.streamSid
          const customParams = ev.customParameters
          const customPhoneId = customParams.phoneId || ''
          if (customPhoneId) phoneId = customPhoneId
          // Caller context is set by /api/phone/incoming when an allowlist match
          // happens. Empty when the tenant runs in open-access mode (no allowlist).
          const callerSnUserSysId = customParams.callerSnUserSysId || ''
          const callerName = customParams.callerName || ''
          addLog('info', 'phone-ws', 'Stream start sid=' + streamSid + ' callId=' + (ev.callId || '') + ' phoneId=' + phoneId + ' caller=' + (callerName || callerSnUserSysId || 'anonymous') + ' (source=' + (customPhoneId ? 'customParameters' : queryPhoneId ? 'queryString' : 'NONE') + ')')

          // Resolve phone → tenant/agent/instance
          if (!phoneId) { ws.close(1008, 'phoneId required'); return }
          const phone = await db.phoneNumber.findUnique({
            where: { id: phoneId },
            include: { tenant: true, agent: true, instance: true },
          })
          if (!phone || !phone.active) { ws.close(1008, 'Unknown phone'); return }
          if (!phone.instance?.active || !phone.instance.snInstanceUrl) { ws.close(1011, 'No SN instance'); return }

          // Second-line plan gate (webhook already checked, but the phoneId could be
          // replayed and the plan may have changed between response and Media Stream).
          // PREMIUM is the active phone-eligible tier; PRO_VOICE/ENTERPRISE remain
          // for legacy tenants.
          const phoneEligible = phone.tenant.plan === 'PREMIUM' || phone.tenant.plan === 'PRO_VOICE' || phone.tenant.plan === 'ENTERPRISE'
          if (!phoneEligible) {
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
            ws.send(provider.encodeAudioFrame(streamSid, b))
          })
          pipeline.on('error', (e: any) => addLog('error', 'phone-ws', String(e.message || e), { tenantId: tenantRef.id }))
          pipeline.on('ended', () => { try { ws.close(1000, 'Call ended') } catch {} })

          // Start the pipeline bound to this phone number's agent.
          // endUserSnId carries the SN sys_user sys_id for tool impersonation —
          // only set when the caller matched an allowlist entry that supplied it.
          // Empty for open-access tenants (tools run as service account, same as
          // anonymous widget callers).
          const agentSnId = phone.agent?.snAgentId || undefined
          pipeline.start(agentSnId, callerSnUserSysId || undefined, 'phone')
            .then(() => addLog('info', 'phone-ws', 'Pipeline started' + (callerName ? ' for ' + callerName : '') + (callerSnUserSysId ? ' (snUser=' + callerSnUserSysId + ')' : ''), { tenantId: tenantRef.id }))
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
          pipeline.feedAudio(ev.audio)
          return
        }

        case 'stop':
          addLog('info', 'phone-ws', `Provider stop (${provider.name})`, { tenantId: tenantRef?.id })
          if (pipeline) pipeline.stop().catch(() => {})
          return

        case 'mark':
        case 'unknown':
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
