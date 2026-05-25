/**
 * Voice Pipeline — SaaS version
 * Uses tenant's ServiceNow config. STT/TTS powered by our shared Deepgram key.
 */
import { EventEmitter } from 'events'
import { addLog } from '../lib/log-store'
import { signUploadToken } from '../lib/upload-tokens'
import { createPendingUpload, cancelPendingUpload, readCompletedMeta, type UploadMeta } from '../lib/upload-registry'

// ServiceNow client types
interface SNConfig {
  success: boolean
  session_id: string
  greeting: string
  system_prompt: string
  tools: any[]
  agent: { name: string; max_tool_calls: number; context_window: number; fallback_message: string }
  llm_config: { api_key: string; model: string; base_url: string; temperature: number; max_tokens: number }
  stt_config: { api_key: string; model: string; language: string; endpointing_ms: number }
  tts_config: { api_key: string; voice: string }
}

// SN connection lives at the tenant level (one workspace = one SN instance)
interface Tenant {
  id: string
  snInstanceUrl: string | null
  snUsername: string | null
  snPassword: string | null
}

// Groq's llama-3.3 guided decoding rejects any tool whose JSON Schema has
// unsupported keywords, mismatched enum/type, or missing `type` on a property
// — it returns HTTP 400 "Failed to call a function" and the whole turn dies.
// Tool schemas come from admin-authored SN `agent_tool_parameter` rows so we
// can't trust them. This normalizer rebuilds each tool into a shape Groq will
// accept and returns a list of repairs so bad SN records are visible in logs.
const GROQ_ALLOWED_PRIM_TYPES = new Set(['string', 'number', 'boolean', 'integer', 'array', 'object'])
const GROQ_UNSUPPORTED_KEYWORDS = ['oneOf', 'anyOf', 'allOf', 'not', '$ref', '$schema', 'definitions']

function normalizeToolsForGroq(tools: any[]): { tools: any[]; repairs: string[] } {
  const repairs: string[] = []
  const out: any[] = []
  if (!Array.isArray(tools)) return { tools: out, repairs }

  for (const t of tools) {
    const fn = t?.function
    const name = fn?.name
    if (!fn || typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
      repairs.push('dropped tool with invalid/missing name: ' + JSON.stringify(name))
      continue
    }

    let params: any = fn.parameters
    if (!params || typeof params !== 'object') {
      params = { type: 'object', properties: {}, required: [] }
      repairs.push(name + ': missing parameters — defaulted to empty object schema')
    } else {
      params = { ...params }
    }

    if (params.type !== 'object') {
      repairs.push(name + ': parameters.type was ' + JSON.stringify(params.type) + " — forced to 'object'")
      params.type = 'object'
    }

    if (!params.properties || typeof params.properties !== 'object') {
      params.properties = {}
      repairs.push(name + ': missing/invalid properties — defaulted to {}')
    }

    const cleanedProps: Record<string, any> = {}
    for (const [pname, pschemaRaw] of Object.entries(params.properties)) {
      const pschema: any = pschemaRaw && typeof pschemaRaw === 'object' ? { ...pschemaRaw } : {}

      for (const kw of GROQ_UNSUPPORTED_KEYWORDS) {
        if (kw in pschema) {
          delete pschema[kw]
          repairs.push(name + '.' + pname + ": stripped unsupported keyword '" + kw + "'")
        }
      }

      if (!GROQ_ALLOWED_PRIM_TYPES.has(pschema.type)) {
        repairs.push(name + '.' + pname + ': type was ' + JSON.stringify(pschema.type) + " — defaulted to 'string'")
        pschema.type = 'string'
      }

      if (pschema.enum !== undefined) {
        if (!Array.isArray(pschema.enum) || pschema.enum.length === 0) {
          delete pschema.enum
          repairs.push(name + '.' + pname + ': dropped invalid enum (not a non-empty array)')
        } else {
          const coerced: any[] = []
          let dirty = false
          for (const v of pschema.enum) {
            if (pschema.type === 'string') {
              if (typeof v === 'string') coerced.push(v)
              else { coerced.push(String(v)); dirty = true }
            } else if (pschema.type === 'number' || pschema.type === 'integer') {
              const n = Number(v)
              if (Number.isFinite(n)) coerced.push(pschema.type === 'integer' ? Math.trunc(n) : n)
              else dirty = true
            } else if (pschema.type === 'boolean') {
              if (typeof v === 'boolean') coerced.push(v)
              else { coerced.push(Boolean(v)); dirty = true }
            } else {
              dirty = true
            }
          }
          if (coerced.length === 0) {
            delete pschema.enum
            repairs.push(name + '.' + pname + ": enum incompatible with type '" + pschema.type + "' — dropped enum")
          } else if (dirty) {
            pschema.enum = coerced
            repairs.push(name + '.' + pname + ": coerced enum values to type '" + pschema.type + "'")
          }
        }
      }

      cleanedProps[pname] = pschema
    }
    params.properties = cleanedProps

    if (!Array.isArray(params.required)) {
      params.required = []
    } else {
      const valid = params.required.filter((r: any) => typeof r === 'string' && r in cleanedProps)
      if (valid.length !== params.required.length) {
        repairs.push(name + ': dropped required entries not present in properties')
      }
      params.required = valid
    }

    for (const kw of GROQ_UNSUPPORTED_KEYWORDS) {
      if (kw in params) {
        delete params[kw]
        repairs.push(name + ": stripped unsupported keyword '" + kw + "' from parameters root")
      }
    }

    out.push({
      type: 'function',
      function: {
        name,
        description: typeof fn.description === 'string' ? fn.description : '',
        parameters: params,
      },
    })
  }

  return { tools: out, repairs }
}

export class VoicePipeline extends EventEmitter {
  private tenant: Tenant
  private selectedAgentId: string = ''  // Set by SN orchestrator after init
  private snSessionId: string = ''
  private messages: any[] = []
  private tools: any[] = []
  private agentConfig: any = {}
  private isAgentSpeaking = false
  private isBargingIn = false
  private utteranceBuffer = ''
  private processing = false
  private startedAt = Date.now()
  private messageCount = 0
  private totalTokens = 0
  public toolCallCount = 0  // Public so server can read it

  // Voice-native confirmation state. When a tool returns requires_confirmation,
  // we speak the prompt and stash the pending action here. The next user utterance
  // is intercepted by processUserMessage and routed to handleConfirmation.
  private pendingConfirmation: { toolSysId: string; inputParams: any; toolName: string } | null = null

  // Portal the widget was loaded inside ('sp', 'esc', or '' for platform UI).
  // Captured at start() and injected into every tool input as __origin_portal so
  // the navigate_to tool can build the right portal URLs.
  private originPortal: string = ''

  // These are set after init() loads config from SN
  private stt: any = null
  private ttsKey: string = ''
  private ttsVoice: string = 'aura-asteria-en'
  private llm: any = null

  // Audio transport. 'widget' = browser mic/speaker (linear16 @ 16k in, 24k out).
  // 'phone' = Twilio Media Streams (mulaw @ 8k both directions).
  private audioFormat: 'widget' | 'phone' = 'widget'

  // One-shot guard for the failed_generation schema dump — we only want to log
  // the full tools payload once per call, not every retry.
  private toolsSchemaDumped = false

  // Token of the currently-pending attachment upload. At most one in flight
  // per call — cleared when the upload resolves or the call stops.
  private pendingUploadToken: string = ''
  // Poller that watches AttachmentUpload rows for status='completed'. Cleared
  // on completion, on call stop, or when TTL expires.
  private uploadPoller: ReturnType<typeof setInterval> | null = null

  constructor(tenant: Tenant, opts: { audioFormat?: 'widget' | 'phone' } = {}) {
    super()
    this.tenant = tenant
    this.audioFormat = opts.audioFormat || 'widget'
  }

  // Incident context optionally passed when starting a session from an incident form.
  // Stored so it can be injected into the system prompt and referenced by built-in tools.
  private incidentContext: Record<string, string> = {}

  // Generic form context — any SN table record opened in form mode.
  // Injected into the system prompt so the agent knows the record and never asks for it.
  private formContext: { tableName?: string; sysId?: string; fields?: Record<string, string> } = {}

