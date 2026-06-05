/**
 * ManageEnginePipeline — self-contained voice pipeline for ManageEngine ServiceDesk.
 *
 * Unlike VoicePipeline (which delegates tools to ServiceNow), this pipeline:
 *  - Manages its own LLM config (from the ManageEngineAgent DB record)
 *  - Has built-in tools that call the ME REST API directly
 *  - Uses the same STT/TTS infrastructure (Deepgram + OpenAI TTS fallback)
 *  - Exposes the same EventEmitter interface so server.ts can use it identically
 *
 * Built-in tools: create_request · get_request · update_request · list_requests
 */

import { EventEmitter } from 'events'
import { addLog } from '../lib/log-store'

export interface MEAgentConfig {
  id: string
  tenantId: string
  name: string
  meUrl: string
  apiKey: string
  llmProvider: string
  llmApiKey: string
  llmModel: string
  llmBaseUrl: string
  ttsVoice: string
  sttLanguage: string
  greeting: string
  identity: string
  instructions: string
}

const ME_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_request',
      description: 'Create a new IT support request/ticket in ManageEngine ServiceDesk. Use when the user wants to log a new issue, request, or problem.',
      parameters: {
        type: 'object',
        properties: {
          subject:        { type: 'string', description: 'Brief title of the issue (required).' },
          description:    { type: 'string', description: 'Detailed description of the issue.' },
          priority:       { type: 'string', enum: ['High', 'Medium', 'Low', 'Normal'], description: 'Ticket priority.' },
          requester_name: { type: 'string', description: 'Name of the person reporting the issue.' },
          category:       { type: 'string', description: 'Category of the request, e.g. Hardware, Software, Network.' },
        },
        required: ['subject'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_request',
      description: 'Get the full details and current status of an existing IT support ticket by its ID.',
      parameters: {
        type: 'object',
        properties: {
          request_id: { type: 'string', description: 'The numeric ticket/request ID.' },
        },
        required: ['request_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_request',
      description: 'Update an existing IT support ticket — change status, add a note, or reassign.',
      parameters: {
        type: 'object',
        properties: {
          request_id:  { type: 'string', description: 'The numeric ticket ID to update.' },
          status:      { type: 'string', description: 'New status, e.g. "Open", "In Progress", "Resolved", "Closed".' },
          description: { type: 'string', description: 'Additional note or update to append.' },
          technician:  { type: 'string', description: 'Technician login name to assign the ticket to.' },
        },
        required: ['request_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_requests',
      description: 'List recent IT support tickets. Use when the user asks about open tickets, their requests, or wants an overview.',
      parameters: {
        type: 'object',
        properties: {
          limit:  { type: 'number', description: 'Maximum number of tickets to return (default 5, max 10).' },
          status: { type: 'string', description: 'Filter by status: "Open", "In Progress", "Resolved". Omit for all recent.' },
        },
        required: [],
      },
    },
  },
]

export class ManageEnginePipeline extends EventEmitter {
  private agentConfig: MEAgentConfig
  private messages: any[] = []
  private stt: any = null
  private ttsKey: string = ''
  private ttsVoice: string = 'aura-asteria-en'
  private ttsWs: any = null
  private ttsKeepAlive: ReturnType<typeof setInterval> | null = null
  private ttsAudioBuffer: Buffer[] = []
  private ttsResolve: (() => void) | null = null
  private llm: any = null
  private detectedLanguage: string = ''
  private isAgentSpeaking = false
  private isBargingIn = false
  private utteranceBuffer = ''
  private processing = false
  private startedAt = Date.now()
  private stopped = false
  public toolCallCount = 0

  private messageQueue: string[] = []
  private pendingConfirmation: null = null  // ME tools don't use SN-style confirmation

  constructor(agent: MEAgentConfig) {
    super()
    this.agentConfig = agent
  }

  async start(): Promise<void> {
    const cfg = this.agentConfig
    addLog('info', 'me-pipeline', `Starting ME pipeline for agent "${cfg.name}"`, { tenantId: cfg.tenantId })

    try {
      // ── Build system prompt ──
      const prompt =
        cfg.identity + '\n\n' +
        cfg.instructions + '\n\n' +
        `VOICE: Live voice call. 1-2 sentences max. No markdown. Lead with the answer.\n\n` +
        `LANGUAGE: Always respond in the same language the user speaks. If Hindi, respond in Hindi. Match their language throughout.\n\n` +
        `TOOL RULES:\n` +
        `1. Never make up ticket IDs or data. If a field is missing, ask the user.\n` +
        `2. After creating a ticket, always read back the ticket ID number.\n` +
        `3. Keep confirmations brief — one sentence.\n` +
        `4. For list_requests, summarize the top results in plain speech (no lists).`

      this.messages.push({ role: 'system', content: prompt })

      // ── STT ──
      const WebSocket = require('ws')
      const dgKey = process.env.DEEPGRAM_API_KEY
      if (!dgKey) throw new Error('DEEPGRAM_API_KEY not configured')

      const sttLang = (cfg.sttLanguage || 'multi').toLowerCase()
      if (sttLang !== 'multi' && !sttLang.startsWith('en')) {
        this.detectedLanguage = sttLang.split('-')[0]
      }

      const sttParams = new URLSearchParams({
        model: 'nova-3',
        language: sttLang,
        smart_format: 'true',
        punctuate: 'true',
        interim_results: 'true',
        utterance_end_ms: '1500',
        endpointing: '800',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
      })
      this.stt = new WebSocket(`wss://api.deepgram.com/v1/listen?${sttParams}`, {
        headers: { 'Authorization': `Token ${dgKey}` },
      })
      this.setupSTT()

      // ── TTS ──
      this.ttsKey = process.env.DEEPGRAM_API_KEY || ''
      this.ttsVoice = cfg.ttsVoice || 'aura-asteria-en'
      await this.connectTtsWs()

      // ── LLM ──
      const OpenAI = require('openai')
      let llmBase = (cfg.llmBaseUrl || 'https://api.openai.com/v1').replace(/\/chat\/completions\/?$/, '')
      this.llm = new OpenAI({ apiKey: cfg.llmApiKey, baseURL: llmBase })

      // ── Speak greeting ──
      if (cfg.greeting) {
        this.isAgentSpeaking = true
        this.emit('state', 'speaking')
        await this.speakAndStreamAny(cfg.greeting)
        this.isAgentSpeaking = false
      }

      this.emit('state', 'listening')
      this.emit('ready', { sessionId: 'me-' + cfg.id, greeting: cfg.greeting })

    } catch (err: any) {
      addLog('error', 'me-pipeline', 'Start failed: ' + err.message, { tenantId: this.agentConfig.tenantId })
      this.emit('error', { message: 'Voice agent connection failed: ' + err.message })
    }
  }

  feedAudio(buffer: Buffer) {
    if (this.stt && this.stt.readyState === 1) {
      try { this.stt.send(buffer) } catch {}
    }
  }

  processText(text: string) {
    if (text.trim()) this.processUserMessage(text.trim())
  }

  // ME doesn't use SN-style confirmations — stub for interface compatibility
  async handleConfirmation(_toolSysId: string, _inputParams: any, _confirmed: boolean) {}

  getUsageStats() {
    let inputTokens = 0, outputTokens = 0
    for (const m of this.messages) {
      const len = (typeof m.content === 'string' ? m.content : '').length
      if (m.role === 'user') inputTokens += Math.ceil(len / 4)
      else if (m.role === 'assistant') outputTokens += Math.ceil(len / 4)
      else if (m.role === 'system') inputTokens += Math.ceil(len / 4)
    }
    return { inputTokens, outputTokens, toolCalls: this.toolCallCount }
  }

  async stop() {
    if (this.stopped) return
    this.stopped = true
    if (this.stt) { try { this.stt.close() } catch {} }
    if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null }
    if (this.ttsWs) { try { this.ttsWs.close() } catch {}; this.ttsWs = null }
    this.emit('ended')
  }

  // ── STT ──
  private setupSTT() {
    this.stt.on('open', () => addLog('info', 'me-stt', 'Deepgram connected', { tenantId: this.agentConfig.tenantId }))
    this.stt.on('message', (data: any) => {
      let parsed: any
      try { const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data); parsed = JSON.parse(raw) } catch { return }

      if (parsed.type === 'Results') {
        const transcript = parsed.channel?.alternatives?.[0]?.transcript
        if (!transcript) return
        if (parsed.channel?.detected_language) {
          const lang = (parsed.channel.detected_language as string).split('-')[0].toLowerCase()
          if (lang && lang !== this.detectedLanguage) this.detectedLanguage = lang
        }
        if (parsed.is_final) {
          if (this.isAgentSpeaking) {
            this.isBargingIn = true
            this.isAgentSpeaking = false
            this.emit('barge_in')
            this.emit('state', 'listening')
          }
          this.utteranceBuffer += ' ' + transcript
          this.utteranceBuffer = this.utteranceBuffer.trim()
          this.emit('transcript', { text: this.utteranceBuffer, isFinal: true })
          if (parsed.speech_final && this.utteranceBuffer && !this.processing) {
            const msg = this.utteranceBuffer; this.utteranceBuffer = ''
            this.processUserMessage(msg)
          }
        } else {
          const preview = this.utteranceBuffer ? this.utteranceBuffer + ' ' + transcript : transcript
          this.emit('transcript', { text: preview, isFinal: false })
        }
      }
      if (parsed.type === 'UtteranceEnd') {
        if (this.utteranceBuffer && !this.processing) {
          const msg = this.utteranceBuffer; this.utteranceBuffer = ''
          this.processUserMessage(msg)
        }
      }
    })
    this.stt.on('error', (e: any) => addLog('error', 'me-stt', e.message, { tenantId: this.agentConfig.tenantId }))
    this.stt.on('close', () => {
      if (this.utteranceBuffer && !this.processing) {
        const msg = this.utteranceBuffer; this.utteranceBuffer = ''
        this.processUserMessage(msg).catch(() => {})
      }
    })
  }

  // ── User message processing ──
  private isGoodbye(msg: string) {
    const l = msg.toLowerCase().trim()
    return ['bye', 'goodbye', 'thank you', 'thanks', "that's all", "that's it", 'nothing else', 'no thanks'].some(p => l.includes(p))
  }

  private async processUserMessage(message: string) {
    if (!message.trim() || this.stopped) return
    if (this.processing) { this.messageQueue.push(message); return }
    this.isBargingIn = false
    this.processing = true
    this.emit('user_message', message)
    this.messages.push({ role: 'user', content: message })

    if (this.isGoodbye(message)) {
      this.isAgentSpeaking = true
      this.emit('state', 'speaking')
      const tools = this.llm ? ME_TOOLS : []
      const savedTools = ME_TOOLS
      const closingResult = await this.callLLM(false)
      if (closingResult.text) this.messages.push({ role: 'assistant', content: closingResult.text })
      this.isAgentSpeaking = false
      this.processing = false
      this.emit('ended')
      return
    }

    this.isAgentSpeaking = true
    this.emit('state', 'processing')

    try {
      let iteration = 0
      const MAX = 5
      while (iteration < MAX) {
        iteration++
        const forceText = iteration > 1
        const result = await this.callLLM(forceText)

        if (!result.toolCalls?.length) {
          if (result.text) this.messages.push({ role: 'assistant', content: result.text })
          break
        }

        for (const tc of result.toolCalls) {
          if (this.stopped) break
          this.toolCallCount++
          addLog('info', 'me-pipeline', `ME tool: ${tc.name}`, { tenantId: this.agentConfig.tenantId })

          const toolOutput = await this.executeMETool(tc.name, tc.arguments || {})
          addLog('info', 'me-pipeline', `ME tool result: ${JSON.stringify(toolOutput).substring(0, 200)}`, { tenantId: this.agentConfig.tenantId })

          this.messages.push({
            role: 'assistant',
            content: (result.text || null),
            tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
          })
          const out = JSON.stringify(toolOutput)
          this.messages.push({
            role: 'tool', tool_call_id: tc.id,
            content: out.length > 1000 ? out.slice(0, 999) + '…' : out,
          })
        }
      }

      if (!this.isBargingIn) {
        this.isAgentSpeaking = false
        this.emit('state', 'listening')
      }
    } catch (err: any) {
      addLog('error', 'me-pipeline', 'Turn error: ' + err.message, { tenantId: this.agentConfig.tenantId })
      const fallback = 'Sorry, I ran into an issue. Please try again.'
      this.emit('agent_message', fallback)
      await this.speakAndStreamAny(fallback)
      this.isAgentSpeaking = false
      this.emit('ended')
    } finally {
      this.processing = false
      if (!this.stopped && this.messageQueue.length > 0) {
        const next = this.messageQueue.shift()!
        this.processUserMessage(next)
      }
    }
  }

  // ── LLM call (streaming) ──
  private async callLLM(forceText = false): Promise<{ text: string; toolCalls: any[] }> {
    const system = this.messages.filter(m => m.role === 'system').slice(0, 1)
    const conv = this.messages.filter(m => m.role !== 'system').slice(-8)

    const params: any = {
      model: this.agentConfig.llmModel || 'gpt-4o-mini',
      messages: [...system, ...conv],
      temperature: 0.4,
      max_tokens: 200,
      stream: true,
    }
    if (!forceText) {
      params.tools = ME_TOOLS
      params.tool_choice = 'auto'
      params.parallel_tool_calls = false
    }

    let fullText = ''
    let sentenceBuffer = ''
    const toolCallDeltas: any[] = []
    let hasStartedSpeaking = false

    try {
      const stream = await this.llm.chat.completions.create(params)
      for await (const chunk of stream) {
        if (this.isBargingIn) break
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        if (delta.content) {
          fullText += delta.content
          sentenceBuffer += delta.content
          if (/[.!?]\s*$/.test(sentenceBuffer) || sentenceBuffer.length > 200) {
            const sentence = this.sanitize(sentenceBuffer.trim()); sentenceBuffer = ''
            if (sentence && !this.isBargingIn) {
              if (!hasStartedSpeaking) { hasStartedSpeaking = true; this.emit('state', 'speaking') }
              this.emit('agent_message', sentence)
              await this.speakAndStreamAny(sentence)
            }
          }
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCallDeltas[tc.index]) toolCallDeltas[tc.index] = { id: '', name: '', arguments: '' }
              if (tc.id) toolCallDeltas[tc.index].id = tc.id
              if (tc.function?.name) toolCallDeltas[tc.index].name = tc.function.name
              if (tc.function?.arguments) toolCallDeltas[tc.index].arguments += tc.function.arguments
            }
          }
        }
      }
      if (sentenceBuffer.trim() && !this.isBargingIn) {
        const rem = this.sanitize(sentenceBuffer.trim())
        if (rem) { if (!hasStartedSpeaking) this.emit('state', 'speaking'); this.emit('agent_message', rem); await this.speakAndStreamAny(rem) }
      }
    } catch (err: any) {
      addLog('error', 'me-llm', err.message, { tenantId: this.agentConfig.tenantId })
      throw err
    }

    const toolCalls = toolCallDeltas
      .filter(tc => tc?.name)
      .map(tc => ({ id: tc.id, name: tc.name, arguments: (() => { try { return JSON.parse(tc.arguments) } catch { return {} } })() }))

    return { text: fullText.trim(), toolCalls }
  }

  // ── ManageEngine REST API tool execution ──
  private async executeMETool(toolName: string, args: any): Promise<any> {
    const { meUrl, apiKey } = this.agentConfig
    const base = meUrl.replace(/\/$/, '')

    try {
      switch (toolName) {
        case 'create_request': {
          const requestData: any = { subject: args.subject || 'Untitled request' }
          if (args.description) requestData.description = args.description
          if (args.priority) requestData.priority = { name: args.priority }
          if (args.requester_name) requestData.requester = { name: args.requester_name }
          if (args.category) requestData.category = { name: args.category }

          const res = await fetch(`${base}/api/v3/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'technician_key': apiKey },
            body: `input_data=${encodeURIComponent(JSON.stringify({ request: requestData }))}`,
          })
          const data = await res.json()
          const req = data.request || data
          return { success: true, ticket_id: req.id || req.request_id, subject: req.subject, status: req.status?.name, message: `Ticket created with ID ${req.id || req.request_id}` }
        }

        case 'get_request': {
          const res = await fetch(`${base}/api/v3/requests/${args.request_id}`, {
            headers: { 'technician_key': apiKey },
          })
          const data = await res.json()
          const req = data.request || data
          return {
            success: true,
            ticket_id: req.id,
            subject: req.subject,
            status: req.status?.name,
            priority: req.priority?.name,
            technician: req.technician?.name,
            created_time: req.created_time?.display_value,
            description: (req.description || '').substring(0, 300),
          }
        }

        case 'update_request': {
          const updateData: any = {}
          if (args.status) updateData.status = { name: args.status }
          if (args.description) updateData.description = args.description
          if (args.technician) updateData.technician = { login_name: args.technician }

          const res = await fetch(`${base}/api/v3/requests/${args.request_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'technician_key': apiKey },
            body: `input_data=${encodeURIComponent(JSON.stringify({ request: updateData }))}`,
          })
          const data = await res.json()
          const req = data.request || data
          return { success: true, ticket_id: req.id, status: req.status?.name, message: `Ticket ${args.request_id} updated` }
        }

        case 'list_requests': {
          const limit = Math.min(args.limit || 5, 10)
          const listInfo: any = { row_count: limit, start_index: 1, sort_field: 'created_time', sort_order: 'desc' }
          if (args.status) listInfo.search_criteria = [{ field: 'status.name', condition: 'is', value: args.status }]

          const res = await fetch(`${base}/api/v3/requests?input_data=${encodeURIComponent(JSON.stringify({ list_info: listInfo }))}`, {
            headers: { 'technician_key': apiKey },
          })
          const data = await res.json()
          const requests = (data.requests || []).map((r: any) => ({
            id: r.id, subject: r.subject, status: r.status?.name, priority: r.priority?.name,
          }))
          return { success: true, count: requests.length, requests, message: `Found ${requests.length} ticket(s)` }
        }

        default:
          return { success: false, error: `Unknown tool: ${toolName}` }
      }
    } catch (err: any) {
      addLog('error', 'me-pipeline', `ME API error (${toolName}): ${err.message}`, { tenantId: this.agentConfig.tenantId })
      return { success: false, error: err.message }
    }
  }

  // ── Sanitize text before TTS ──
  private sanitize(text: string): string {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]{50,}\}/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*_#`]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // ── Multilingual TTS routing ──
  private async speakAndStreamAny(text: string): Promise<void> {
    if (!text || this.isBargingIn) return
    const isNonEnglish = !!this.detectedLanguage && this.detectedLanguage !== 'en'
    const hasNonLatinScript = /[ɐ-￿]/.test(text)
    if ((isNonEnglish || hasNonLatinScript) && process.env.OPENAI_API_KEY) {
      await this.speakWithOpenAI(text)
    } else {
      await this.speakAndStream(text)
    }
  }

  private async speakWithOpenAI(text: string): Promise<void> {
    if (!text || this.isBargingIn) return
    try {
      const OpenAI = require('openai')
      const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const response = await oai.audio.speech.create({ model: 'tts-1', voice: 'alloy', input: text, response_format: 'pcm' })
      if (this.isBargingIn) return
      const buf = Buffer.from(await response.arrayBuffer())
      const CHUNK = 4096
      for (let i = 0; i < buf.length; i += CHUNK) { if (this.isBargingIn) break; this.emit('audio', buf.slice(i, i + CHUNK)) }
    } catch (e: any) {
      addLog('error', 'me-tts', 'OpenAI TTS failed: ' + e.message, { tenantId: this.agentConfig.tenantId })
      await this.speakAndStream(text)
    }
  }

  // ── Deepgram TTS WebSocket ──
  private async connectTtsWs(): Promise<void> {
    const WebSocket = require('ws')
    return new Promise((resolve, reject) => {
      const url = `wss://api.deepgram.com/v1/speak?model=${this.ttsVoice}&encoding=linear16&sample_rate=24000`
      this.ttsWs = new WebSocket(url, { headers: { 'Authorization': `Token ${this.ttsKey}` } })
      this.ttsWs.on('open', () => {
        if (this.ttsKeepAlive) clearInterval(this.ttsKeepAlive)
        this.ttsKeepAlive = setInterval(() => {
          if (this.ttsWs?.readyState === 1) { try { this.ttsWs.send(JSON.stringify({ type: 'KeepAlive' })) } catch {} }
          else { if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null } }
        }, 8000)
        resolve()
      })
      this.ttsWs.on('message', (data: any, isBinary: boolean) => {
        if (isBinary && Buffer.isBuffer(data) && data.length > 10 && !this.isBargingIn) {
          this.emit('audio', data)
          this.ttsAudioBuffer.push(data)
        } else if (!isBinary || (Buffer.isBuffer(data) && data[0] === 0x7b)) {
          try {
            const msg = JSON.parse(Buffer.isBuffer(data) ? data.toString() : data)
            if (msg.type === 'Flushed') { this.ttsAudioBuffer = []; if (this.ttsResolve) { this.ttsResolve(); this.ttsResolve = null } }
          } catch {}
        }
      })
      this.ttsWs.on('error', (e: any) => reject(e))
      this.ttsWs.on('close', () => { if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null }; this.ttsWs = null })
      setTimeout(() => reject(new Error('TTS timeout')), 5000)
    })
  }

  private async speakAndStream(rawText: string): Promise<void> {
    const text = this.sanitize(rawText)
    if (!text || this.isBargingIn) return
    if (!this.ttsWs || this.ttsWs.readyState !== 1) {
      try { await this.connectTtsWs() } catch (e: any) { addLog('error', 'me-tts', 'Reconnect failed: ' + e.message, { tenantId: this.agentConfig.tenantId }); return }
    }
    this.ttsAudioBuffer = []
    try {
      this.ttsWs.send(JSON.stringify({ type: 'Speak', text }))
      this.ttsWs.send(JSON.stringify({ type: 'Flush' }))
      await new Promise<void>((resolve) => {
        this.ttsResolve = resolve
        setTimeout(() => { if (this.ttsResolve) { this.ttsResolve(); this.ttsResolve = null } }, 15000)
      })
    } catch (err: any) {
      addLog('error', 'me-tts', err.message, { tenantId: this.agentConfig.tenantId })
    }
  }
}
