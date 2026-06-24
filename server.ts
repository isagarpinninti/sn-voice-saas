import { createServer, IncomingMessage } from 'http'
import https from 'https'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer, WebSocket, RawData } from 'ws'
import { db } from './src/lib/db'
import { addLog } from './src/lib/log-store'
import { VoicePipeline } from './src/voice/pipeline'

import { checkRateLimit, recordUsage, recordAgentUsage } from './src/lib/rate-limiter'
import { notifyAdmins } from './src/lib/alerts'
import { logAudit } from './src/lib/audit'
import { getTelephonyProvider } from './src/lib/telephony'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const port = parseInt(process.env.PORT || '3000')

// Cache resolved API tokens for 5 minutes so repeat WS connections skip the
// Neon round-trip entirely. First connection on a cold Neon instance still
// takes 2-4s and will hit Render's idle timeout; the widget auto-retries once
// and the second attempt hits this cache and authenticates in <1ms.
const apiTokenCache = new Map<string, { data: any; expiresAt: number }>()

app.prepare().then(() => {
  // Warm up the Prisma connection pool so the first WS auth query
  // completes in <100ms instead of 3-5s (Neon cold-start penalty).
  db.$connect().catch((e: any) => addLog('warn', 'server', 'DB warmup failed: ' + e.message))

  const server = createServer((req, res) => {
    if (req.url?.startsWith('/widget.js') || req.url?.startsWith('/voice-transcribe-widget.js') || req.url?.startsWith('/voice-agent-incident-widget.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    handle(req, res, parse(req.url!, true))
  })

  // Three WebSocket routes on the same HTTP server:
  //   /voice      — browser widget (linear16 @ 16kHz)
  //   /phone      — Twilio/Telnyx Media Streams (mulaw @ 8kHz)
  //   /transcribe — SN Voice Assistant transcription widget (linear16 @ 16kHz)
  // perMessageDeflate disabled: PCM audio is incompressible and the compression
  // context can corrupt on the first large binary frame, causing 1006 drops.
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

    // Register error handler immediately — before async auth — so an early error
    // doesn't become an unhandled EventEmitter throw that crashes the process.
    ws.on('error', (e) => addLog('error', 'transcribe-ws', 'Browser WS error: ' + e.message))

    let authed = false

    // Auth: validate token before opening Deepgram connections
    ;(async () => {
      if (!token) { ws.close(4001, 'Token required'); return }
      // Retry once on DB connection failure — Neon free tier auto-pauses and the
      // first connection attempt after a cold start often fails with ECONNREFUSED.
      let apiToken: any = null
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          apiToken = await db.apiToken.findUnique({
            where: { token },
            include: { instance: true, tenant: true },
          })
          break
        } catch (err: any) {
          addLog('warn', 'transcribe-ws', `Auth DB attempt ${attempt} failed: ${err.message?.split('\n')[0]}`)
          if (attempt === 2) { ws.close(4500, 'Auth error'); return }
          await new Promise(r => setTimeout(r, 5000))
        }
      }
      if (!apiToken?.active) { ws.close(4003, 'Invalid token'); return }
      authed = true
      addLog('info', 'transcribe-ws', 'Authed. TenantId=' + (apiToken.tenantId || apiToken.tenant?.id || '?'))

      const dgKey = process.env.DEEPGRAM_API_KEY
      if (!dgKey) { ws.close(1011, 'STT not configured'); return }

      const dgBase = 'wss://api.deepgram.com/v1/listen'
      const dgParams = 'model=nova-3&language=multi&smart_format=true&punctuate=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1'
      const dgHeaders = { headers: { Authorization: `Token ${dgKey}` } }

      // Single connection — translation (nova-3 + multi + translate=true) is unsupported
      const dgOrig = new WebSocket(`${dgBase}?${dgParams}`, dgHeaders)

      function send(data: object) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
      }

      dgOrig.on('open', () => { send({ type: 'ready' }) })

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

      dgOrig.on('error', (e) => addLog('error', 'transcribe-ws', 'DG error: ' + e.message))
      // Capture the raw HTTP response body when Deepgram rejects the upgrade (400/401/403)
      ;(dgOrig as any).on('unexpected-response', (_req: any, res: any) => {
        let body = ''
        res.on('data', (c: any) => { body += c.toString() })
        res.on('end', () => addLog('error', 'transcribe-ws', 'DG HTTP ' + res.statusCode + ' body: ' + body))
      })

      // Deepgram closes after 10s of silence — send KeepAlive every 8s so the
      // connection stays open while the user is reading the form before recording.
      // Declared before the close handler so the closure captures an initialised binding.
      let dgKeepAlive: ReturnType<typeof setInterval> | undefined
      dgKeepAlive = setInterval(() => {
        if (dgOrig.readyState === WebSocket.OPEN) {
          try { dgOrig.send(JSON.stringify({ type: 'KeepAlive' })) } catch {}
        } else {
          clearInterval(dgKeepAlive)
        }
      }, 8000)

      dgOrig.on('close', (code, reason) => {
        addLog('info', 'transcribe-ws', 'DG closed code=' + code + ' reason=' + (reason?.toString() || ''))
        clearInterval(dgKeepAlive)
      })

      ws.on('message', (data: RawData, isBinary: boolean) => {
        if (!authed) return
        if (isBinary) {
          try {
            if (dgOrig.readyState === WebSocket.OPEN) dgOrig.send(data)
          } catch (e: any) {
            addLog('error', 'transcribe-ws', 'DG send error: ' + e.message)
          }
        } else {
          try {
            const msg = JSON.parse(data.toString())
            if (msg.type === 'flush' && dgOrig.readyState === WebSocket.OPEN) {
              dgOrig.send(JSON.stringify({ type: 'Finalize' }))
            } else if (msg.type === 'translate' && msg.text) {
              const src = (msg.sourceLang || '').split('-')[0] || 'autodetect'
              const tgt = (msg.targetLang || 'en').split('-')[0] || 'en'
              const langpair = encodeURIComponent(src + '|' + tgt)
              const q = encodeURIComponent(String(msg.text).substring(0, 2000))
              const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=${langpair}`
              https.get(url, (res) => {
                let body = ''
                res.on('data', (c) => { body += c })
                res.on('end', () => {
                  try {
                    const parsed = JSON.parse(body)
                    const translation = parsed?.responseData?.translatedText || ''
                    if (translation) send({ type: 'translation', text: translation, isFinal: true })
                    else send({ type: 'error', message: 'Translation returned empty' })
                  } catch { send({ type: 'error', message: 'Translation parse error' }) }
                })
              }).on('error', (e) => send({ type: 'error', message: 'Translation failed: ' + e.message }))
            }
          } catch {}
        }
      })

      ws.on('close', () => {
        addLog('info', 'transcribe-ws', 'Browser closed — shutting down DG connection')
        clearInterval(dgKeepAlive)
        try { dgOrig.close() } catch {}
      })

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
    let wsClosed = false
    let pipeline: VoicePipeline | null = null
    let tenantRef: any = null
    let instanceRef: any = null
    let pinnedAgentSnId: string | undefined = undefined
    let pinnedAgentId: string | undefined = undefined

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
      wsClosed = true
      addLog('info', 'ws', 'Closed code=' + code + ' after ' + (Date.now() - connectionStartTime) + 'ms', { tenantId: tenantRef?.id })
      if (tenantRef) {
        const durationMin = Math.round((Date.now() - connectionStartTime) / 60000 * 100) / 100
        if (durationMin > 0.01) {
          const stats = pipeline ? pipeline.getUsageStats() : { inputTokens: 0, outputTokens: 0, toolCalls: 0 }
          addLog('info', 'pipeline', 'Usage: ' + durationMin + ' min', { tenantId: tenantRef.id })
          recordUsage(tenantRef.id, durationMin, stats.inputTokens, stats.outputTokens, stats.toolCalls)
            .catch((err: any) => addLog('error', 'pipeline', 'Usage record failed: ' + err.message, { tenantId: tenantRef.id }))
          if (pinnedAgentId) {
            recordAgentUsage(pinnedAgentId, durationMin)
              .catch((err: any) => addLog('error', 'pipeline', 'Agent usage record failed: ' + err.message, { tenantId: tenantRef.id }))
          }
        }
      }
      if (pipeline) pipeline.stop().catch(() => {})
    })
    ws.on('error', (err) => addLog('error', 'ws', 'Err: ' + err.message))

    // Do NOT send any server-initiated frames during auth — Render's proxy
    // closes the WS ~1ms after the second server frame if the client has not
    // yet "responded" (empirically confirmed: 500ms ping → 501ms close,
    // 200ms ping → 202ms close). Auth latency is handled by the token cache
    // instead: cached tokens resolve in <1ms; the widget auto-retries once on
    // a 1006 so a cold-Neon first connection succeeds on the second attempt.

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
        addLog('info', 'pipeline', pinnedAgentSnId ? 'STARTING (pinned agent: ' + pinnedAgentSnId.substring(0, 8) + '...)' : 'STARTING (orchestrator will pick agent)...', { tenantId: tenantRef.id })
        const incidentCtx = (msg.incidentContext && typeof msg.incidentContext === 'object') ? msg.incidentContext : undefined
        if (incidentCtx?.number) addLog('info', 'pipeline', 'Incident context: ' + incidentCtx.number, { tenantId: tenantRef.id })
        const formCtx = (msg.formContext && typeof msg.formContext === 'object') ? msg.formContext : undefined
        if (formCtx?.tableName) addLog('info', 'pipeline', 'Form context: table=' + formCtx.tableName + ' sysId=' + (formCtx.sysId || ''), { tenantId: tenantRef.id })
        pipeline.start(pinnedAgentSnId, endUserSnId || undefined, msg.originPortal, incidentCtx, formCtx)
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
    // Retry once on DB connection failure — Neon/Render free-tier DBs auto-pause
    // and the first connection attempt after a cold start often fails with ECONNREFUSED.
    ;(async () => {
      if (!token) {
        try { ws.send(JSON.stringify({ type: 'error', message: 'No token — paste the embed snippet from ZeVox Dashboard → Agents onto your portal page.' })) } catch {}
        ws.close(4001, 'Token required'); return
      }

      try {
        let apiToken: any = null
        const cached = apiTokenCache.get(token)
        if (cached && cached.expiresAt > Date.now()) {
          apiToken = cached.data
          addLog('info', 'ws', 'Token resolved from cache', { tenantId: cached.data?.instance?.tenant?.id || cached.data?.tenant?.id })
        } else {
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              apiToken = await db.apiToken.findUnique({
                where: { token },
                include: {
                  instance: { include: { tenant: true } },
                  agent: { include: { instance: { include: { tenant: true } } } },
                  tenant: true,
                },
              })
              if (apiToken) apiTokenCache.set(token, { data: apiToken, expiresAt: Date.now() + 5 * 60 * 1000 })
              break
            } catch (dbErr: any) {
              addLog('warn', 'ws', `Auth DB attempt ${attempt} failed: ${dbErr.message?.split('\n')[0]}`)
              if (attempt === 2) {
                try { ws.send(JSON.stringify({ type: 'error', message: 'Database error — the server is waking up. Please try again in 10 seconds.' })) } catch {}
                ws.close(4500, 'Auth error'); return
              }
              await new Promise(r => setTimeout(r, 5000))
            }
          }
        }
        if (!apiToken?.active) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'Invalid token — open your Voice Agent in ServiceNow and click "Sync with SaaS", then update the embed snippet on your portal.' })) } catch {}
          ws.close(4003, 'Invalid token'); return
        }

        // Resolution order: instance-token → agent-token → tenant-fallback
        if (apiToken.instance?.tenant) {
          instanceRef = apiToken.instance
          tenantRef = apiToken.instance.tenant
        } else if (apiToken.agent?.instance?.tenant) {
          instanceRef = apiToken.agent.instance
          tenantRef = apiToken.agent.instance.tenant
          if (apiToken.agent.snAgentId) pinnedAgentSnId = apiToken.agent.snAgentId
          pinnedAgentId = apiToken.agent.id
        } else if (apiToken.tenant) {
          tenantRef = apiToken.tenant
          instanceRef = await db.instance.findFirst({
            where: { tenantId: tenantRef.id, active: true },
            orderBy: { createdAt: 'asc' },
          })
          if (!instanceRef) {
            try { ws.send(JSON.stringify({ type: 'error', message: 'No ServiceNow instance configured — go to ZeVox Dashboard → Connection and add your instance.' })) } catch {}
            ws.close(4003, 'No instance configured'); return
          }
        } else {
          try { ws.send(JSON.stringify({ type: 'error', message: 'Token not linked to an instance — click "Sync with SaaS" on your Voice Agent record in ServiceNow.' })) } catch {}
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
      } catch (err: any) {
        addLog('error', 'ws', 'Auth error: ' + err.message)
        try { ws.send(JSON.stringify({ type: 'error', message: 'Auth error: ' + (err.message || 'Unknown') })) } catch {}
        ws.close(4500, 'Error'); return
      }

      addLog('info', 'ws', 'Authed after ' + (Date.now() - connectionStartTime) + 'ms. Tenant=' + tenantRef.id + ' Instance=' + instanceRef.id + ' SN=' + instanceRef.snInstanceUrl, { tenantId: tenantRef.id })

      // Guard: browser may have closed the WS during the DB auth round-trip
      // (cold Neon start can take 3-5 s). Bail out here so we don't create an
      // orphaned pipeline that runs forever with no client to receive audio.
      if (wsClosed) {
        addLog('warn', 'ws', 'WS closed before auth completed — aborting pipeline creation', { tenantId: tenantRef.id })
        return
      }

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
      pipeline.on('error', (e: any) => {
        const errMsg = String(e.message || e)
        addLog('error', 'pipeline', errMsg, { tenantId: tenantRef.id })
        console.error('[WS] Pipeline error (will close 4500):', errMsg)
        try { ws.send(JSON.stringify({ type: 'error', message: errMsg })) } catch {}
        // Close with a non-1000 code so the client knows it was an error,
        // and Render doesn't kill it with 1006 (abnormal closure).
        try { ws.close(4500, errMsg.substring(0, 100)) } catch {}
      })
      pipeline.on('ended', () => { addLog('info', 'pipeline', 'ENDED', { tenantId: tenantRef.id }); send(ws, { type: 'ended' }) })
      pipeline.on('navigate', (d: any) => { addLog('info', 'pipeline', 'NAV ' + (d.urls?.length || 0) + ' url(s)', { tenantId: tenantRef.id }); send(ws, { type: 'navigate', urls: d.urls }) })
      pipeline.on('attachment_requested', (d: any) => { addLog('info', 'pipeline', 'Attachment requested: ' + d.reason, { tenantId: tenantRef.id }); send(ws, { type: 'attachment_requested', url: d.url, reason: d.reason }) })
      pipeline.on('form_update', (d: any) => { addLog('info', 'pipeline', 'Form update ' + (d.applyNow ? '(direct)' : '(suggestion)') + ': ' + d.field + ' → ' + d.valueLabel, { tenantId: tenantRef.id }); send(ws, { type: 'form_update', field: d.field, value: d.value, valueLabel: d.valueLabel, applyNow: d.applyNow }) })
      pipeline.on('suggestion', (d: any) => { addLog('info', 'pipeline', 'Suggestion (' + d.sugType + '): ' + String(d.text).substring(0, 60), { tenantId: tenantRef.id }); send(ws, { type: 'suggestion', sugType: d.sugType, text: d.text }) })

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