  async start(agentId?: string, endUserSnId?: string, originPortal?: string, incidentContext?: Record<string, string>, formContext?: { tableName?: string; sysId?: string; fields?: Record<string, string> }) {
    this.originPortal = (originPortal || '').toString().toLowerCase()
    this.incidentContext = incidentContext && typeof incidentContext === 'object' ? incidentContext : {}
    this.formContext = formContext && typeof formContext === 'object' ? formContext : {}
    console.log(`[Pipeline] Starting. Instance: ${this.tenant.snInstanceUrl}` + (agentId ? `, Agent: ${agentId}` : ', orchestrator mode') + (endUserSnId ? `, EndUser: ${endUserSnId}` : '') + (this.originPortal ? `, Portal: ${this.originPortal}` : '') + (this.incidentContext.number ? `, Incident: ${this.incidentContext.number}` : ''))

    if (!this.tenant.snInstanceUrl || !this.tenant.snUsername) {
      const msg = 'ServiceNow not connected. Go to ZeVox Dashboard → Connection and enter your instance details.'
      console.error('[Pipeline] ' + msg)
      this.emit('error', { message: msg })
      return
    }

    try {
      console.log('[Pipeline] Calling ServiceNow /gateway/init' + (agentId ? '' : ' (orchestrator will pick agent)') + '...')
      // Call ServiceNow /gateway/init.
      // When agent_id is omitted, the SN orchestrator picks the best agent.
      // `caller_user_id` is the SN sys_id of the actual end-user talking to the
      // widget (extracted client-side from g_user.userID when embedded in SN).
      const initPayload: { agent_id?: string; caller_user_id?: string } = {}
      if (agentId) initPayload.agent_id = agentId
      if (endUserSnId) initPayload.caller_user_id = endUserSnId
      const config = await this.snFetch('POST', '/gateway/init', initPayload) as SNConfig & { selected_agent_id?: string }

      console.log('[Pipeline] SN init response success:', config.success, 'session:', config.session_id)
      if (!config.success) throw new Error('Failed to init: ' + (config as any).error)

      this.snSessionId = config.session_id
      this.selectedAgentId = config.selected_agent_id || agentId || ''
      addLog('info', 'pipeline', 'Init OK — session=' + this.snSessionId.substring(0, 8) + '... agentId=' + (this.selectedAgentId || '(empty!)'), { tenantId: this.tenant.id })
      this.tools = config.tools || []

      // Widget-only built-in: lets the agent ask the user to upload a file.
      // Skipped on the phone channel because the caller can't click a link.
      if (this.audioFormat === 'widget') {
        this.tools.push({
          type: 'function',
          function: {
            name: 'request_attachment',
            description:
              "Ask the user to upload a file (PDF, image, Excel sheet, or PowerPoint). Returns a secure upload URL that the widget will display to the user. Use this when the user offers to share a document, when seeing a file would help you answer, or when a process requires an attachment. You'll be notified with the file name (and extracted text for PDF/XLSX) once it arrives. If the user wants the file attached to a specific ServiceNow record (e.g. 'attach to INC0010001'), pass target_table and target_record_number so the file lands on that record. Otherwise it lands on the current voice session. Only call once per request; wait for the upload before calling again.",
            parameters: {
              type: 'object',
              properties: {
                reason: {
                  type: 'string',
                  description:
                    'Short reason shown to the user. Example: "the invoice you mentioned" or "a screenshot of the error".',
                },
                target_table: {
                  type: 'string',
                  description:
                    'ServiceNow table name to attach the file to. Examples: "incident", "sc_request", "change_request", "sc_task", "problem". Omit to attach to the voice session.',
                },
                target_record_number: {
                  type: 'string',
                  description:
                    'Human-readable record number on that table — e.g. "INC0010001". Combined with target_table, the upload will attach to that record. Must be provided together with target_table.',
                },
              },
              required: ['reason'],
            },
          },
        })

        // Incident form built-ins — only active when incident context was supplied.
        // These tools never call ServiceNow; they emit widget events so the user can
        // confirm changes client-side via g_form.setValue without a server round-trip.
        if (this.incidentContext && this.incidentContext.number) {
          this.tools.push({
            type: 'function',
            function: {
              name: 'suggest_form_update',
              description: 'Update or propose an update to a field on the currently open incident form. Set apply_now=true when the user has explicitly commanded the change (e.g. "update state to In Progress", "set priority to high") — the widget applies it immediately. Set apply_now=false (default) when you are proactively suggesting a change without an explicit user command — it appears as a one-click confirmation button. Use for fields: state, priority, urgency, assignment_group, assigned_to, category, subcategory.',
              parameters: {
                type: 'object',
                properties: {
                  field: { type: 'string', description: 'ServiceNow field name, e.g. "state", "priority", "assignment_group".' },
                  value: { type: 'string', description: 'The new value to set on the field (e.g. "2" for state In Progress).' },
                  value_label: { type: 'string', description: 'Human-readable label for the value, e.g. "In Progress" for state=2.' },
                  apply_now: { type: 'boolean', description: 'Set true when the user explicitly commanded this change. Set false when proactively suggesting.' },
                },
                required: ['field', 'value', 'value_label'],
              },
            },
          })
          this.tools.push({
            type: 'function',
            function: {
              name: 'suggest_resolution_note',
              description: 'Propose resolution notes text to fill into the incident close_notes field. The suggestion appears as a clickable button in the widget for the user to confirm.',
              parameters: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'The resolution note text to suggest.' },
                },
                required: ['text'],
              },
            },
          })
          this.tools.push({
            type: 'function',
            function: {
              name: 'suggest_reply',
              description: 'Propose a reply message to the caller that will be placed in the incident comments field. Use when the user asks how to respond to the caller or wants a reply suggestion.',
              parameters: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'The reply text to suggest.' },
                },
                required: ['text'],
              },
            },
          })
        }
      }

      // Sanitize tool schemas before they ever reach Groq. Admin-authored SN
      // tool rows frequently produce JSON Schema that Groq's guided decoder
      // rejects with a 400 "Failed to call a function" — which tanks the whole
      // turn. Log any repairs so the SN admin can fix the source record.
      const { tools: normalized, repairs } = normalizeToolsForGroq(this.tools)
      this.tools = normalized
      if (repairs.length) {
        addLog('warn', 'llm', 'Tool schema repairs applied: ' + repairs.join(' | '), { tenantId: this.tenant.id })
      }

      this.agentConfig = config.agent || {}
      // Store LLM model from config
      this.agentConfig.llm_model = config.llm_config?.model || 'llama-3.3-70b-versatile'

      // Build system message
      // SaaS only injects voice-formatting rules. Behavior (persona, support flow,
      // KB-first triage, confirmation policy) lives in the customer's ServiceNow
      // Voice Agent record so it can be customized per use case.
      let prompt = config.system_prompt
      prompt += '\n\nVOICE RULES: You are on a live voice call. Keep replies to 1-3 sentences. No markdown, no lists, no formatting. Speak naturally.'
      prompt += '\n\nTOOL DISCIPLINE: Never promise an action in words without actually calling the tool in the same turn. If you narrate "let me check the knowledge base" or "I am creating the ticket", you MUST call the corresponding tool immediately after — do not fake progress. The ORDER of clarifying questions, KB search, and ticket creation is driven by the agent instructions above, not by this rule.'

      // Inject generic form context when widget is embedded in a SN form (portal or form mode)
      if (this.formContext && (this.formContext.tableName || this.formContext.sysId) && !this.incidentContext?.number) {
        const fc = this.formContext
        const lines: string[] = []
        if (fc.tableName) lines.push(`  Table: ${fc.tableName}`)
        if (fc.sysId) lines.push(`  Record sys_id: ${fc.sysId}`)
        const fieldLabelMap: Record<string, string> = {
          number: 'Record Number', short_description: 'Summary', description: 'Description',
          state: 'State', priority: 'Priority', urgency: 'Urgency', category: 'Category',
          subcategory: 'Subcategory', assignment_group: 'Assignment Group', assigned_to: 'Assigned To',
          caller_id: 'Caller', opened_by: 'Opened By', opened_at: 'Opened At', cmdb_ci: 'Configuration Item',
          location: 'Location', impact: 'Impact', u_work_order: 'Work Order', work_order_task: 'Work Order Task',
          parent: 'Parent Record', requested_for: 'Requested For',
        }
        if (fc.fields) {
          for (const [k, v] of Object.entries(fc.fields)) {
            if (v) lines.push(`  ${fieldLabelMap[k] || k}: ${v}`)
          }
        }
        if (lines.length > 0) {
          prompt += '\n\nFORM CONTEXT (OVERRIDE — takes precedence over all earlier instructions): The user has opened this voice session directly from a ServiceNow record form. You already have the record information below. NEVER ask the user for the record number, work order number, ticket number, or any other identifying information that is already listed here — use it directly. If your instructions say to ask for this information, skip that step entirely.\n' + lines.join('\n')
        }
      }

      // Inject incident context when the widget is opened from an incident form
      if (this.incidentContext && Object.keys(this.incidentContext).length > 0) {
        const ic = this.incidentContext
        const lines: string[] = []
        const labelMap: Record<string, string> = {
          number: 'Incident Number', short_description: 'Short Description', description: 'Description',
          state: 'State', priority: 'Priority', urgency: 'Urgency', category: 'Category',
          subcategory: 'Subcategory', assignment_group: 'Assignment Group', assigned_to: 'Assigned To',
          caller_id: 'Caller', comments: 'Comments', work_notes: 'Work Notes',
          close_notes: 'Resolution Notes', impact: 'Impact', opened_at: 'Opened At', opened_by: 'Opened By',
        }
        for (const [k, v] of Object.entries(ic)) {
          if (v && labelMap[k]) lines.push(`  ${labelMap[k]}: ${v}`)
        }
        if (lines.length) {
          prompt += '\n\nINCIDENT CONTEXT: The user has opened this voice session from an incident form. Current incident details:\n' + lines.join('\n')
          prompt += '\n\nYou can use suggest_form_update to propose field changes, suggest_resolution_note to propose resolution text, and suggest_reply to propose a caller reply. These appear as one-click buttons in the widget for the user to confirm before applying.'
        }
      }

      this.messages.push({ role: 'system', content: prompt })

      // Init STT — use our SaaS Deepgram key by default, customer's key only if they provide their own
      const sttKey = config.stt_config?.api_key
      const deepgramKey = (!sttKey || sttKey === 'PROVIDED_BY_ZEVOX') ? process.env.DEEPGRAM_API_KEY : sttKey
      if (!deepgramKey) throw new Error('No Deepgram API key configured')

      const { DeepgramClient } = require('@deepgram/sdk')
      const dgClient = new DeepgramClient(deepgramKey)

      addLog('info', 'stt', 'Connecting to Deepgram...', { tenantId: this.tenant.id })

      this.stt = await dgClient.listen.v1.connect({
        model: config.stt_config?.model || 'nova-3',
        language: config.stt_config?.language || 'en-US',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1500,
        endpointing: config.stt_config?.endpointing_ms || 800,
        encoding: this.audioFormat === 'phone' ? 'mulaw' : 'linear16',
        sample_rate: this.audioFormat === 'phone' ? 8000 : 16000,
        channels: 1,
      })

      this.setupSTT()
      // The v5 SDK auto-connects in the constructor. Do NOT call stt.connect() —
      // it re-adds all event listeners a second time, causing every Deepgram event
      // to fire twice. The duplicate fires trigger a false barge-in on the same tick
      // that processUserMessage starts, which sets isBargingIn=true and silently
      // aborts the LLM stream before the agent can speak.
      // Do NOT await waitForOpen() here — it can hang if Deepgram is slow to respond
      // and blocks the greeting TTS from playing. The connection opens in the background;
      // the greeting + TTS init (~5s total) gives sufficient time before audio arrives.
      addLog('info', 'stt', 'Deepgram connecting (background)...', { tenantId: this.tenant.id })

      // Init TTS WebSocket — persistent connection for streaming audio
      const ttsConfigKey = config.tts_config?.api_key
      this.ttsKey = (!ttsConfigKey || ttsConfigKey === 'PROVIDED_BY_ZEVOX') ? (process.env.DEEPGRAM_API_KEY || '') : ttsConfigKey
      // Voice comes from SN agent config (set in ServiceNow TTS Config record)
      this.ttsVoice = config.tts_config?.voice || 'aura-asteria-en'
      addLog('info', 'tts', 'Resolved voice: ' + this.ttsVoice + ' (sn=' + (config.tts_config?.voice || 'unset') + ')', { tenantId: this.tenant.id })
      await this.connectTtsWs()
      addLog('info', 'tts', 'TTS WebSocket connected: ' + this.ttsVoice, { tenantId: this.tenant.id })

      // Init LLM (customer's key from SN)
      if (!config.llm_config?.api_key) throw new Error('No LLM API key in ServiceNow config')
      const OpenAI = require('openai')
      // Strip /chat/completions from base_url — OpenAI SDK appends it automatically
      let llmBaseUrl = config.llm_config.base_url || ''
      llmBaseUrl = llmBaseUrl.replace(/\/chat\/completions\/?$/, '')
      addLog('info', 'llm', 'LLM base URL: ' + llmBaseUrl + ' model: ' + (config.llm_config.model || 'default'), { tenantId: this.tenant.id })
      this.llm = new OpenAI({
        apiKey: config.llm_config.api_key,
        baseURL: llmBaseUrl,
      })

      // Speak greeting
      if (config.greeting) {
        this.isAgentSpeaking = true
        this.emit('state', 'speaking')
        await this.speakAndStream(config.greeting)
        this.isAgentSpeaking = false
      }

      this.emit('state', 'listening')
      this.emit('ready', { sessionId: this.snSessionId, greeting: config.greeting })

    } catch (err: any) {
      const errorMsg = err.message || String(err)
      console.error('[Pipeline] Start failed:', errorMsg)
      console.error('[Pipeline] Full error:', err)
      this.emit('error', { message: 'Voice agent connection failed: ' + errorMsg })
    }
  }

  feedAudio(buffer: Buffer) {
    if (this.stt) {
      try {
        // sendBinary bypasses assertSocketIsOpen — ReconnectingWebSocket queues
        // frames during reconnect windows so no audio is silently dropped.
        // sendMedia calls assertSocketIsOpen first and would throw+drop frames
        // whenever the underlying socket is in CONNECTING state.
        if (typeof this.stt.sendBinary === 'function') this.stt.sendBinary(buffer)
        else if (typeof this.stt.sendMedia === 'function') this.stt.sendMedia(buffer)
        else if (typeof this.stt.send === 'function') this.stt.send(buffer)
      } catch {}
    }
  }

  processText(text: string) {
    if (text.trim()) this.processUserMessage(text.trim())
  }

  /**
   * Built-in tool handler — called from the tool dispatch loop when the LLM
   * invokes `request_attachment`. Mints a signed upload URL, emits an event
   * so the widget can surface the link, and registers a callback that fires
   * when the file arrives (injecting a message back into the conversation).
   *
   * Returns the tool result shape the dispatch loop expects (same fields as
   * what /gateway/tool would return).
   */
  private handleRequestAttachment(args: any): { success: boolean; tool_name: string; tool_sys_id: string; output: any; error?: string } {
    // Tear down any existing pending upload — only one in flight at a time.
    if (this.uploadPoller) { clearInterval(this.uploadPoller); this.uploadPoller = null }
    if (this.pendingUploadToken) {
      const prev = this.pendingUploadToken
      this.pendingUploadToken = ''
      cancelPendingUpload(prev).catch(() => {})
    }

    const reason = String(args?.reason || '').slice(0, 200) || 'the file you mentioned'
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    if (!appBase) {
      return {
        success: false,
        tool_name: 'request_attachment',
        tool_sys_id: 'builtin:request_attachment',
        output: {},
        error: 'NEXT_PUBLIC_APP_URL not configured — cannot mint upload URL',
      }
    }

    // Target validation — if the LLM asked for a specific record, both fields
    // must be present. If only one is provided, drop both and fall back to the
    // session (the LLM is more likely to re-ask correctly than to attach to
    // the wrong place).
    const rawTable = typeof args?.target_table === 'string' ? args.target_table.trim() : ''
    const rawNumber = typeof args?.target_record_number === 'string' ? args.target_record_number.trim() : ''
    const target_table = rawTable && rawNumber ? rawTable.toLowerCase() : ''
    const target_number = rawTable && rawNumber ? rawNumber : ''

    const token = signUploadToken({
      tenantId: this.tenant.id,
      sessionId: this.snSessionId,
      agentId: this.selectedAgentId,
      tt: target_table || undefined,
      tn: target_number || undefined,
    })
    const url = `${appBase}/upload/${token}`
    this.pendingUploadToken = token

    // Fire-and-forget DB write. If it fails, log — the link would still mint
    // but upload would 410; we'd rather fail fast than silently misbehave.
    createPendingUpload({
      token,
      tenantId: this.tenant.id,
      sessionId: this.snSessionId,
      agentId: this.selectedAgentId,
      targetTable: target_table || undefined,
      targetNumber: target_number || undefined,
      ttlSeconds: 900,
    }).catch((e: any) => {
      addLog('error', 'pipeline', 'Failed to create pending upload row: ' + e.message, { tenantId: this.tenant.id })
    })

    // Poll the row for completion. 2s cadence, stops on completion / stop() /
    // TTL. Runs across container boundaries — any node handling the upload
    // writes status='completed' and any node running the pipeline picks it up.
    const startedAt = Date.now()
    const MAX_WAIT_MS = 15 * 60 * 1000
    this.uploadPoller = setInterval(async () => {
      if (this.pendingUploadToken !== token) {
        // Superseded or cleared — stop polling.
        return
      }
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        if (this.uploadPoller) { clearInterval(this.uploadPoller); this.uploadPoller = null }
        this.pendingUploadToken = ''
        return
      }
      try {
        const meta = await readCompletedMeta(token)
        if (!meta) return
        // Arrived — stop polling, clear state, notify LLM.
        if (this.uploadPoller) { clearInterval(this.uploadPoller); this.uploadPoller = null }
        this.pendingUploadToken = ''
        this.notifyUploadArrived(meta)
      } catch (e: any) {
        addLog('warn', 'pipeline', 'Upload poll error: ' + e.message, { tenantId: this.tenant.id })
      }
    }, 2000)

    const targetLabel = target_table && target_number ? ` (targeting ${target_table} ${target_number})` : ''
    addLog('info', 'pipeline', 'Attachment requested: ' + reason + targetLabel, { tenantId: this.tenant.id })
    this.emit('attachment_requested', { url, reason })

    return {
      success: true,
      tool_name: 'request_attachment',
      tool_sys_id: 'builtin:request_attachment',
      output: {
        message:
          `I've sent you a secure upload link for ${reason}. Please open the link shown in the widget and upload your file — it expires in 15 minutes. I'll continue as soon as it arrives.`,
        url,
      },
    }
  }

  private handleSuggestFormUpdate(args: any) {
    const field = String(args?.field || '').trim()
    const value = String(args?.value || '').trim()
    const valueLabel = String(args?.value_label || value).trim()
    const applyNow = args?.apply_now === true
    if (!field || !value) {
      return { success: false, tool_name: 'suggest_form_update', tool_sys_id: 'builtin:suggest_form_update', output: {}, error: 'field and value are required' }
    }
    addLog('info', 'pipeline', `Form update ${applyNow ? '(direct)' : '(suggestion)'}: ${field} → ${valueLabel}`, { tenantId: this.tenant.id })
    this.emit('form_update', { field, value, valueLabel, applyNow })
    const msg = applyNow
      ? `I've updated ${field} to "${valueLabel}" on the incident form.`
      : `I've added a suggestion to update ${field} to "${valueLabel}". The user will see a button to apply it.`
    return {
      success: true,
      tool_name: 'suggest_form_update',
      tool_sys_id: 'builtin:suggest_form_update',
      output: { message: msg },
    }
  }

  private handleSuggestResolution(args: any) {
    const text = String(args?.text || '').trim()
    if (!text) {
      return { success: false, tool_name: 'suggest_resolution_note', tool_sys_id: 'builtin:suggest_resolution_note', output: {}, error: 'text is required' }
    }
    addLog('info', 'pipeline', 'Resolution note suggestion: ' + text.substring(0, 80), { tenantId: this.tenant.id })
    this.emit('suggestion', { sugType: 'resolution', text })
    return {
      success: true,
      tool_name: 'suggest_resolution_note',
      tool_sys_id: 'builtin:suggest_resolution_note',
      output: { message: 'Resolution note suggestion added. The user can click it to populate the close_notes field.' },
    }
  }

  private handleSuggestReply(args: any) {
    const text = String(args?.text || '').trim()
    if (!text) {
      return { success: false, tool_name: 'suggest_reply', tool_sys_id: 'builtin:suggest_reply', output: {}, error: 'text is required' }
    }
    addLog('info', 'pipeline', 'Reply suggestion: ' + text.substring(0, 80), { tenantId: this.tenant.id })
    this.emit('suggestion', { sugType: 'reply', text })
    return {
      success: true,
      tool_name: 'suggest_reply',
      tool_sys_id: 'builtin:suggest_reply',
      output: { message: 'Reply suggestion added. The user can click it to place it in the comments field.' },
    }
  }

  private notifyUploadArrived(meta: UploadMeta) {
    const kb = (meta.sizeBytes / 1024).toFixed(1)
    const landedOn =
      meta.attachedTable && meta.attachedNumber
        ? `ServiceNow ${meta.attachedTable} ${meta.attachedNumber}`
        : meta.attachedTable
        ? `ServiceNow ${meta.attachedTable} (sys_id ${meta.attachedSysId})`
        : 'the current voice session'
    let note =
      `[SYSTEM] The user has uploaded the file "${meta.fileName}" (${kb} KB, ${meta.mimeType}). ` +
      `It is attached to ${landedOn} as sys_attachment ${meta.snAttachmentSysId}.`

    if (meta.targetResolutionError) {
      note += ` NOTE: the user asked to attach to ${meta.targetResolutionError} — that lookup failed, so the file was placed on the voice session as a fallback. Mention this to the user so they can retry with the correct record.`
    }

    if (meta.extractedText && meta.extractedText.length > 0) {
      const summary = meta.extractedNote ? ` (${meta.extractedNote})` : ''
      const trunc = meta.extractedTruncated ? '\n[… truncated — only the first portion is shown.]' : ''
      note +=
        `\n\nExtracted contents${summary}:\n` +
        '```\n' + meta.extractedText + trunc + '\n```\n\n' +
        'Use this content to answer the user\'s request. Keep your spoken reply concise — summarize what you see rather than reading it verbatim.'
    } else {
      note += ' Contents could not be extracted automatically — acknowledge the upload and ask the user what they would like you to do with the file.'
    }

    addLog('info', 'pipeline', 'Attachment uploaded, notifying LLM: ' + meta.fileName + (meta.extractedText ? ' (with ' + meta.extractedText.length + ' chars of text)' : ''), { tenantId: this.tenant.id })
    this.processUserMessage(note).catch(() => {})
  }

  getUsageStats() {
    // Count tokens from messages (rough estimate: 4 chars per token)
    let inputTokens = 0, outputTokens = 0
    for (const m of this.messages) {
      const len = (m.content || '').length
      if (m.role === 'user') inputTokens += Math.ceil(len / 4)
      else if (m.role === 'assistant') outputTokens += Math.ceil(len / 4)
      else if (m.role === 'system') inputTokens += Math.ceil(len / 4)
      else if (m.role === 'tool') inputTokens += Math.ceil(len / 4)
    }
    return { inputTokens, outputTokens, toolCalls: this.toolCallCount }
  }

  private stopped = false

  async stop() {
    if (this.stopped) return // Prevent double stop
    this.stopped = true

    // Tear down any attachment upload link so late arrivals 410 cleanly
    if (this.uploadPoller) { clearInterval(this.uploadPoller); this.uploadPoller = null }
    if (this.pendingUploadToken) {
      const tok = this.pendingUploadToken
      this.pendingUploadToken = ''
      cancelPendingUpload(tok).catch(() => {})
    }

    if (this.stt) {
      try {
        if (typeof this.stt.close === 'function') this.stt.close()
        else if (typeof this.stt.requestClose === 'function') this.stt.requestClose()
      } catch {}
    }
    if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null }
    if (this.ttsWs) {
      try { this.ttsWs.close() } catch {}
      this.ttsWs = null
    }

    const durationSec = Math.round((Date.now() - this.startedAt) / 1000)

    if (this.snSessionId) {
      try {
        const usage = this.getUsageStats()
        await this.snFetch('POST', '/gateway/end', {
          session_id: this.snSessionId,
          messages: this.messages.filter(m => m.role !== 'system'),
          total_tokens: usage.inputTokens + usage.outputTokens,
          prompt_tokens: usage.inputTokens,
          completion_tokens: usage.outputTokens,
          duration_sec: durationSec,
        })
      } catch {}
      this.snSessionId = '' // Prevent second call
    }

    this.emit('ended')
  }

  async handleConfirmation(toolSysId: string, inputParams: any, confirmed: boolean) {
    // Reset barge-in flag — same reason as in processUserMessage
    this.isBargingIn = false
    this.emit('state', 'processing')
    try {
      const enrichedParams = { ...(inputParams || {}), __origin_portal: this.originPortal }
      const result = await this.snFetch('POST', '/gateway/tool/confirm', {
        session_id: this.snSessionId,
        tool_sys_id: toolSysId,
        input_params: enrichedParams,
        confirmed,
      })

      // Forward navigation URLs from confirmed tool to the widget.
      const confirmedOutput = (result as any).output
      if (confirmed && confirmedOutput && Array.isArray(confirmedOutput.navigation_urls) && confirmedOutput.navigation_urls.length > 0) {
        this.emit('navigate', { urls: confirmedOutput.navigation_urls })
      }

      // Get LLM to formulate response. The confirmation nudge is transient — pass it
      // directly to callLLMWithTools instead of storing it in this.messages to prevent
      // accumulation across turns.
      this.messages.push({ role: 'tool', tool_call_id: 'confirm', content: JSON.stringify((result as any).output || {}) })
      const confirmNudge = confirmed ? 'User confirmed. Communicate the result naturally.' : 'User declined. Acknowledge and ask how else to help.'

      // Use streaming LLM — it speaks directly via TTS
      const savedTools = this.tools
      this.tools = [] // No tools for confirmation response
      const llmResp = await this.callLLMWithTools(false, confirmNudge)
      this.tools = savedTools
      if (llmResp.text) {
        this.messages.push({ role: 'assistant', content: llmResp.text })
      }
      this.isAgentSpeaking = false
      this.emit('state', 'listening')
    } catch (err: any) {
      // Confirmation flow failed (LLM error, SN error). Speak the fallback and
      // end the call instead of going silent in listening state.
      addLog('error', 'pipeline', 'Confirm error: ' + err.message, { tenantId: this.tenant.id })
      const fallback = this.agentConfig.fallback_message || "Sorry, I am having trouble right now. Please try again in a few minutes."
      try {
        this.emit('agent_message', fallback)
        await this.speakAndStream(fallback)
      } catch (speakErr: any) {
        addLog('error', 'pipeline', 'Fallback speak failed: ' + speakErr.message, { tenantId: this.tenant.id })
      }
      this.isAgentSpeaking = false
      this.emit('ended')
    }
  }

  // ── STT Setup (Deepgram SDK v5 — uses 'message' event with parsed JSON) ──
  private setupSTT() {
    // v5 SDK uses simple string events: 'open', 'message', 'close', 'error'
    this.stt.on('open', () => {
      addLog('info', 'stt', 'Deepgram connected and ready', { tenantId: this.tenant.id })
    })

    this.stt.on('message', (data: any) => {
      // data is already parsed JSON from Deepgram
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      addLog('debug', 'stt', 'DG event type=' + parsed.type + ' transcript=' + (parsed.channel?.alternatives?.[0]?.transcript || '').substring(0, 50), { tenantId: this.tenant.id })

      // Handle transcript results
      if (parsed.type === 'Results') {
        const transcript = parsed.channel?.alternatives?.[0]?.transcript
        if (!transcript) return

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

          // If speech_final, process the utterance
          if (parsed.speech_final && this.utteranceBuffer && !this.processing) {
            const msg = this.utteranceBuffer
            this.utteranceBuffer = ''
            this.processUserMessage(msg)
          }
        } else {
          const preview = this.utteranceBuffer ? this.utteranceBuffer + ' ' + transcript : transcript
          this.emit('transcript', { text: preview, isFinal: false })
        }
      }

      // Handle utterance end (backup turn detection)
      if (parsed.type === 'UtteranceEnd') {
        if (this.utteranceBuffer && !this.processing) {
          const msg = this.utteranceBuffer
          this.utteranceBuffer = ''
          this.processUserMessage(msg)
        }
      }
    })

    this.stt.on('error', (err: any) => {
      addLog('error', 'stt', 'STT error: ' + (err.message || String(err)), { tenantId: this.tenant.id })
    })

    this.stt.on('close', () => {
      addLog('info', 'stt', 'STT connection closed', { tenantId: this.tenant.id })
      // Flush any accumulated final transcript — ensures the utterance is processed
      // even if speech_final or UtteranceEnd doesn't arrive before the connection cycles.
      if (this.utteranceBuffer && !this.processing) {
        const msg = this.utteranceBuffer
        this.utteranceBuffer = ''
        this.processUserMessage(msg).catch(() => {})
      }
    })
  }

  // ── Detect if user wants to end the conversation ──
  private isGoodbye(msg: string): boolean {
    const lower = msg.toLowerCase().trim()
    const phrases = ['thank you', 'thanks', "that's all", 'thats all', "that's it", 'thats it',
      'bye', 'goodbye', 'good bye', 'no thanks', "i'm good", 'im good', 'all good',
      'nothing else', 'no that is all', "no that's all", 'have a good day', 'take care']
    return phrases.some(p => lower.includes(p))
  }

  // ── Voice confirmation intent detection ──
  // Returns 'yes' / 'no' for clear affirmative or negative responses, 'unclear' otherwise.
  // Used by processUserMessage to short-circuit a pending confirmation flow.
  private detectConfirmationIntent(text: string): 'yes' | 'no' | 'unclear' {
    const clean = text.toLowerCase().replace(/[.,!?;:]/g, '').trim()
    if (!clean) return 'unclear'

    // Special case: "no problem" should not be treated as a negative
    if (/\bno problem\b/.test(clean)) {
      // Look for affirmative signal alongside it
      if (/\b(yes|yeah|do it|go ahead|sure|please|create|submit|proceed|confirm)\b/.test(clean)) return 'yes'
      return 'unclear'
    }

    // Affirmative patterns — ordered by clarity
    const yesPatterns = [
      /^(yes|yeah|yep|yup|yup|sure|ok|okay|k|alright)$/,
      /\b(yes|yeah|yep|yup|sure|okay|alright)\b/,
      /\b(do it|go ahead|go for it|create it|submit it|proceed|confirm|confirmed)\b/,
      /\b(absolutely|definitely|please do|please|sounds good|let'?s do it)\b/,
      /\b(correct|right|that'?s right|exactly)\b/,
    ]
    // Negative patterns
    const noPatterns = [
      /^(no|nope|nah|cancel|stop)$/,
      /\b(no|nope|nah|cancel|abort|stop|never ?mind|forget it)\b/,
      /\b(don'?t|do not|hold on|wait|not now|not yet)\b/,
    ]

    for (const p of yesPatterns) if (p.test(clean)) return 'yes'
    for (const p of noPatterns) if (p.test(clean)) return 'no'
    return 'unclear'
  }

  // ── Natural fillers — varied per context ──
  private lastFiller = ''
  private pick(arr: string[]): string {
    // Never repeat the same filler twice in a row
    const filtered = arr.filter(f => f !== this.lastFiller)
    const choice = filtered[Math.floor(Math.random() * filtered.length)] || arr[0]
    this.lastFiller = choice
    return choice
  }

  // ── Process User Message (with queue to prevent re-entrancy) ──
  private messageQueue: string[] = []

  private async processUserMessage(message: string) {
    if (!message.trim() || this.stopped) return

    // If already processing, queue the message for later
    if (this.processing) {
      addLog('info', 'pipeline', 'Queued message (busy): ' + message.substring(0, 50), { tenantId: this.tenant.id })
      this.messageQueue.push(message)
      return
    }

    // Reset barge-in flag at the start of every new turn. Without this, a single
    // barge-in earlier in the call would permanently disable agent speech for the
    // rest of the call (speakAndStream short-circuits when isBargingIn is true).
    this.isBargingIn = false

    // Voice-native confirmation: if we asked for confirmation on the previous turn,
    // intercept this utterance and route it to handleConfirmation. We only act on
    // clear yes/no signals — anything ambiguous falls through to the normal LLM
    // flow so the user can clarify or change topic.
    if (this.pendingConfirmation) {
      const intent = this.detectConfirmationIntent(message)
      addLog('info', 'pipeline', 'Confirmation intent: ' + intent + ' (msg: ' + message.substring(0, 60) + ')', { tenantId: this.tenant.id })
      if (intent !== 'unclear') {
        const pending = this.pendingConfirmation
        this.pendingConfirmation = null
        this.processing = true
        this.emit('user_message', message)
        this.messages.push({ role: 'user', content: message })
        this.messageCount++
        try {
          await this.handleConfirmation(pending.toolSysId, pending.inputParams, intent === 'yes')
        } finally {
          this.processing = false
        }
        return
      }
      // Unclear → drop pending state and continue with normal LLM flow
      addLog('info', 'pipeline', 'Confirmation unclear, clearing pending and falling back to LLM', { tenantId: this.tenant.id })
      this.pendingConfirmation = null
    }

    this.processing = true
    this.emit('user_message', message)
    this.messages.push({ role: 'user', content: message })
    this.messageCount++

    // Check if user wants to end the call. We detect the intent server-side so we
    // know when to fire `ended` and tear down the WebSocket — but the closing
    // message itself is generated by the LLM following the agent's instructions
    // from ServiceNow. The SaaS does not inject any closing prompt of its own.
    if (this.isGoodbye(message)) {
      this.isAgentSpeaking = true
      this.emit('state', 'speaking')
      // Message already pushed above — do not push again

      // Disable tools for the closing turn (the agent shouldn't be calling any
      // record-create or KB-search tools while saying goodbye).
      const savedTools = this.tools
      this.tools = []
      try {
        const closing = await this.callLLMWithTools()
        if (closing.text) {
          this.messages.push({ role: 'assistant', content: closing.text })
        }
      } catch (err: any) {
        addLog('error', 'pipeline', 'Closing LLM error: ' + err.message, { tenantId: this.tenant.id })
        // Last-resort fail-safe so the call doesn't end in dead silence if the LLM
        // call itself errors. Uses the SN agent's own fallback_message (also from
        // the agent record), not a SaaS string.
        const failsafe = this.agentConfig.fallback_message || 'Goodbye.'
        await this.speakAndStream(failsafe)
      } finally {
        this.tools = savedTools
      }

      this.isAgentSpeaking = false
      this.processing = false
      this.emit('ended')
      return
    }

    // No fillers — go straight to LLM like ElevenLabs does
    this.isAgentSpeaking = true
    this.emit('state', 'processing')

    try {
      const maxToolCalls = this.agentConfig.max_tool_calls || 5
      let iteration = 0
      let finalResponse = ''

      const TOOL_NUDGE = 'The tool just returned. Speak the answer to the user now in 1-2 sentences. Do NOT stay silent. Do NOT wait for the user to ask. If the result has a `message` field, that is your spoken answer; otherwise summarize the result naturally.'
      let pendingNudge: string | undefined

      while (iteration < maxToolCalls) {
        iteration++
        // After a tool result, force a text response unless the agent is
        // configured for multi-step tool chaining. Without this, llama-3.3
        // frequently returns empty text + no tool call, forcing the pipeline
        // into its generic "I found 3 articles..." fallback.
        const forceText = iteration > 1 && !this.agentConfig.supports_tool_chaining
        const result = await this.callLLMWithTools(forceText, pendingNudge)
        pendingNudge = undefined

        if (!result.toolCalls?.length) {
          finalResponse = result.text
          break
        }

        // Save any narration text the model spoke during this turn (e.g. "Let me search…")
        // so the next loop iteration sees it and doesn't re-narrate the same thing.
        const preToolNarration = (result.text || '').trim()
        let savedNarration = false

        // Tool call — speak a natural filler while executing
        for (const tc of result.toolCalls) {
          if (this.stopped) break  // Pipeline stopped mid-turn — abort tool dispatch
          this.toolCallCount++
          addLog('info', 'pipeline', 'Tool call: ' + tc.name + ' (#' + this.toolCallCount + ')', { tenantId: this.tenant.id })

          // Inject implicit context the LLM doesn't know — the portal the user
          // is currently on. Reserved keys are prefixed with __ so script authors
          // can tell runtime-injected fields from LLM-supplied ones.
          const enrichedInput = { ...(tc.arguments || {}), __origin_portal: this.originPortal }

          // Built-in: request_attachment is handled in-SaaS (the LLM sees it in
          // the tool list but it never hits /gateway/tool). Skipped for phone
          // calls because the caller can't click a link.
          let toolResult: any
          if (tc.name === 'request_attachment' && this.audioFormat === 'widget') {
            toolResult = this.handleRequestAttachment(tc.arguments)
          } else if (tc.name === 'suggest_form_update' && this.audioFormat === 'widget') {
            toolResult = this.handleSuggestFormUpdate(tc.arguments)
          } else if (tc.name === 'suggest_resolution_note' && this.audioFormat === 'widget') {
            toolResult = this.handleSuggestResolution(tc.arguments)
          } else if (tc.name === 'suggest_reply' && this.audioFormat === 'widget') {
            toolResult = this.handleSuggestReply(tc.arguments)
          } else {
            // Execute tool (no extra filler — the initial ack covers the wait)
            addLog('debug', 'pipeline', 'Tool call body: session=' + (this.snSessionId || '(empty!)') + ' agent=' + (this.selectedAgentId || '(empty!)') + ' tool=' + tc.name, { tenantId: this.tenant.id })
            toolResult = await this.snFetch('POST', '/gateway/tool', {
              session_id: this.snSessionId,
              agent_id: this.selectedAgentId,
              tool_name: tc.name,
              tool_input: enrichedInput,
            })
          }

          if ((toolResult as any).requires_confirmation) {
            // Voice-native confirmation: speak the prompt, store the pending state,
            // then return control to listening. The next user utterance is intercepted
            // by processUserMessage and routed to handleConfirmation automatically.
            const rawConfirmMsg = (toolResult as any).confirmation_message || 'Should I go ahead with that?'
            const confirmMsg = this.sanitizeForSpeech(rawConfirmMsg)
            this.pendingConfirmation = {
              toolSysId: (toolResult as any).tool_sys_id,
              inputParams: (toolResult as any).input_params,
              toolName: (toolResult as any).tool_name,
            }
            addLog('info', 'pipeline', 'Confirmation needed (voice): ' + confirmMsg.substring(0, 100), { tenantId: this.tenant.id })

            if (confirmMsg && !this.isBargingIn) {
              this.emit('state', 'speaking')
              this.emit('agent_message', confirmMsg)
              await this.speakAndStream(confirmMsg)
              this.messages.push({ role: 'assistant', content: confirmMsg })
            }

            this.isAgentSpeaking = false
            this.processing = false
            this.emit('state', 'listening')
            return
          }

          const toolOutput = (toolResult as any).success ? (toolResult as any).output : { error: (toolResult as any).error }

          // Forward navigation URLs from the tool to the widget, which opens them
          // in new tabs (popup-blocker fallback handled client-side).
          if ((toolResult as any).success && toolOutput && Array.isArray((toolOutput as any).navigation_urls) && (toolOutput as any).navigation_urls.length > 0) {
            this.emit('navigate', { urls: (toolOutput as any).navigation_urls })
          }
          addLog('info', 'pipeline', 'Tool result: ' + JSON.stringify(toolOutput).substring(0, 200), { tenantId: this.tenant.id })

          // Push the tool call + tool result into the conversation. The next iteration
          // of the while loop will call the LLM again with this context, and the LLM
          // will produce a natural spoken response. We deliberately do NOT pre-speak
          // the tool's raw `.message` here — that would duplicate what the LLM is
          // about to say. The fallback below catches the rare case where the LLM
          // returns empty after a tool call (only happens with weak models like 8B).
          this.messages.push({
            role: 'assistant',
            // Persist the pre-tool narration on the FIRST tool in this turn so the LLM
            // sees what it already said and doesn't repeat it on the next iteration.
            content: (!savedNarration && preToolNarration) ? preToolNarration : null,
            tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
          })
          savedNarration = true
          this.messages.push({
            role: 'tool', tool_call_id: tc.id,
            content: JSON.stringify(toolOutput),
          })
        }
        // Set the nudge for the NEXT callLLMWithTools iteration. Passing it as a parameter
        // (not storing in this.messages) keeps it transient — it won't re-fire on future turns.
        pendingNudge = TOOL_NUDGE
        addLog('info', 'pipeline', 'Loop iteration ' + iteration + ', calling LLM again with tool results', { tenantId: this.tenant.id })
      }

      // finalResponse already spoken during streaming — just store in history
      if (finalResponse) {
        this.messages.push({ role: 'assistant', content: finalResponse })
      } else if (iteration > 1) {
        // LLM returned empty after tool call — speak the tool output message as fallback
        const lastToolMsg = this.messages.filter(m => m.role === 'tool').pop()
        if (lastToolMsg) {
          try {
            const toolData = JSON.parse(lastToolMsg.content)
            const fallbackMsg = toolData.message || 'Done.'
            addLog('info', 'pipeline', 'Fallback from tool output: ' + fallbackMsg, { tenantId: this.tenant.id })
            const clean = this.sanitizeForSpeech(fallbackMsg)
            if (clean) {
              this.emit('state', 'speaking')
              this.emit('agent_message', clean)
              await this.speakAndStream(clean)
              this.messages.push({ role: 'assistant', content: clean })
            }
          } catch {}
        }
      }

      if (!this.isBargingIn) {
        this.isAgentSpeaking = false
        this.emit('state', 'listening')
      }
    } catch (err: any) {
      // The LLM (or downstream tool) failed mid-call. Speak the agent's fallback
      // message from ServiceNow and END the call — there's no point sitting in
      // listening mode and looping the same error if the LLM is rate-limited or
      // misconfigured. The user can start a fresh call once it's healthy.
      addLog('error', 'pipeline', 'Message error: ' + err.message, { tenantId: this.tenant.id })
      const fallback = this.agentConfig.fallback_message || "Sorry, I am having trouble right now. Please try again in a few minutes."
      try {
        this.emit('agent_message', fallback)
        await this.speakAndStream(fallback)
      } catch (speakErr: any) {
        addLog('error', 'pipeline', 'Fallback speak failed: ' + speakErr.message, { tenantId: this.tenant.id })
      }
      this.isAgentSpeaking = false
      this.emit('ended')
    } finally {
      this.processing = false
      // Process any queued messages (skipped if we just ended the call)
      if (!this.stopped && this.messageQueue.length > 0) {
        const next = this.messageQueue.shift()!
        addLog('info', 'pipeline', 'Processing queued: ' + next.substring(0, 50), { tenantId: this.tenant.id })
        this.processUserMessage(next)
      }
    }
  }

  /**
   * TPD fallback: retry on llama-3.1-8b-instant when the primary model hits
   * the daily token cap. If 8b narrates without calling a tool, force a tool
   * call so we don't hallucinate data (e.g. fake KB articles).
   * Returns null on failure so the caller can fall through to the generic path.
   */
  private async _runTpdFallback(origParams: any): Promise<{ text: string; toolCalls: any[] } | null> {
    addLog('warn', 'llm', 'TPD cap hit on ' + origParams.model + ' — falling back to llama-3.1-8b-instant', { tenantId: this.tenant.id })
    const narrationPattern = /\b(let me|i['’]?ll|i will|i['’]?m going to|i am going to|let['’]?s|going to)\s+(search|look|check|find|pull|fetch|create|make|take a look|walk you through|see)\b/i
    const fbParams: any = { ...origParams, model: 'llama-3.1-8b-instant', stream: false }
    // Try normal tool_choice first, but if 8b hits Groq's failed_generation
    // (malformed tool JSON under guided decoding), retry with tool_choice='required'
    // which forces a valid tool-call emission path.
    let fbRes: any
    try {
      fbRes = await this.llm.chat.completions.create(fbParams)
    } catch (firstErr: any) {
      const firstMsg = firstErr?.message || ''
      if (/Failed to call a function|failed_generation/i.test(firstMsg) && this.tools.length > 0) {
        addLog('warn', 'llm', 'TPD fallback 8b failed_generation — retrying with tool_choice=required', { tenantId: this.tenant.id })
        try {
          fbRes = await this.llm.chat.completions.create({ ...fbParams, tool_choice: 'required' })
        } catch (secondErr: any) {
          addLog('error', 'llm', '8b-instant fallback (required) also failed: ' + secondErr.message, { tenantId: this.tenant.id })
          return null
        }
      } else {
        addLog('error', 'llm', '8b-instant fallback also failed: ' + firstMsg, { tenantId: this.tenant.id })
        return null
      }
    }
    try {
      const choice = fbRes?.choices?.[0]?.message
      let fbText = (choice?.content || '').trim()
      let fbToolCalls = (choice?.tool_calls || []).map((tc: any) => ({
        id: tc.id || 'fb_' + Date.now(),
        name: tc.function?.name,
        arguments: (() => { try { return JSON.parse(tc.function?.arguments || '{}') } catch { return {} } })(),
      })).filter((t: any) => t.name && this.tools.some(td => td.function?.name === t.name))

      // Narrate-without-tool: force a tool call so we don't speak fabricated info
      if (fbToolCalls.length === 0 && fbText && this.tools.length > 0 && narrationPattern.test(fbText)) {
        addLog('warn', 'llm', 'TPD fallback narrated without tool — forcing tool call', { tenantId: this.tenant.id })
        try {
          const forcedParams: any = { ...fbParams, tool_choice: 'required' }
          const forcedRes: any = await this.llm.chat.completions.create(forcedParams)
          const fc = forcedRes?.choices?.[0]?.message
          const fcCalls = (fc?.tool_calls || []).map((tc: any) => ({
            id: tc.id || 'fb_forced_' + Date.now(),
            name: tc.function?.name,
            arguments: (() => { try { return JSON.parse(tc.function?.arguments || '{}') } catch { return {} } })(),
          })).filter((t: any) => t.name && this.tools.some(td => td.function?.name === t.name))
          if (fcCalls.length > 0) {
            fbToolCalls = fcCalls
            addLog('info', 'llm', 'TPD fallback: forced ' + fcCalls.length + ' tool call(s)', { tenantId: this.tenant.id })
            // Speak the narration (short — "let me search…") since TTS hasn't played it yet
            if (fbText && !this.isBargingIn) {
              const clean = this.sanitizeForSpeech(fbText)
              if (clean) {
                this.emit('state', 'speaking')
                this.emit('agent_message', clean)
                await this.speakAndStream(clean)
              }
            }
            return { text: fbText, toolCalls: fbToolCalls }
          }
        } catch (fcErr: any) {
          addLog('warn', 'llm', 'TPD fallback forced-tool retry failed: ' + fcErr.message, { tenantId: this.tenant.id })
        }
      }

      // Normal path: speak any text the fallback produced (we didn't stream, so TTS hasn't played)
      if (fbText && !this.isBargingIn && fbToolCalls.length === 0) {
        const clean = this.sanitizeForSpeech(fbText)
        if (clean) {
          this.emit('state', 'speaking')
          this.emit('agent_message', clean)
          await this.speakAndStream(clean)
        }
      }
      return { text: fbText, toolCalls: fbToolCalls }
    } catch (fbErr: any) {
      addLog('error', 'llm', '8b-instant fallback also failed: ' + fbErr.message, { tenantId: this.tenant.id })
      return null
    }
  }

  /**
   * Call LLM with STREAMING — pipe completed sentences directly to TTS
   * This is the key to ElevenLabs-like latency:
   *   Token 1 arrives → accumulate → sentence complete → TTS starts speaking
   *   Meanwhile tokens 2-N continue arriving → next sentence → TTS queues it
   * User hears first words ~800ms after LLM starts generating
   */
  private async callLLMWithTools(forceText = false, nudge?: string): Promise<{ text: string; toolCalls: any[] }> {
    const contextWindow = this.agentConfig.context_window || 6
    // Only include the initial system prompt (index 0). Post-turn system messages
    // like "speak the answer now" nudges and confirmation acks are transient —
    // if included here they accumulate across turns and cause the LLM to re-trigger
    // on old nudges, producing repeated or doubled responses.
    const system = this.messages.filter(m => m.role === 'system').slice(0, 1)
    const conv = this.messages.filter(m => m.role !== 'system').slice(-contextWindow)
    const extra = nudge ? [{ role: 'system', content: nudge }] : []

    const params: any = {
      model: this.agentConfig.llm_model || 'llama-3.3-70b-versatile',
      messages: [...system, ...conv, ...extra],
      temperature: 0.6,
      max_tokens: 300,
      stream: true, // STREAMING — tokens arrive one by one
    }
    if (this.tools.length) {
      params.tools = this.tools
      // forceText=true on post-tool iterations guarantees the model speaks
      // about the tool result instead of returning empty text (a common
      // llama-3.3 failure mode that falls through to the generic fallback).
      params.tool_choice = forceText ? 'none' : 'auto'
      // Force serial tool execution. Llama / Groq frequently fail on parallel
      // tool calls with schema validation errors — serial is also a better UX
      // for voice (one tool per turn, narrated).
      params.parallel_tool_calls = false
    }

    addLog('info', 'llm', 'Streaming LLM with ' + this.tools.length + ' tools', { tenantId: this.tenant.id })

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

        // Accumulate text tokens
        if (delta.content) {
          fullText += delta.content
          sentenceBuffer += delta.content

          // Check if we have a complete sentence (ends with . ! ? or is long enough)
          if (/[.!?]\s*$/.test(sentenceBuffer) || sentenceBuffer.length > 200) {
            const sentence = this.sanitizeForSpeech(sentenceBuffer.trim())
            sentenceBuffer = ''

            if (sentence && !this.isBargingIn) {
              if (!hasStartedSpeaking) {
                hasStartedSpeaking = true
                this.emit('state', 'speaking')
              }
              this.emit('agent_message', sentence)
              // Send to TTS WebSocket — audio streams back immediately
              await this.speakAndStream(sentence)
            }
          }
        }

        // Accumulate tool call deltas
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

      // Speak any remaining text in buffer
      if (sentenceBuffer.trim() && !this.isBargingIn) {
        const remaining = this.sanitizeForSpeech(sentenceBuffer.trim())
        if (remaining) {
          if (!hasStartedSpeaking) this.emit('state', 'speaking')
          this.emit('agent_message', remaining)
          await this.speakAndStream(remaining)
        }
      }
    } catch (err: any) {
      const msg = err?.message || ''

      // Recovery 0: Groq 429 TPD (tokens-per-day) cap on the primary model.
      // Retry on llama-3.1-8b-instant — same account, different bucket,
      // ~10x higher daily quota. If 8b returns narration without a tool call
      // (common — the model would rather chat than call functions), we force
      // a tool call via a second retry with tool_choice='required'. Without
      // this, 8b hallucinates KB content it never actually fetched.
      const isTpdRateLimit = /429/.test(msg) && /tokens per day|TPD|Rate limit reached/i.test(msg)
      if (isTpdRateLimit && params.model !== 'llama-3.1-8b-instant') {
        const fallback = await this._runTpdFallback(params)
        if (fallback) return fallback
      }

      // Recovery 1: Groq bug where tool name contains the JSON args.
      //   `attempted to call tool 'name{...}' which was not in request.tools`
      const groqMalformed = msg.match(/attempted to call tool '([a-z_]+)\s*(\{[\s\S]*?\})'\s+which was not in request\.tools/i)
      if (groqMalformed) {
        const toolName = groqMalformed[1]
        let args: any = {}
        try { args = JSON.parse(groqMalformed[2]) } catch { args = {} }
        addLog('warn', 'llm', 'Recovered malformed tool call from provider error: ' + toolName, { tenantId: this.tenant.id })
        return {
          text: fullText,
          toolCalls: [{ id: 'recovered_' + Date.now(), name: toolName, arguments: args }],
        }
      }

      // Recovery 2: Groq's guided-decoding refusal. The model wanted to call a tool
      // but produced bad JSON. Strategy: first retry NON-STREAMING WITH tools (often
      // succeeds because non-streaming gives the model a single coherent generation
      // window). Only if THAT fails do we drop tools — and even then we mark it so
      // the caller knows no tool ran (so silence-fallback speaks the user-facing
      // recovery message instead of letting the agent claim it searched).
      if (/Failed to call a function|failed_generation/i.test(msg)) {
        if (!this.toolsSchemaDumped) {
          this.toolsSchemaDumped = true
          const dump = this.tools.map((t: any) => (t?.function?.name || '?') + ':' + JSON.stringify(t?.function?.parameters || {})).join(' || ')
          addLog('warn', 'llm', 'failed_generation tool schemas (sanitized): ' + dump, { tenantId: this.tenant.id })
        }
        addLog('warn', 'llm', 'failed_generation — retrying non-streaming WITH tools', { tenantId: this.tenant.id })
        try {
          const retryWithTools: any = await this.llm.chat.completions.create({ ...params, stream: false })
          const choice = retryWithTools?.choices?.[0]?.message
          const tcRaw = choice?.tool_calls || []
          if (tcRaw.length > 0) {
            const recovered = tcRaw.map((tc: any) => ({
              id: tc.id || 'recov_' + Date.now(),
              name: tc.function?.name,
              arguments: (() => { try { return JSON.parse(tc.function?.arguments || '{}') } catch { return {} } })(),
            })).filter((t: any) => t.name)
            if (recovered.length > 0) {
              addLog('info', 'llm', 'Recovered ' + recovered.length + ' tool call(s) on non-streaming retry', { tenantId: this.tenant.id })
              return { text: choice?.content || '', toolCalls: recovered }
            }
          }
        } catch (retryErr: any) {
          addLog('warn', 'llm', 'Non-streaming retry failed: ' + retryErr.message, { tenantId: this.tenant.id })
          // If the non-streaming retry itself hit TPD, route to 8b fallback
          // instead of the hardcoded safe-recovery message below.
          const retryMsg = retryErr?.message || ''
          const retryIsTpd = /429/.test(retryMsg) && /tokens per day|TPD|Rate limit reached/i.test(retryMsg)
          if (retryIsTpd && params.model !== 'llama-3.1-8b-instant') {
            const fallback = await this._runTpdFallback(params)
            if (fallback) return fallback
          }
        }

        // Last resort: speak a safe, hardcoded recovery message. We deliberately
        // do NOT call the LLM here — without tools available, weak models like
        // llama-3.3 happily fabricate KB article titles, ticket numbers, and
        // troubleshooting steps from training data, which is dangerous in a
        // ServiceNow support context. Better to be honest and ask the user
        // to retry than to lie convincingly.
        addLog('warn', 'llm', 'Tool calls failing — speaking safe recovery (no LLM chat to avoid hallucination)', { tenantId: this.tenant.id })
        const safe = "Sorry, I am having trouble running that action right now. Could you say that again or try a different way?"
        if (!this.isBargingIn) {
          this.emit('state', 'speaking')
          this.emit('agent_message', safe)
          await this.speakAndStream(safe)
        }
        return { text: safe, toolCalls: [] }
      }

      addLog('error', 'llm', 'Stream error: ' + msg, { tenantId: this.tenant.id })
      throw err
    }

    // Parse tool calls
    let toolCalls = toolCallDeltas
      .filter(tc => tc && tc.name)
      .map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: (() => { try { return JSON.parse(tc.arguments) } catch { return {} } })(),
      }))

    // Fallback: parse text-format tool calls — handles multiple Llama-on-Groq leak formats:
    //   <function=name>{...}</function>
    //   <function=name>{...}
    //   <function=name[]{"..."}
    //   <function=name {"..."}
    //   name={"..."}
    // Also tolerates truncated JSON (missing closing brace) by appending '}' until parse succeeds.
    if (toolCalls.length === 0 && fullText) {
      const regex = /(?:<function=|(?<![a-z_]))([a-z_][a-z0-9_]*)\s*(?:\[\])?\s*[=>\s]\s*(\{[\s\S]*?)(?=<\/function>|<function=|$)/gi
      const matches: Array<{ name: string; raw: string }> = []
      let m: RegExpExecArray | null
      while ((m = regex.exec(fullText)) !== null) {
        matches.push({ name: m[1], raw: m[2] })
      }
      if (matches.length > 0) {
        // Grab the last user utterance — used as a fallback when JSON args are truncated.
        const lastUser = [...this.messages].reverse().find(m => m.role === 'user')?.content || ''
        toolCalls = matches.map((mt, i) => {
          let args: any = {}
          let parsed = false
          let candidate = mt.raw.trim()
          for (let attempt = 0; attempt < 3; attempt++) {
            try { args = JSON.parse(candidate); parsed = true; break } catch {
              if (!candidate.endsWith('}')) candidate += '"}'
              else break
            }
          }
          // JSON was truncated or garbage — synthesize best-effort args from the user's turn
          // so a real tool call fires instead of silently returning nothing (which triggers
          // downstream hallucination).
          if (!parsed && lastUser) {
            const toolDef = this.tools.find(t => t.function?.name === mt.name)
            const props = toolDef?.function?.parameters?.properties || {}
            if (props.query) args.query = lastUser
            else if (props.short_description) args.short_description = lastUser
            else if (props.number) {
              const m2 = lastUser.match(/\b[A-Z]{2,5}\d{5,}\b/i)
              if (m2) args.number = m2[0].toUpperCase()
            }
            addLog('warn', 'llm', 'Tool call args unparseable — synthesized from last user message for ' + mt.name, { tenantId: this.tenant.id })
          }
          return { id: 'text_call_' + i, name: mt.name, arguments: args || {} }
        }).filter((tc: any) => tc.name && this.tools.some(t => t.function?.name === tc.name))
        // Strip the leaked syntax from the spoken text
        fullText = fullText.replace(/<function=[\s\S]*?(?:<\/function>|$)/gi, '').trim()
        if (toolCalls.length > 0) {
          addLog('warn', 'llm', 'Recovered ' + toolCalls.length + ' inline tool call(s) from text leak', { tenantId: this.tenant.id })
        }
      }
    }

    // Always scrub any leaked tool-call syntax from the returned text before it is
    // persisted to history or sent to ServiceNow for logging. The spoken text is
    // already clean (sanitized per-sentence) but the full stream can still contain
    // <function=...> fragments if the parser missed a variant.
    fullText = fullText
      .replace(/<function=[\s\S]*?(?:<\/function>|$)/gi, '')
      .replace(/\b[a-z_]+\s*=\s*\{[\s\S]*?\}/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Narrate-without-tool recovery: when the model streams "let me search/check/look"
    // but emits no tool call, force a single retry with tool_choice=required. Without
    // this, the loop would move on and leave the user hanging while the agent "thinks"
    // about an action it never actually takes. Skip when forceText=true (tools were
    // intentionally disabled) or when tools are unavailable.
    if (!forceText && toolCalls.length === 0 && fullText && this.tools.length > 0) {
      const narrationPattern = /\b(let me|i['’]?ll|i will|i['’]?m going to|i am going to|let['’]?s|going to)\s+(search|look|check|find|pull|fetch|create|make|take a look|walk you through|see)\b/i
      if (narrationPattern.test(fullText)) {
        addLog('warn', 'llm', 'Narrate-without-tool detected — forcing tool call via retry', { tenantId: this.tenant.id })
        try {
          const forcedParams: any = { ...params, tool_choice: 'required', stream: false }
          const forcedRes: any = await this.llm.chat.completions.create(forcedParams)
          const forcedMsg = forcedRes?.choices?.[0]?.message
          const forcedCalls = (forcedMsg?.tool_calls || []).map((tc: any) => ({
            id: tc.id || 'forced_' + Date.now(),
            name: tc.function?.name,
            arguments: (() => { try { return JSON.parse(tc.function?.arguments || '{}') } catch { return {} } })(),
          })).filter((t: any) => t.name && this.tools.some(td => td.function?.name === t.name))
          if (forcedCalls.length > 0) {
            addLog('info', 'llm', 'Narrate-recovery: forced ' + forcedCalls.length + ' tool call(s)', { tenantId: this.tenant.id })
            // Narration was already streamed to TTS — keep it; attach the forced tool call(s).
            return { text: fullText, toolCalls: forcedCalls }
          }
        } catch (forceErr: any) {
          addLog('warn', 'llm', 'Forced-tool retry failed: ' + forceErr.message, { tenantId: this.tenant.id })
        }
      }
    }

    addLog('info', 'llm', 'Done: ' + fullText.substring(0, 80) + ' tools=' + toolCalls.length, { tenantId: this.tenant.id })
    return { text: fullText, toolCalls }
  }

  // ── Sanitize text before speaking (strip code, prompts, JSON, tool calls) ──
  private sanitizeForSpeech(text: string): string {
    if (!text) return ''
    let clean = text
    // Remove function call syntax: <function=name>{...}</function>
    clean = clean.replace(/<function=[\s\S]*?(?:<\/function>|$)/g, '')
    // Remove XML/HTML tags
    clean = clean.replace(/<[^>]+>/g, '')
    // Remove JSON blobs: {...}
    clean = clean.replace(/\{[^}]{50,}\}/g, '')
    // Remove code blocks: ```...```
    clean = clean.replace(/```[\s\S]*?```/g, '')
    // Remove inline code: `...`
    clean = clean.replace(/`[^`]+`/g, '')
    // Remove markdown: **, __, ##
    clean = clean.replace(/[*_#]+/g, '')
    // Remove URLs
    clean = clean.replace(/https?:\/\/[^\s]+/g, '')
    // Remove "function", "tool_call", "parameters" etc if leaked
    clean = clean.replace(/\b(function|tool_call|parameters|input_schema|execution_script)\b/gi, '')
    // Collapse whitespace
    clean = clean.replace(/\s+/g, ' ').trim()
    return clean
  }

  // ── TTS WebSocket with proper buffering ──
  private ttsAudioBuffer: Buffer[] = []
  private ttsResolve: (() => void) | null = null
  private ttsWs: any = null
  private ttsKeepAlive: ReturnType<typeof setInterval> | null = null

  private async connectTtsWs(): Promise<void> {
    const WebSocket = require('ws')
    return new Promise((resolve, reject) => {
      const ttsEncoding = this.audioFormat === 'phone' ? 'mulaw' : 'linear16'
      const ttsSampleRate = this.audioFormat === 'phone' ? 8000 : 24000
      const url = `wss://api.deepgram.com/v1/speak?model=${this.ttsVoice}&encoding=${ttsEncoding}&sample_rate=${ttsSampleRate}`
      this.ttsWs = new WebSocket(url, { headers: { 'Authorization': `Token ${this.ttsKey}` } })

      this.ttsWs.on('open', () => {
        // Deepgram TTS closes after ~10s of inactivity. Send KeepAlive every 8s
        // so the connection stays alive between the greeting and the first response.
        if (this.ttsKeepAlive) clearInterval(this.ttsKeepAlive)
        this.ttsKeepAlive = setInterval(() => {
          if (this.ttsWs && this.ttsWs.readyState === 1) {
            try { this.ttsWs.send(JSON.stringify({ type: 'KeepAlive' })) } catch {}
          } else {
            if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null }
          }
        }, 8000)
        resolve()
      })
      this.ttsWs.on('message', (data: any, isBinary: boolean) => {
        if (isBinary && Buffer.isBuffer(data) && data.length > 10 && !this.isBargingIn) {
          // Stream audio immediately to widget — AudioWorklet handles smooth playback
          this.emit('audio', data)
          this.ttsAudioBuffer.push(data) // Track for logging
        } else if (!isBinary || (Buffer.isBuffer(data) && data[0] === 0x7b)) {
          try {
            const msg = JSON.parse(Buffer.isBuffer(data) ? data.toString() : data)
            if (msg.type === 'Flushed') {
              const totalBytes = this.ttsAudioBuffer.reduce((s, b) => s + b.length, 0)
              addLog('info', 'tts', 'Flushed: ' + this.ttsAudioBuffer.length + ' chunks, ' + totalBytes + ' bytes', { tenantId: this.tenant.id })
              this.ttsAudioBuffer = []
              if (this.ttsResolve) { this.ttsResolve(); this.ttsResolve = null }
            }
          } catch {}
        }
      })
      this.ttsWs.on('error', (e: any) => reject(e))
      this.ttsWs.on('close', () => {
        if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null }
        this.ttsWs = null
      })
      setTimeout(() => reject(new Error('TTS timeout')), 5000)
    })
  }

  private async speakAndStream(rawText: string) {
    const text = this.sanitizeForSpeech(rawText)
    if (!text || this.isBargingIn) return

    if (!this.ttsWs || this.ttsWs.readyState !== 1) {
      try { await this.connectTtsWs() } catch (e: any) {
        addLog('error', 'tts', 'Connect failed: ' + e.message, { tenantId: this.tenant.id })
        return
      }
    }

    addLog('info', 'tts', 'Speaking: "' + text.substring(0, 60) + '"', { tenantId: this.tenant.id })
    this.ttsAudioBuffer = []

    try {
      this.ttsWs.send(JSON.stringify({ type: 'Speak', text: text }))
      this.ttsWs.send(JSON.stringify({ type: 'Flush' }))

      await new Promise<void>((resolve) => {
        this.ttsResolve = resolve
        setTimeout(() => { if (this.ttsResolve) { this.ttsResolve(); this.ttsResolve = null } }, 15000)
      })
    } catch (err: any) {
      addLog('error', 'tts', 'Error: ' + err.message, { tenantId: this.tenant.id })
    }
  }

  // ── ServiceNow REST ──
  private async snFetch(method: string, path: string, body?: any): Promise<unknown> {
    const baseUrl = `${this.tenant.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/voice_agent${path}`
    const auth = Buffer.from(`${this.tenant.snUsername}:${this.tenant.snPassword}`).toString('base64')

    // Circuit breaker — skip the call entirely if this tenant has been hammering SN failures.
    const breaker = SN_CIRCUITS.get(this.tenant.id)
    if (breaker?.openUntil && breaker.openUntil > Date.now()) {
      const secs = Math.ceil((breaker.openUntil - Date.now()) / 1000)
      addLog('warn', 'sn', `SN circuit OPEN for tenant (retry in ${secs}s): ${path}`, { tenantId: this.tenant.id })
      throw new Error('SN temporarily unavailable (circuit breaker)')
    }

    addLog('debug', 'sn', `${method} ${path}`, { tenantId: this.tenant.id, data: { url: baseUrl } })

    const maxAttempts = 2 // 1 retry on 5xx/network
    let lastErr: any

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(baseUrl, {
          method,
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        })

        const text = await res.text()
        addLog('debug', 'sn', `Response ${res.status} from ${path}`, { tenantId: this.tenant.id, data: { status: res.status, bodyPreview: text.substring(0, 200) } })

        let data: any
        try { data = JSON.parse(text) } catch { throw new Error(`SN returned non-JSON (${res.status}): ${text.substring(0, 200)}`) }

        if (!res.ok) {
          // 4xx = client error, don't retry. 5xx = server, retry once.
          const retriable = res.status >= 500 && res.status < 600
          if (retriable && attempt < maxAttempts) {
            addLog('warn', 'sn', `SN ${res.status} on ${path} — retrying (attempt ${attempt + 1}/${maxAttempts})`, { tenantId: this.tenant.id })
            await new Promise(r => setTimeout(r, 200 * attempt))
            continue
          }
          addLog('error', 'sn', `SN API error ${res.status}: ${path}`, { tenantId: this.tenant.id, data: { status: res.status, error: text.substring(0, 300) } })
          _recordSNResult(this.tenant.id, retriable ? 'fail' : 'ok') // 4xx doesn't count against circuit
          throw new Error(`SN API ${res.status}: ${text.substring(0, 200)}`)
        }

        _recordSNResult(this.tenant.id, 'ok')
        return data.result || data
      } catch (err: any) {
        lastErr = err
        // Network-level failure — retry once with backoff.
        if (attempt < maxAttempts && !err.message?.startsWith('SN API')) {
          addLog('warn', 'sn', `Network error on ${path} — retrying (attempt ${attempt + 1}/${maxAttempts}): ${err.message}`, { tenantId: this.tenant.id })
          await new Promise(r => setTimeout(r, 200 * attempt))
          continue
        }
        break
      }
    }

    addLog('error', 'sn', `SN fetch failed: ${lastErr.message}`, { tenantId: this.tenant.id, data: { path, error: lastErr.message } })
    _recordSNResult(this.tenant.id, 'fail')
    throw lastErr
  }
}

