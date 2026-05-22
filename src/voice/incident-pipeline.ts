/**
 * IncidentPipeline — dedicated voice co-agent for incident resolution.
 * Fetches SLAs, attachments, related records, and journal entries from SN
 * at startup so the agent can give proactive, context-aware suggestions.
 */
import { EventEmitter } from 'events'
import { addLog } from '../lib/log-store'

type IncidentCtx = Record<string, string>
type SnCreds = { url: string; username: string; password: string }

export interface IncidentAgentCfg {
  llmModel?:             string
  llmTemperature?:       number
  llmMaxTokens?:         number
  sttModel?:             string
  sttLanguage?:          string
  ttsVoice?:             string
  agentName?:            string
  agentSubtitle?:        string
  systemPrompt?:         string | null
  greetingTemplate?:     string | null
  toolUpdateField?:      boolean
  toolSuggestResolution?: boolean
  toolSuggestReply?:     boolean
  toolSearchIncidents?:  boolean
  toolSearchKb?:         boolean
}

const STATE_LABELS: Record<string, string> = {
  '1': 'New', '2': 'In Progress', '3': 'On Hold',
  '6': 'Resolved', '7': 'Closed', '8': 'Canceled',
}
const PRIORITY_LABELS: Record<string, string> = {
  '1': '1 - Critical', '2': '2 - High', '3': '3 - Moderate', '4': '4 - Low',
}
const URGENCY_LABELS: Record<string, string> = {
  '1': '1 - High', '2': '2 - Medium', '3': '3 - Low',
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
        'Request permission to update a field on the incident form. Always verbally explain what you want to update and why BEFORE calling this tool. The user will see a Confirm / Cancel prompt and can also say yes or no. Updatable fields: state, priority, urgency, assignment_group, assigned_to, category, subcategory, close_notes, work_notes.',
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
        'Generate resolution notes text for the close_notes field. Call when the user asks for resolution notes, a closing summary, or how to document the fix.',
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
        'Draft a customer-facing message to post in the incident comments for the caller to see.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The reply / comment text for the caller.' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_similar_incidents',
      description:
        'Search ServiceNow for recently resolved incidents with similar symptoms to find proven resolution steps. Use when the agent needs resolution ideas or when the user asks for similar cases.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords from the symptom, error message, or category.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        'Search ServiceNow knowledge base for published articles with resolution steps or known-error workarounds.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms for relevant KB articles.' },
        },
        required: ['query'],
      },
    },
  },
]

export class IncidentPipeline extends EventEmitter {
  private ctx: IncidentCtx
  private snCreds: SnCreds | null = null
  private cfg: IncidentAgentCfg
  private messages: any[] = []
  private stt: any = null
  private ttsWs: any = null
  private ttsKeepAlive: ReturnType<typeof setInterval> | null = null
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

  // Enriched context fetched from SN at startup
  private slaInfo: any[] = []
  private attachmentInfo: { name: string; sizeKb: number; content?: string }[] = []
  private relatedInfo: Record<string, string> = {}

  // Pending field-update confirmation (one at a time)
  private pendingConfirm: {
    confirmId: string; field: string; value: string; valueLabel: string
  } | null = null

  constructor(ctx: IncidentCtx, snCreds?: SnCreds, cfg?: IncidentAgentCfg) {
    super()
    this.ctx = ctx || {}
    this.snCreds = snCreds || null
    this.cfg = cfg || {}
  }

