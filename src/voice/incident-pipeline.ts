/**
 * IncidentPipeline — dedicated voice agent for incident form resolution.
 * Completely separate from the portal VoicePipeline / SN agent orchestrator.
 * Uses env-configured LLM (GROQ_API_KEY) + shared Deepgram key for STT/TTS.
 *
 * All form field updates require explicit user confirmation (voice or button).
 */
import { EventEmitter } from 'events'
import { addLog } from '../lib/log-store'

type IncidentCtx = Record<string, string>

const STATE_LABELS: Record<string, string> = {
  '1': 'New', '2': 'In Progress', '3': 'On Hold',
  '6': 'Resolved', '7': 'Closed', '8': 'Canceled',
}
const PRIORITY_LABELS: Record<string, string> = {
  '1': '1 - Critical', '2': '2 - High', '3': '3 - Moderate', '4': '4 - Low',
}
const FIELD_LABELS: Record<string, string> = {
  number: 'Incident Number', short_description: 'Short Description',
  description: 'Description', state: 'State', priority: 'Priority',
  urgency: 'Urgency', category: 'Category', subcategory: 'Subcategory',
  assignment_group: 'Assignment Group', assigned_to: 'Assigned To',
  caller_id: 'Caller', comments: 'Caller Comments', work_notes: 'Work Notes',
  close_notes: 'Resolution Notes', impact: 'Impact',
  opened_at: 'Opened At', opened_by: 'Opened By',
}

const INCIDENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'update_incident_field',
      description:
        'Request permission to update a field on the incident form. Always verbally explain what you want to update and why BEFORE calling this tool. The user will see a Confirm / Cancel prompt in the widget and can also say yes or no. Fields: state, priority, urgency, assignment_group, assigned_to, category, subcategory.',
      parameters: {
        type: 'object',
        properties: {
          field:       { type: 'string', description: 'ServiceNow field name, e.g. "state".' },
          value:       { type: 'string', description: 'Raw field value, e.g. "6" for Resolved.' },
          value_label: { type: 'string', description: 'Human-readable label, e.g. "Resolved".' },
          reason:      { type: 'string', description: 'One-sentence reason for the change.' },
        },
        required: ['field', 'value', 'value_label', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_resolution_note',
      description:
        'Generate resolution notes text to fill in the close_notes field. Call when the user asks for resolution notes, a closing summary, or how to document the fix.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The resolution note text.' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_reply_to_caller',
      description:
        'Draft a customer-facing message to post in the incident comments field for the caller to see. Call when the user wants to respond to the caller or add a status update for the end user.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The reply / comment text for the caller.' },
        },
        required: ['text'],
      },
    },
  },
]

export class IncidentPipeline extends EventEmitter {
  private ctx: IncidentCtx
  private messages: any[] = []
  private stt: any = null
  private ttsWs: any = null
  private ttsKey = ''
  private ttsVoice = 'aura-asteria-en'
  private llm: any = null
  private model = 'llama-3.3-70b-versatile'
  private isAgentSpeaking = false
  private isBargingIn = false
  private utteranceBuffer = ''
  private processing = false
  private stopped = false
  private ttsAudioBuffer: Buffer[] = []
  private ttsResolve: (() => void) | null = null
  private messageQueue: string[] = []

  // Pending field-update confirmation (one at a time)
  private pendingConfirm: {
    confirmId: string; field: string; value: string; valueLabel: string
  } | null = null

  constructor(ctx: IncidentCtx) {
    super()
    this.ctx = ctx || {}
  }