// ── Per-tenant SN circuit breaker ──
// Five consecutive failures in 60s → open circuit for 60s. Any success resets the counter.
const SN_CIRCUITS = new Map<string, { fails: number; firstFailAt: number; openUntil: number }>()
const SN_FAIL_THRESHOLD = 5
const SN_FAIL_WINDOW_MS = 60_000
const SN_OPEN_MS = 60_000

function _recordSNResult(tenantId: string, outcome: 'ok' | 'fail') {
  const now = Date.now()
  let c = SN_CIRCUITS.get(tenantId)

  if (outcome === 'ok') {
    if (c) {
      c.fails = 0
      c.firstFailAt = 0
      c.openUntil = 0
    }
    return
  }

  if (!c) {
    c = { fails: 0, firstFailAt: 0, openUntil: 0 }
    SN_CIRCUITS.set(tenantId, c)
  }

  // Reset counter if last fail is outside the window
  if (c.firstFailAt && now - c.firstFailAt > SN_FAIL_WINDOW_MS) {
    c.fails = 0
    c.firstFailAt = 0
  }

  if (c.fails === 0) c.firstFailAt = now
  c.fails++

  if (c.fails >= SN_FAIL_THRESHOLD) {
    c.openUntil = now + SN_OPEN_MS
    // Notify admins asynchronously; this function stays sync.
    import('../lib/alerts').then(m => m.notifyAdmins({
      tenantId,
      severity: 'error',
      kind: 'sn.circuit_open',
      message: `SN circuit breaker opened for tenant ${tenantId} after ${c!.fails} consecutive failures`,
      data: { openMs: SN_OPEN_MS },
    })).catch(() => {})
  }
}