  /* ── Public entry point ─────────────────────────────────────────────── */
  async start() {
    try {
      const dgKey = process.env.DEEPGRAM_API_KEY
      if (!dgKey) throw new Error('DEEPGRAM_API_KEY not configured')

      const { DeepgramClient } = require('@deepgram/sdk')
      const dgClient = new DeepgramClient(dgKey)
      this.stt = await dgClient.listen.v1.connect({
        model:    this.cfg.sttModel    || 'nova-3',
        language: this.cfg.sttLanguage || 'multi',
        smart_format: true, punctuate: true,
        interim_results: true, utterance_end_ms: 1500, endpointing: 800,
        encoding: 'linear16', sample_rate: 16000, channels: 1,
      })
      this.setupSTT()
      if (typeof this.stt.connect === 'function') await this.stt.connect()

      this.ttsKey = dgKey
      this.ttsVoice = this.cfg.ttsVoice || process.env.INCIDENT_TTS_VOICE || 'aura-asteria-en'
      await this.connectTtsWs()

      const llmKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY
      if (!llmKey) throw new Error('No LLM key — set GROQ_API_KEY or OPENAI_API_KEY')
      const useGroq = !!process.env.GROQ_API_KEY
      const OpenAI = require('openai')
      this.llm = new OpenAI({
        apiKey: llmKey,
        baseURL: useGroq ? (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1') : undefined,
      })
      this.model = this.cfg.llmModel || process.env.INCIDENT_LLM_MODEL || (useGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini')

      // Fetch enriched context: SLAs, attachments, related records, journal entries
      let enrichedContext = ''
      if (this.snCreds?.url && this.ctx.sys_id) {
        this.emit('state', 'loading')
        addLog('info', 'incident-pipeline', 'Fetching enriched SN context…', {})
        try {
          enrichedContext = await Promise.race([
            this.fetchEnrichedData(),
            new Promise<string>(r => setTimeout(() => r(''), 10000)),
          ])
        } catch (e: any) {
          addLog('warn', 'incident-pipeline', 'Enriched fetch partial/failed: ' + e.message, {})
        }
      }

      // Push enriched data to widget for UI rendering
      if (this.slaInfo.length || this.attachmentInfo.length) {
        this.emit('context_enriched', {
          slas: this.slaInfo.map(s => ({
            name:       s['sla.name'] || 'SLA',
            stage:      s.stage || '',
            percentage: s.percentage ? Math.round(parseFloat(s.percentage)) : 0,
            timeLeft:   s.time_left || '',
            breached:   s.has_breached === 'true',
          })),
          attachments: this.attachmentInfo.map(a => ({ name: a.name, sizeKb: a.sizeKb })),
          related: this.relatedInfo,
        })
      }

      this.messages.push({ role: 'system', content: this.buildSystemPrompt(enrichedContext) })

      const greet = this.buildGreeting()
      this.isAgentSpeaking = true
      this.emit('state', 'speaking')
      this.emit('agent_message', greet)
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

  handleFieldConfirm(confirmId: string, confirmed: boolean) {
    if (!this.pendingConfirm || this.pendingConfirm.confirmId !== confirmId) return
    const { field, value, valueLabel } = this.pendingConfirm
    this.pendingConfirm = null
    if (confirmed) {
      this.applyToServiceNow(field, value).then(snOk => {
        this.emit('form_update', { field, value, valueLabel, applyNow: true, snUpdated: snOk })
      }).catch(() => {
        this.emit('form_update', { field, value, valueLabel, applyNow: true, snUpdated: false })
      })
      this.processUserMessage(`[SYSTEM] User confirmed updating ${field} to "${valueLabel}".`).catch(() => {})
    } else {
      this.processUserMessage('[SYSTEM] User declined the field update.').catch(() => {})
    }
  }

  async applyManualUpdate(field: string, value: string): Promise<void> {
    const snOk = await this.applyToServiceNow(field, value).catch(() => false)
    this.emit('form_update', { field, value, valueLabel: value, applyNow: true, snUpdated: snOk })
  }

  private async applyToServiceNow(field: string, value: string): Promise<boolean> {
    if (!this.snCreds?.url || !this.ctx.sys_id) return false
    try {
      const { url, username, password } = this.snCreds
      const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
      const result = await this.snPatch(
        `${url}/api/now/table/incident/${this.ctx.sys_id}`,
        auth,
        { [field]: value }
      )
      const ok = !!result?.result
      addLog(ok ? 'info' : 'warn', 'incident-pipeline', `SN PATCH ${ok ? 'OK' : 'failed'}: ${field}`, {})
      return ok
    } catch (e: any) {
      addLog('warn', 'incident-pipeline', 'SN PATCH error: ' + e.message, {})
      return false
    }
  }

  private snPatch(url: string, auth: string, body: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const lib = require(url.startsWith('https') ? 'https' : 'http')
      const data = JSON.stringify(body)
      const parsed = new URL(url)
      const opts = {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: 'PATCH',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }
      const req = lib.request(opts, (res: any) => {
        let body = ''
        res.on('data', (c: any) => { body += c })
        res.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(null) } })
      })
      req.on('error', reject)
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('SN PATCH timeout')) })
      req.write(data)
      req.end()
    })
  }

  async stop() {
    if (this.stopped) return
    this.stopped = true
    try { if (this.stt?.close) this.stt.close() } catch {}
    if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null }
    try { if (this.ttsWs?.close) this.ttsWs.close() } catch {}
    this.ttsWs = null
    this.emit('ended')
  }

  /* ── Enriched context fetch ─────────────────────────────────────────── */
  private async fetchEnrichedData(): Promise<string> {
    const { url, username, password } = this.snCreds!
    const auth  = 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
    const sysId = this.ctx.sys_id
    const parts: string[] = []

    const [slaR, attR, incR, jrnR] = await Promise.allSettled([
      this.snGet(`${url}/api/now/table/task_sla?sysparm_query=task=${sysId}&sysparm_fields=sla.name,stage,has_breached,percentage,time_left,breach_time&sysparm_limit=5`, auth),
      this.snGet(`${url}/api/now/attachment?sysparm_query=table_name=incident^table_sys_id=${sysId}&sysparm_fields=sys_id,file_name,size_bytes,content_type&sysparm_limit=10`, auth),
      this.snGet(`${url}/api/now/table/incident/${sysId}?sysparm_fields=cmdb_ci,cmdb_ci.name,cmdb_ci.short_description,business_service,business_service.name,problem_id,problem_id.short_description,rfc,rfc.short_description,parent_incident,parent_incident.number,caused_by,caused_by.short_description`, auth),
      this.snGet(`${url}/api/now/table/sys_journal_field?sysparm_query=element_id=${sysId}^ORDERBYDESCsys_created_on&sysparm_fields=element,value,sys_created_by,sys_created_on&sysparm_limit=15`, auth),
    ])

    // SLAs
    if (slaR.status === 'fulfilled' && slaR.value?.result?.length) {
      this.slaInfo = slaR.value.result
      const lines = this.slaInfo.map((s: any) => {
        const breached = s.has_breached === 'true' ? ' *** BREACHED ***' : ''
        const pct  = s.percentage ? Math.round(parseFloat(s.percentage)) + '% elapsed' : ''
        const left = s.time_left ? 'time left: ' + s.time_left : ''
        return `  - ${s['sla.name'] || 'SLA'}: stage=${s.stage || '?'}, ${[pct, left, breached].filter(Boolean).join(', ')}`
      })
      parts.push('SLAs:\n' + lines.join('\n'))
    }

    // Attachments (download text files up to 200 KB)
    if (attR.status === 'fulfilled' && attR.value?.result?.length) {
      const atts = attR.value.result
      const attLines: string[] = []
      const downloads: Promise<void>[] = []

      for (const att of atts) {
        const sizeKb = Math.round(parseInt(att.size_bytes || '0') / 1024)
        const ct     = (att.content_type || '').toLowerCase()
        const isText = ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') ||
                       ct.includes('log') || /\.(txt|log|xml|json|csv|md|yaml|yml)$/i.test(att.file_name || '')
        const info: { name: string; sizeKb: number; content?: string } = { name: att.file_name || 'file', sizeKb }
        this.attachmentInfo.push(info)
        const idx = attLines.length
        attLines.push(`  - ${att.file_name} (${sizeKb} KB)`)

        if (isText && sizeKb < 200 && att.sys_id) {
          downloads.push(
            this.snGetText(`${url}/api/now/attachment/${att.sys_id}/file`, auth)
              .then(text => {
                if (text) {
                  info.content = text.substring(0, 1500)
                  attLines[idx] += `:\n    ${info.content.replace(/\n/g, '\n    ')}`
                }
              }).catch(() => {})
          )
        }
      }

      await Promise.allSettled(downloads)
      parts.push(`Attachments (${atts.length}):\n` + attLines.join('\n'))
    }

    // Related records: CI, business service, problem, change
    if (incR.status === 'fulfilled' && incR.value?.result) {
      const rec     = incR.value.result
      const related: string[] = []
      const ci      = rec['cmdb_ci.name']
      const ciDesc  = rec['cmdb_ci.short_description']
      const svc     = rec['business_service.name']
      const prob    = rec['problem_id.short_description']
      const rfc     = rec['rfc.short_description']
      const parent  = rec['parent_incident.number']
      const caused  = rec['caused_by.short_description']

      if (ci)     { this.relatedInfo.ci = ci;        related.push(`  CI: ${ci}${ciDesc ? ' — ' + ciDesc : ''}`) }
      if (svc)    { this.relatedInfo.service = svc;   related.push(`  Business Service: ${svc}`) }
      if (prob)   { this.relatedInfo.problem = prob;  related.push(`  Linked Problem: ${prob}`) }
      if (rfc)                                         related.push(`  Change Request: ${rfc}`)
      if (parent)                                      related.push(`  Parent Incident: ${parent}`)
      if (caused)                                      related.push(`  Caused By: ${caused}`)

      if (related.length) parts.push('Related Records:\n' + related.join('\n'))
    }

    // Journal entries (work notes + comments)
    if (jrnR.status === 'fulfilled' && jrnR.value?.result?.length) {
      const entries = jrnR.value.result
      const lines   = entries.map((e: any) =>
        `  [${e.element || 'note'} by ${e.sys_created_by || '?'} at ${(e.sys_created_on || '').substring(0, 16)}]: ${(e.value || '').substring(0, 300)}`
      )
      parts.push('Recent Activity (work notes / comments):\n' + lines.join('\n'))
    }

    return parts.join('\n\n')
  }

  /* ── SN HTTP helpers ────────────────────────────────────────────────── */
  private snGet(url: string, auth: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const lib = require(url.startsWith('https') ? 'https' : 'http')
      const req = lib.get(url, { headers: { Authorization: auth, Accept: 'application/json' } }, (res: any) => {
        let body = ''
        res.on('data', (c: any) => { body += c })
        res.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(null) } })
      })
      req.on('error', reject)
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('SN timeout')) })
    })
  }

  private snGetText(url: string, auth: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const lib = require(url.startsWith('https') ? 'https' : 'http')
      const req = lib.get(url, { headers: { Authorization: auth } }, (res: any) => {
        let body = ''
        res.on('data', (c: any) => { body += c })
        res.on('end', () => resolve(body))
      })
      req.on('error', reject)
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('SN timeout')) })
    })
  }

  /* ── Proactive greeting ─────────────────────────────────────────────── */
  private buildSlaSummary(): string {
    if (!this.slaInfo.length) return ''
    const breached = this.slaInfo.filter((s: any) => s.has_breached === 'true')
    const active   = this.slaInfo.filter((s: any) => s.has_breached !== 'true' && s.time_left)
    if (breached.length)
      return `Warning — the ${breached.map((s: any) => s['sla.name'] || 'SLA').join(' and ')} ${breached.length > 1 ? 'have' : 'has'} already breached.`
    if (active.length) {
      const s: any = active[0]
      const pct    = s.percentage ? Math.round(parseFloat(s.percentage)) : 0
      return `The ${s['sla.name'] || 'SLA'} is ${pct}% elapsed with ${s.time_left} remaining.`
    }
    return ''
  }

  private buildAttachmentSummary(): string {
    if (!this.attachmentInfo.length) return ''
    const readable = this.attachmentInfo.filter(a => a.content)
    if (readable.length)
      return `I've read ${readable.length} text attachment${readable.length > 1 ? 's' : ''}: ${readable.map(a => a.name).join(', ')}.`
    const names = this.attachmentInfo.slice(0, 3).map(a => a.name).join(', ')
    return `There ${this.attachmentInfo.length === 1 ? 'is' : 'are'} ${this.attachmentInfo.length} attachment${this.attachmentInfo.length > 1 ? 's' : ''}: ${names}.`
  }

  private buildGreeting(): string {
    const inc = this.ctx

    // Custom greeting template — substitute placeholders
    if (this.cfg.greetingTemplate) {
      return this.cfg.greetingTemplate
        .replace('{{number}}',              inc.number || 'this incident')
        .replace('{{short_description}}',   inc.short_description || '')
        .replace('{{priority}}',            PRIORITY_LABELS[inc.priority] || inc.priority || '')
        .replace('{{state}}',               STATE_LABELS[inc.state] || inc.state || '')
        .replace('{{sla_summary}}',         this.buildSlaSummary())
        .replace('{{attachment_summary}}',  this.buildAttachmentSummary())
    }

    // Built-in default greeting
    const parts: string[] = []
    let opening = `I've loaded ${inc.number || 'this incident'}`
    if (inc.short_description) opening += ` — "${inc.short_description}"`
    const priority = PRIORITY_LABELS[inc.priority] || ''
    const state    = STATE_LABELS[inc.state] || ''
    if (priority || state) opening += `. ${[priority, state].filter(Boolean).join(', ')}.`
    parts.push(opening)

    const slaSummary = this.buildSlaSummary()
    if (slaSummary) parts.push(slaSummary)

    const attSummary = this.buildAttachmentSummary()
    if (attSummary) parts.push(attSummary)

    if (this.relatedInfo.ci)           parts.push(`The affected CI is ${this.relatedInfo.ci}.`)
    else if (this.relatedInfo.service) parts.push(`Business service: ${this.relatedInfo.service}.`)

    parts.push('What would you like to tackle first?')
    return parts.join(' ')
  }

  /* ── System prompt ──────────────────────────────────────────────────── */
  private buildIncidentFieldsBlock(): string {
    const lines: string[] = []
    for (const [k, v] of Object.entries(this.ctx)) {
      if (!v || k === 'sys_id' || k === 'state_display') continue
      let val = String(v)
      if (k === 'state')    val = STATE_LABELS[val]    || val
      if (k === 'priority') val = PRIORITY_LABELS[val] || val
      if (k === 'urgency')  val = URGENCY_LABELS[val]  || val
      lines.push(`  ${FIELD_LABELS[k] || k}: ${val}`)
    }
    return lines.length ? lines.join('\n') : '  (No form data captured)'
  }

  private static readonly FIELD_VALUE_REFERENCE = `FIELD VALUE REFERENCE — always use these exact raw values in update_incident_field, never the label:
  State:    1=New  2=In Progress  3=On Hold  6=Resolved  7=Closed  8=Canceled
  Priority: 1=Critical  2=High  3=Moderate  4=Low
  Urgency:  1=High  2=Medium  3=Low
  Impact:   1=High  2=Medium  3=Low
Example: to mark Resolved → field="state", value="6", value_label="Resolved"`

  private buildSystemPrompt(enrichedContext: string): string {
    const incidentFields = this.buildIncidentFieldsBlock()

    // Use custom template if configured — substitute placeholders
    if (this.cfg.systemPrompt) {
      return this.cfg.systemPrompt
        .replace('{{incident_fields}}',    incidentFields)
        .replace('{{enriched_context}}',   enrichedContext || '')
        .replace('{{field_value_reference}}', IncidentPipeline.FIELD_VALUE_REFERENCE)
        // Always append field reference if placeholder not present (safety net)
        + (this.cfg.systemPrompt.includes('{{field_value_reference}}')
            ? ''
            : '\n\n' + IncidentPipeline.FIELD_VALUE_REFERENCE)
    }

    // Built-in default prompt
    return `You are a dedicated Incident Resolution Co-Agent embedded in ServiceNow. You are assisting the ASSIGNED AGENT working to resolve this ticket — not the end user / caller. Act as a knowledgeable co-worker who has already read all the details.

CURRENT INCIDENT:
${incidentFields}
${enrichedContext ? '\n' + enrichedContext : ''}

${IncidentPipeline.FIELD_VALUE_REFERENCE}

YOUR ROLE:
1. You have reviewed all incident details, SLAs, attachments, and recent activity — reference them proactively
2. Identify root cause from error logs, comments, and description
3. Suggest specific, actionable resolution steps based on actual content
4. Warn immediately about SLA breaches or time pressure
5. Search for similar resolved incidents or KB articles when helpful
6. Draft work notes (suggest_resolution_note) and caller updates (suggest_reply_to_caller)
7. Propose field updates with explicit confirmation (update_incident_field)

PROACTIVE BEHAVIOR: After the greeting, immediately propose the single most useful action you can take. Always offer what you will do next and ask "Shall I proceed?" before acting. Examples:
- "I can search for similar resolved incidents to find proven fixes. Shall I proceed?"
- "Based on the description, I suggest we mark this In Progress and search the knowledge base. Shall I proceed?"
- "I can draft resolution notes for the close notes field. Shall I proceed?"

CONFIRMATION RULE: Before calling ANY tool — search_similar_incidents, search_knowledge_base, suggest_resolution_note, suggest_reply_to_caller, or update_incident_field — you MUST first verbally describe the action and ask "Shall I proceed?" or "Would you like me to do that?" Never call a tool in the same turn you decide to use it. Always wait for the user to say yes or confirm before executing.

VOICE RULES: Keep replies to 2–4 sentences. No markdown, no bullet points, no JSON. Speak naturally. Paraphrase log content — don't recite raw lines.`
  }

  /* ── User message processing ────────────────────────────────────────── */
  private async processUserMessage(message: string) {
    if (!message.trim()) return
    if (this.processing) { this.messageQueue.push(message); return }

    this.isBargingIn = false

    // Voice confirmation when awaiting field update
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
          this.applyToServiceNow(pc.field, pc.value).then(snOk => {
            this.emit('form_update', { field: pc.field, value: pc.value, valueLabel: pc.valueLabel, applyNow: true, snUpdated: snOk })
          }).catch(() => {
            this.emit('form_update', { field: pc.field, value: pc.value, valueLabel: pc.valueLabel, applyNow: true, snUpdated: false })
          })
          const resp = `Done — I've updated ${FIELD_LABELS[pc.field] || pc.field} to "${pc.valueLabel}".`
          this.emit('agent_message', resp)
          await this.speakAndStream(resp)
          this.messages.push({ role: 'assistant', content: resp })
        } else {
          const resp = "Okay, I've cancelled that update. What else can I help with?"
          this.emit('agent_message', resp)
          await this.speakAndStream(resp)
          this.messages.push({ role: 'assistant', content: resp })
        }
        this.processing = false
        this.emit('state', 'listening')
        if (!this.stopped && this.messageQueue.length > 0) this.processUserMessage(this.messageQueue.shift()!)
        return
      }
    }

    this.processing = true
    if (!message.startsWith('[SYSTEM]')) this.emit('user_message', message)
    this.messages.push({ role: 'user', content: message })
    this.isAgentSpeaking = true
    this.emit('state', 'processing')

    try {
      const result = await this.callLLM()

      for (const tc of (result.toolCalls || [])) {
        if (tc.name === 'update_incident_field') {
          const confirmId = 'cf_' + Date.now()
          const { field = '', value = '', value_label: valueLabel = value, reason = '' } = tc.arguments || {}
          this.pendingConfirm = { confirmId, field, value, valueLabel }
          this.emit('field_update_pending', { confirmId, field, value, valueLabel, reason })
          this.pushToolMsg(tc, result.text, `Waiting for user to confirm updating ${field} to "${valueLabel}".`)

        } else if (tc.name === 'suggest_resolution_note') {
          this.emit('suggestion', { sugType: 'resolution', text: tc.arguments?.text || '' })
          this.pushToolMsg(tc, result.text, 'Resolution note shown in widget.')

        } else if (tc.name === 'suggest_reply_to_caller') {
          this.emit('suggestion', { sugType: 'reply', text: tc.arguments?.text || '' })
          this.pushToolMsg(tc, result.text, 'Reply suggestion shown in widget.')

        } else if (tc.name === 'search_similar_incidents') {
          const searchResult = await this.searchSimilarIncidents(tc.arguments?.query || '')
          this.pushToolMsg(tc, result.text, searchResult)
          const followUp = await this.callLLM(true)
          if (followUp.text) this.messages.push({ role: 'assistant', content: followUp.text })

        } else if (tc.name === 'search_knowledge_base') {
          const kbResult = await this.searchKnowledgeBase(tc.arguments?.query || '')
          this.pushToolMsg(tc, result.text, kbResult)
          const followUp = await this.callLLM(true)
          if (followUp.text) this.messages.push({ role: 'assistant', content: followUp.text })
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
      if (!this.stopped && this.messageQueue.length > 0) this.processUserMessage(this.messageQueue.shift()!)
    }
  }

  private pushToolMsg(tc: any, assistantText: string | null, toolContent: string) {
    this.messages.push({
      role: 'assistant', content: assistantText || null,
      tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } }],
    })
    this.messages.push({ role: 'tool', tool_call_id: tc.id, content: toolContent })
  }

  /* ── SN search helpers ──────────────────────────────────────────────── */
  private async searchSimilarIncidents(query: string): Promise<string> {
    if (!this.snCreds?.url) return 'ServiceNow not configured for search.'
    try {
      const auth = 'Basic ' + Buffer.from(this.snCreds.username + ':' + this.snCreds.password).toString('base64')
      const enc  = encodeURIComponent(query)
      const data = await this.snGet(
        `${this.snCreds.url}/api/now/table/incident?sysparm_query=state=6^short_descriptionLIKE${enc}^ORDERBYDESCsys_updated_on&sysparm_fields=number,short_description,close_notes,close_code&sysparm_limit=3`,
        auth
      )
      const results = data?.result || []
      if (!results.length) return 'No similar resolved incidents found.'
      return results.map((r: any) =>
        `${r.number}: "${r.short_description}" — Resolution: ${(r.close_notes || 'not documented').substring(0, 300)}`
      ).join('\n\n')
    } catch (e: any) {
      return 'Search failed: ' + e.message
    }
  }

  private async searchKnowledgeBase(query: string): Promise<string> {
    if (!this.snCreds?.url) return 'ServiceNow not configured for search.'
    try {
      const auth = 'Basic ' + Buffer.from(this.snCreds.username + ':' + this.snCreds.password).toString('base64')
      const enc  = encodeURIComponent(query)
      const data = await this.snGet(
        `${this.snCreds.url}/api/now/table/kb_knowledge?sysparm_query=workflow_state=published^short_descriptionLIKE${enc}^ORDERBYDESCsys_updated_on&sysparm_fields=number,short_description,text&sysparm_limit=3`,
        auth
      )
      const results = data?.result || []
      if (!results.length) return 'No published KB articles found.'
      return results.map((r: any) =>
        `${r.number}: "${r.short_description}" — ${(r.text || '').replace(/<[^>]+>/g, '').substring(0, 400)}`
      ).join('\n\n')
    } catch (e: any) {
      return 'KB search failed: ' + e.message
    }
  }

  /* ── Active tools filter ────────────────────────────────────────────── */
  private buildActiveTools() {
    const nameMap: Record<string, keyof IncidentAgentCfg> = {
      update_incident_field:  'toolUpdateField',
      suggest_resolution_note:'toolSuggestResolution',
      suggest_reply_to_caller:'toolSuggestReply',
      search_similar_incidents:'toolSearchIncidents',
      search_knowledge_base:  'toolSearchKb',
    }
    return INCIDENT_TOOLS.filter(t => {
      const key = nameMap[t.function.name]
      return key ? (this.cfg[key] !== false) : true
    })
  }

  /* ── LLM streaming ──────────────────────────────────────────────────── */
  private async callLLM(noTools = false): Promise<{ text: string; toolCalls: any[] }> {
    const system  = this.messages.filter(m => m.role === 'system')
    const history = this.messages.filter(m => m.role !== 'system').slice(-14)

    const params: any = {
      model: this.model,
      messages: [...system, ...history],
      temperature: this.cfg.llmTemperature ?? 0.4,
      max_tokens:  this.cfg.llmMaxTokens  ?? 600,
      stream: true,
    }
    if (!noTools) {
      params.tools = this.buildActiveTools()
      params.tool_choice = 'auto'
      params.parallel_tool_calls = false
    }

    let fullText = ''
    let sentBuf  = ''
    const tcDeltas: any[] = []
    let speaking = false
    let toolCallStarted = false

    try {
      const stream = await this.llm.chat.completions.create(params)
      for await (const chunk of stream) {
        if (this.isBargingIn) break
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue

        if (delta.tool_calls?.length) {
          toolCallStarted = true
          sentBuf = ''
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!tcDeltas[tc.index]) tcDeltas[tc.index] = { id: '', name: '', arguments: '' }
              if (tc.id)               tcDeltas[tc.index].id   = tc.id
              if (tc.function?.name)   tcDeltas[tc.index].name = tc.function.name
              if (tc.function?.arguments) tcDeltas[tc.index].arguments += tc.function.arguments
            }
          }
        }

        if (delta.content && !toolCallStarted) {
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
      }

      if (sentBuf.trim() && !this.isBargingIn && !toolCallStarted) {
        const s = this.sanitize(sentBuf.trim())
        if (s) { if (!speaking) this.emit('state', 'speaking'); this.emit('agent_message', s); await this.speakAndStream(s) }
      }
    } catch (err: any) {
      addLog('error', 'incident-llm', 'Stream error: ' + err.message, {})
      throw err
    }

    const toolCalls = tcDeltas.filter(t => t?.name).map(t => ({
      id: t.id, name: t.name,
      arguments: (() => { try { return JSON.parse(t.arguments) } catch { return {} } })(),
    }))

    return { text: fullText, toolCalls }
  }

  /* ── STT ────────────────────────────────────────────────────────────── */
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

  /* ── TTS ────────────────────────────────────────────────────────────── */
  private async connectTtsWs(): Promise<void> {
    const WS = require('ws')
    return new Promise((resolve, reject) => {
      const url = `wss://api.deepgram.com/v1/speak?model=${this.ttsVoice}&encoding=linear16&sample_rate=24000`
      this.ttsWs = new WS(url, { headers: { Authorization: `Token ${this.ttsKey}` } })
      this.ttsWs.on('open', () => {
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
      this.ttsWs.on('close', () => {
        if (this.ttsKeepAlive) { clearInterval(this.ttsKeepAlive); this.ttsKeepAlive = null }
        this.ttsWs = null
      })
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
    const cleaned = text
      .replace(/<[^>]*>/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/[*_#]+/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/\{[^{}]*\}/g, '')
      // Strip bare XML/tool-call artifacts the model may leak into content
      .replace(/^\s*[<>/]+\s*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim()
    // Only return if there is actual readable text (letters or digits)
    return /[a-zA-Z0-9]/.test(cleaned) ? cleaned : ''
  }
}