  /* ── Public entry point ─────────────────────────────────────────────── */
  async start() {
    try {
      // STT — always use shared Deepgram key
      const dgKey = process.env.DEEPGRAM_API_KEY
      if (!dgKey) throw new Error('DEEPGRAM_API_KEY not configured')

      const { DeepgramClient } = require('@deepgram/sdk')
      const dgClient = new DeepgramClient(dgKey)
      addLog('info', 'incident-stt', 'Connecting Deepgram STT…', {})
      this.stt = await dgClient.listen.v1.connect({
        model: 'nova-3',
        language: 'multi',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1500,
        endpointing: 800,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
      })
      this.setupSTT()
      if (typeof this.stt.connect === 'function') await this.stt.connect()

      // TTS
      this.ttsKey = dgKey
      this.ttsVoice = process.env.INCIDENT_TTS_VOICE || 'aura-asteria-en'
      await this.connectTtsWs()
      addLog('info', 'incident-tts', 'TTS ready: ' + this.ttsVoice, {})

      // LLM — Groq preferred, OpenAI fallback
      const llmKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY
      if (!llmKey) throw new Error('No LLM key — set GROQ_API_KEY or OPENAI_API_KEY')
      const useGroq = !!process.env.GROQ_API_KEY
      const OpenAI = require('openai')
      this.llm = new OpenAI({
        apiKey: llmKey,
        baseURL: useGroq ? (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1') : undefined,
      })
      this.model = process.env.INCIDENT_LLM_MODEL || (useGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini')
      addLog('info', 'incident-llm', 'LLM ready: ' + this.model, {})

      // System prompt with full incident context
      this.messages.push({ role: 'system', content: this.buildSystemPrompt() })

      // Greeting — summarise the incident immediately
      const inc = this.ctx
      const greet = inc.number
        ? `I've loaded ${inc.number}${inc.short_description ? ', "' + inc.short_description + '"' : ''}. What would you like help with?`
        : 'Incident agent ready. What would you like help with?'

      this.isAgentSpeaking = true
      this.emit('state', 'speaking')
      await this.speakAndStream(greet)
      this.isAgentSpeaking = false
      this.emit('state', 'listening')
      this.emit('ready', { greeting: greet })

    } catch (err: any) {
      addLog('error', 'incident-pipeline', 'Start failed: ' + err.message, {})
      this.emit('error', { message: 'Incident agent failed: ' + err.message })
    }
  }

  feedAudio(buffer: Buffer) {
    if (!this.stt) return
    try {
      if (typeof this.stt.sendMedia === 'function') this.stt.sendMedia(buffer)
      else if (typeof this.stt.send === 'function') this.stt.send(buffer)
    } catch {}
  }

  /* Called by the server when the widget sends {type:'field_confirm'} */
  handleFieldConfirm(confirmId: string, confirmed: boolean) {
    if (!this.pendingConfirm || this.pendingConfirm.confirmId !== confirmId) return
    const { field, value, valueLabel } = this.pendingConfirm
    this.pendingConfirm = null
    if (confirmed) {
      this.emit('form_update', { field, value, valueLabel, applyNow: true })
      this.processUserMessage(`[SYSTEM] User confirmed updating ${field} to "${valueLabel}".`).catch(() => {})
    } else {
      this.processUserMessage('[SYSTEM] User declined the field update.').catch(() => {})
    }
  }

  async stop() {
    if (this.stopped) return
    this.stopped = true
    try { if (this.stt?.close) this.stt.close() } catch {}
    try { if (this.ttsWs?.close) this.ttsWs.close() } catch {}
    this.ttsWs = null
    this.emit('ended')
  }

  /* ── System prompt ──────────────────────────────────────────────────── */
  private buildSystemPrompt(): string {
    const lines: string[] = []
    for (const [k, v] of Object.entries(this.ctx)) {
      if (!v || k === 'sys_id' || k === 'state_display') continue
      let val = String(v)
      if (k === 'state')    val = STATE_LABELS[val]    || val
      if (k === 'priority') val = PRIORITY_LABELS[val] || val
      lines.push(`  ${FIELD_LABELS[k] || k}: ${val}`)
    }

    return `You are a dedicated Incident Resolution Assistant embedded in a ServiceNow incident form. You are speaking with the ASSIGNED AGENT who is working to resolve this ticket — not the end user / caller.

CURRENT INCIDENT:
${lines.length ? lines.join('\n') : '  (No details captured — ask the agent what they need help with)'}

YOUR RESPONSIBILITIES:
1. Analyse the incident description and caller comments to understand the root cause
2. Suggest practical resolution steps specific to this incident
3. Draft replies / updates to send to the caller (suggest_reply_to_caller)
4. Generate resolution notes when the issue is fixed (suggest_resolution_note)
5. Propose field changes when appropriate (update_incident_field) — ALWAYS explain why first and wait for confirmation
6. Provide a clear incident summary when asked

CONFIRMATION RULE: You MUST verbally explain any field change you want to make BEFORE calling update_incident_field. The user will then see a Confirm / Cancel button and can also say yes or no. Never apply changes silently.

VOICE RULES: Keep replies to 1–3 sentences. No markdown, no bullet points, no formatting. Speak naturally.`
  }

  /* ── User message processing ────────────────────────────────────────── */
  private async processUserMessage(message: string) {
    if (!message.trim()) return
    if (this.processing) { this.messageQueue.push(message); return }

    this.isBargingIn = false

    // Voice-driven confirmation when awaiting a field update confirmation
    if (this.pendingConfirm && !message.startsWith('[SYSTEM]')) {
      const lower = message.toLowerCase().replace(/[.,!?]/g, '')
      const yes = /\b(yes|yeah|yep|confirm|sure|ok|okay|go ahead|do it|absolutely|please)\b/.test(lower)
      const no  = /\b(no|nope|cancel|stop|dont|don't|decline|not now|hold on)\b/.test(lower)
      if (yes || no) {
        const pc = this.pendingConfirm
        this.pendingConfirm = null
        this.processing = true
        this.messages.push({ role: 'user', content: message })
        this.emit('user_message', message)
        if (yes) {
          this.emit('form_update', { field: pc.field, value: pc.value, valueLabel: pc.valueLabel, applyNow: true })
          const resp = `Done, I've updated ${FIELD_LABELS[pc.field] || pc.field} to "${pc.valueLabel}".`
          this.emit('agent_message', resp)
          await this.speakAndStream(resp)
          this.messages.push({ role: 'assistant', content: resp })
        } else {
          const resp = "Okay, I've cancelled that update. What else can I help you with?"
          this.emit('agent_message', resp)
          await this.speakAndStream(resp)
          this.messages.push({ role: 'assistant', content: resp })
        }
        this.processing = false
        this.emit('state', 'listening')
        // Drain queue
        if (!this.stopped && this.messageQueue.length > 0) {
          this.processUserMessage(this.messageQueue.shift()!)
        }
        return
      }
    }

    this.processing = true
    if (!message.startsWith('[SYSTEM]')) {
      this.emit('user_message', message)
    }
    this.messages.push({ role: 'user', content: message })
    this.isAgentSpeaking = true
    this.emit('state', 'processing')

    try {
      const result = await this.callLLM()

      // Handle tool calls
      for (const tc of (result.toolCalls || [])) {
        if (tc.name === 'update_incident_field') {
          const confirmId = 'cf_' + Date.now()
          const { field = '', value = '', value_label: valueLabel = value, reason = '' } = tc.arguments || {}
          this.pendingConfirm = { confirmId, field, value, valueLabel }
          addLog('info', 'incident-pipeline', `Field update pending: ${field} → ${valueLabel}`, {})
          this.emit('field_update_pending', { confirmId, field, value, valueLabel, reason })
          this.messages.push({
            role: 'assistant', content: result.text || null,
            tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
          })
          this.messages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ message: `Waiting for user to confirm updating ${field} to "${valueLabel}".` }),
          })

        } else if (tc.name === 'suggest_resolution_note') {
          const text = tc.arguments?.text || ''
          addLog('info', 'incident-pipeline', 'Resolution suggestion: ' + text.substring(0, 60), {})
          this.emit('suggestion', { sugType: 'resolution', text })
          this.messages.push({
            role: 'assistant', content: result.text || null,
            tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
          })
          this.messages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ message: 'Resolution note suggestion shown in the widget.' }),
          })

        } else if (tc.name === 'suggest_reply_to_caller') {
          const text = tc.arguments?.text || ''
          addLog('info', 'incident-pipeline', 'Reply suggestion: ' + text.substring(0, 60), {})
          this.emit('suggestion', { sugType: 'reply', text })
          this.messages.push({
            role: 'assistant', content: result.text || null,
            tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
          })
          this.messages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify({ message: 'Reply suggestion shown in the widget.' }),
          })
        }
      }

      if (result.text && !result.toolCalls?.length) {
        this.messages.push({ role: 'assistant', content: result.text })
      }

      this.isAgentSpeaking = false
      this.emit('state', 'listening')

    } catch (err: any) {
      addLog('error', 'incident-pipeline', 'LLM error: ' + err.message, {})
      const fallback = 'Sorry, I ran into a problem. Please try again.'
      this.emit('agent_message', fallback)
      await this.speakAndStream(fallback)
      this.isAgentSpeaking = false
      this.emit('state', 'listening')
    } finally {
      this.processing = false
      if (!this.stopped && this.messageQueue.length > 0) {
        this.processUserMessage(this.messageQueue.shift()!)
      }
    }
  }

  /* ── LLM streaming ──────────────────────────────────────────────────── */
  private async callLLM(): Promise<{ text: string; toolCalls: any[] }> {
    // Keep system prompt + last 12 turns to avoid context blowup
    const system  = this.messages.filter(m => m.role === 'system')
    const history = this.messages.filter(m => m.role !== 'system').slice(-12)

    const params: any = {
      model: this.model,
      messages: [...system, ...history],
      temperature: 0.5,
      max_tokens: 500,
      stream: true,
      tools: INCIDENT_TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    }

    let fullText = ''
    let sentBuf = ''
    const tcDeltas: any[] = []
    let speaking = false

    try {
      const stream = await this.llm.chat.completions.create(params)
      for await (const chunk of stream) {
        if (this.isBargingIn) break
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue

        if (delta.content) {
          fullText += delta.content
          sentBuf  += delta.content
          if (/[.!?]\s*$/.test(sentBuf) || sentBuf.length > 200) {
            const s = this.sanitize(sentBuf.trim()); sentBuf = ''
            if (s && !this.isBargingIn) {
              if (!speaking) { speaking = true; this.emit('state', 'speaking') }
              this.emit('agent_message', s)
              await this.speakAndStream(s)
            }
          }
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!tcDeltas[tc.index]) tcDeltas[tc.index] = { id: '', name: '', arguments: '' }
              if (tc.id)               tcDeltas[tc.index].id        = tc.id
              if (tc.function?.name)   tcDeltas[tc.index].name      = tc.function.name
              if (tc.function?.arguments) tcDeltas[tc.index].arguments += tc.function.arguments
            }
          }
        }
      }

      if (sentBuf.trim() && !this.isBargingIn) {
        const s = this.sanitize(sentBuf.trim())
        if (s) { if (!speaking) this.emit('state', 'speaking'); this.emit('agent_message', s); await this.speakAndStream(s) }
      }
    } catch (err: any) {
      addLog('error', 'incident-llm', 'Stream error: ' + err.message, {})
      throw err
    }

    const toolCalls = tcDeltas.filter(t => t?.name).map(t => ({
      id: t.id,
      name: t.name,
      arguments: (() => { try { return JSON.parse(t.arguments) } catch { return {} } })(),
    }))

    return { text: fullText, toolCalls }
  }

  /* ── STT ─────────────────────────────────────────────────────────────── */
  private setupSTT() {
    this.stt.on('message', (data: any) => {
      const msg = typeof data === 'string' ? JSON.parse(data) : data
      if (msg.type === 'Results') {
        const text = msg.channel?.alternatives?.[0]?.transcript
        if (!text) return
        if (msg.is_final) {
          if (this.isAgentSpeaking) {
            this.isBargingIn = true; this.isAgentSpeaking = false
            this.emit('barge_in'); this.emit('state', 'listening')
          }
          this.utteranceBuffer = (this.utteranceBuffer + ' ' + text).trim()
          this.emit('transcript', { text: this.utteranceBuffer, isFinal: true })
          if (msg.speech_final && this.utteranceBuffer && !this.processing) {
            const m = this.utteranceBuffer; this.utteranceBuffer = ''
            this.processUserMessage(m)
          }
        } else {
          this.emit('transcript', { text: (this.utteranceBuffer + ' ' + text).trim(), isFinal: false })
        }
      }
      if (msg.type === 'UtteranceEnd' && this.utteranceBuffer && !this.processing) {
        const m = this.utteranceBuffer; this.utteranceBuffer = ''
        this.processUserMessage(m)
      }
    })
    this.stt.on('error', (e: any) => addLog('error', 'incident-stt', String(e.message || e), {}))
    this.stt.on('close', () => addLog('info', 'incident-stt', 'Closed', {}))
  }

  /* ── TTS ─────────────────────────────────────────────────────────────── */
  private async connectTtsWs(): Promise<void> {
    const WS = require('ws')
    return new Promise((resolve, reject) => {
      const url = `wss://api.deepgram.com/v1/speak?model=${this.ttsVoice}&encoding=linear16&sample_rate=24000`
      this.ttsWs = new WS(url, { headers: { Authorization: `Token ${this.ttsKey}` } })
      this.ttsWs.on('open', () => resolve())
      this.ttsWs.on('message', (data: any, isBinary: boolean) => {
        if (isBinary && Buffer.isBuffer(data) && data.length > 10 && !this.isBargingIn) {
          this.emit('audio', data)
          this.ttsAudioBuffer.push(data)
        } else {
          try {
            const m = JSON.parse(Buffer.isBuffer(data) ? data.toString() : data)
            if (m.type === 'Flushed') {
              this.ttsAudioBuffer = []
              if (this.ttsResolve) { this.ttsResolve(); this.ttsResolve = null }
            }
          } catch {}
        }
      })
      this.ttsWs.on('error', (e: any) => reject(e))
      this.ttsWs.on('close', () => { this.ttsWs = null })
      setTimeout(() => reject(new Error('TTS timeout')), 5000)
    })
  }

  private async speakAndStream(raw: string) {
    const text = this.sanitize(raw)
    if (!text || this.isBargingIn) return
    if (!this.ttsWs || this.ttsWs.readyState !== 1) {
      try { await this.connectTtsWs() } catch { return }
    }
    this.ttsAudioBuffer = []
    try {
      this.ttsWs.send(JSON.stringify({ type: 'Speak', text }))
      this.ttsWs.send(JSON.stringify({ type: 'Flush' }))
      await new Promise<void>((resolve) => {
        this.ttsResolve = resolve
        setTimeout(() => { if (this.ttsResolve) { this.ttsResolve(); this.ttsResolve = null } }, 15000)
      })
    } catch {}
  }

  private sanitize(text: string): string {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/[*_#]+/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
