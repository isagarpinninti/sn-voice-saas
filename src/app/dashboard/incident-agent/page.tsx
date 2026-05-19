'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { Save, RotateCcw, Info } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Config {
  llmModel: string
  llmTemperature: number
  llmMaxTokens: number
  sttModel: string
  sttLanguage: string
  ttsVoice: string
  agentName: string
  agentSubtitle: string
  systemPrompt: string | null
  greetingTemplate: string | null
  toolUpdateField: boolean
  toolSuggestResolution: boolean
  toolSuggestReply: boolean
  toolSearchIncidents: boolean
  toolSearchKb: boolean
}

const DEFAULT_SYSTEM_PROMPT = `You are a dedicated Incident Resolution Co-Agent embedded in ServiceNow. You are assisting the ASSIGNED AGENT working to resolve this ticket — not the end user / caller. Act as a knowledgeable co-worker who has already read all the details.

CURRENT INCIDENT:
{{incident_fields}}
{{enriched_context}}

{{field_value_reference}}

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

const DEFAULT_GREETING_TEMPLATE = `I've loaded {{number}} — "{{short_description}}". {{priority}}, {{state}}. {{sla_summary}} {{attachment_summary}} What would you like to tackle first?`

const DEFAULTS: Config = {
  llmModel: 'llama-3.3-70b-versatile',
  llmTemperature: 0.4,
  llmMaxTokens: 600,
  sttModel: 'nova-3',
  sttLanguage: 'multi',
  ttsVoice: 'aura-asteria-en',
  agentName: 'AI Voice Agent',
  agentSubtitle: 'Incident Co-Agent • Powered by AI',
  systemPrompt: null,
  greetingTemplate: null,
  toolUpdateField: true,
  toolSuggestResolution: true,
  toolSuggestReply: true,
  toolSearchIncidents: true,
  toolSearchKb: true,
}

// ── Option lists ─────────────────────────────────────────────────────────────

const LLM_MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (default)' },
  { value: 'llama3-70b-8192',         label: 'Llama 3 70B' },
  { value: 'llama3-8b-8192',          label: 'Llama 3 8B (faster)' },
  { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B' },
  { value: 'gemma2-9b-it',            label: 'Gemma 2 9B' },
  { value: 'gpt-4o-mini',             label: 'GPT-4o Mini (OpenAI)' },
  { value: 'gpt-4o',                  label: 'GPT-4o (OpenAI)' },
]

const STT_MODELS = [
  { value: 'nova-3', label: 'Nova 3 (default, best accuracy)' },
  { value: 'nova-2', label: 'Nova 2' },
  { value: 'enhanced', label: 'Enhanced' },
  { value: 'base',   label: 'Base (fastest)' },
]

const STT_LANGUAGES = [
  { value: 'multi',  label: 'Multi-language (auto-detect)' },
  { value: 'en',     label: 'English' },
  { value: 'es',     label: 'Spanish' },
  { value: 'fr',     label: 'French' },
  { value: 'de',     label: 'German' },
  { value: 'it',     label: 'Italian' },
  { value: 'pt',     label: 'Portuguese' },
  { value: 'ja',     label: 'Japanese' },
  { value: 'ko',     label: 'Korean' },
  { value: 'zh',     label: 'Chinese (Mandarin)' },
  { value: 'hi',     label: 'Hindi' },
]

const TTS_VOICES = [
  { value: 'aura-asteria-en',  label: 'Asteria — US English, Female (default)' },
  { value: 'aura-luna-en',     label: 'Luna — US English, Female' },
  { value: 'aura-stella-en',   label: 'Stella — US English, Female' },
  { value: 'aura-athena-en',   label: 'Athena — UK English, Female' },
  { value: 'aura-orion-en',    label: 'Orion — US English, Male' },
  { value: 'aura-orpheus-en',  label: 'Orpheus — US English, Male' },
  { value: 'aura-helios-en',   label: 'Helios — UK English, Male' },
  { value: 'aura-angus-en',    label: 'Angus — Scottish English, Male' },
]

const TOOLS = [
  { key: 'toolUpdateField'      as keyof Config, label: 'Update Incident Field',    description: 'Allow agent to request field updates (state, priority, etc.) with confirmation.' },
  { key: 'toolSuggestResolution' as keyof Config, label: 'Suggest Resolution Notes', description: 'Generate resolution/close notes text for the agent to review.' },
  { key: 'toolSuggestReply'     as keyof Config, label: 'Suggest Reply to Caller',  description: 'Draft customer-facing comment messages.' },
  { key: 'toolSearchIncidents'  as keyof Config, label: 'Search Similar Incidents', description: 'Query ServiceNow for resolved incidents with similar symptoms.' },
  { key: 'toolSearchKb'         as keyof Config, label: 'Search Knowledge Base',    description: 'Look up published KB articles for resolution steps.' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checked ? 'bg-primary' : 'bg-input'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{children}</p>
  )
}

function SelectField({
  id, value, onChange, options,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[13px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function IncidentAgentPage() {
  const { toast } = useToast()
  const [cfg, setCfg]     = useState<Config>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/incident-agent')
      .then(r => r.json())
      .then(d => { setCfg({ ...DEFAULTS, ...d }); setLoading(false) })
      .catch(() => { toast('Failed to load config', 'error'); setLoading(false) })
  }, [])

  function set<K extends keyof Config>(key: K, val: Config[K]) {
    setCfg(prev => ({ ...prev, [key]: val }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/incident-agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      if (res.ok) toast('Configuration saved', 'success')
      else        toast('Failed to save', 'error')
    } catch { toast('Network error', 'error') }
    setSaving(false)
  }

  function resetSection(keys: (keyof Config)[]) {
    const patch: Partial<Config> = {}
    for (const k of keys) (patch as any)[k] = DEFAULTS[k]
    setCfg(prev => ({ ...prev, ...patch }))
  }

  if (loading) return <div className="py-16 text-center text-muted-foreground text-[13px]">Loading…</div>

  return (
    <div>
      <PageHeader
        title="Incident AI Agent"
        description="Configure the voice AI agent that assists your team on ServiceNow incident forms."
        actions={
          <Button onClick={save} disabled={saving} size="sm" className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save all changes'}
          </Button>
        }
      />

      <div className="space-y-10 max-w-3xl">

        {/* ── Agent Identity ── */}
        <Section
          title="Agent Identity"
          description="Name and subtitle shown in the widget header."
          actions={
            <button type="button" onClick={() => resetSection(['agentName', 'agentSubtitle'])} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          }
        >
          <Card><CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="agentName">Agent name</Label>
                <Input id="agentName" value={cfg.agentName} onChange={e => set('agentName', e.target.value)} placeholder="AI Voice Agent" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agentSubtitle">Subtitle</Label>
                <Input id="agentSubtitle" value={cfg.agentSubtitle} onChange={e => set('agentSubtitle', e.target.value)} placeholder="Incident Co-Agent • Powered by AI" />
              </div>
            </div>
          </CardContent></Card>
        </Section>

        {/* ── LLM Settings ── */}
        <Section
          title="Language Model (LLM)"
          description="Controls which model processes conversations and generates responses."
          actions={
            <button type="button" onClick={() => resetSection(['llmModel', 'llmTemperature', 'llmMaxTokens'])} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          }
        >
          <Card><CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="llmModel">Model</Label>
              <SelectField id="llmModel" value={cfg.llmModel} onChange={v => set('llmModel', v)} options={LLM_MODELS} />
              <Hint>Uses GROQ_API_KEY for Groq-hosted models, OPENAI_API_KEY for GPT models.</Hint>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="llmTemp">Temperature <span className="text-muted-foreground font-normal">({cfg.llmTemperature})</span></Label>
                <input
                  id="llmTemp" type="range" min="0" max="1" step="0.05"
                  value={cfg.llmTemperature}
                  onChange={e => set('llmTemperature', parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0 — focused</span><span>1 — creative</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="llmTokens">Max response tokens</Label>
                <Input id="llmTokens" type="number" min={100} max={4096} step={50}
                  value={cfg.llmMaxTokens}
                  onChange={e => set('llmMaxTokens', parseInt(e.target.value) || 600)}
                />
                <Hint>Higher = longer answers, more latency. 400–800 is good for voice.</Hint>
              </div>
            </div>
          </CardContent></Card>
        </Section>

        {/* ── STT Settings ── */}
        <Section
          title="Speech-to-Text (STT)"
          description="Deepgram model and language for transcribing the agent's voice."
          actions={
            <button type="button" onClick={() => resetSection(['sttModel', 'sttLanguage'])} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          }
        >
          <Card><CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sttModel">Model</Label>
                <SelectField id="sttModel" value={cfg.sttModel} onChange={v => set('sttModel', v)} options={STT_MODELS} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sttLang">Language</Label>
                <SelectField id="sttLang" value={cfg.sttLanguage} onChange={v => set('sttLanguage', v)} options={STT_LANGUAGES} />
                <Hint>"Multi-language" detects the speaker's language automatically.</Hint>
              </div>
            </div>
          </CardContent></Card>
        </Section>

        {/* ── TTS Settings ── */}
        <Section
          title="Text-to-Speech (TTS)"
          description="Deepgram Aura voice used when the AI agent speaks."
          actions={
            <button type="button" onClick={() => resetSection(['ttsVoice'])} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          }
        >
          <Card><CardContent className="p-5">
            <div className="space-y-1.5">
              <Label htmlFor="ttsVoice">Voice</Label>
              <SelectField id="ttsVoice" value={cfg.ttsVoice} onChange={v => set('ttsVoice', v)} options={TTS_VOICES} />
            </div>
          </CardContent></Card>
        </Section>

        {/* ── Tools ── */}
        <Section
          title="Agent Tools"
          description="Enable or disable each capability. Disabled tools are hidden from the LLM entirely."
          actions={
            <button type="button" onClick={() => resetSection(TOOLS.map(t => t.key))} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          }
        >
          <Card><CardContent className="p-5 divide-y divide-border">
            {TOOLS.map(tool => (
              <div key={tool.key} className="flex items-start justify-between py-3 first:pt-0 last:pb-0 gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{tool.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tool.description}</p>
                </div>
                <Toggle checked={cfg[tool.key] as boolean} onChange={v => set(tool.key, v as any)} />
              </div>
            ))}
          </CardContent></Card>
        </Section>

        {/* ── System Prompt ── */}
        <Section
          title="System Prompt"
          description="The core instructions given to the LLM at the start of every session."
          actions={
            <div className="flex items-center gap-2">
              {cfg.systemPrompt !== null && (
                <button type="button" onClick={() => set('systemPrompt', null)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reset to default
                </button>
              )}
              {cfg.systemPrompt === null && (
                <button type="button" onClick={() => set('systemPrompt', DEFAULT_SYSTEM_PROMPT)} className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
                  Load default to edit
                </button>
              )}
            </div>
          }
        >
          <Card><CardContent className="p-5 space-y-3">
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2.5 flex gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Use <code className="text-[10px] bg-muted px-1 rounded">{'{{incident_fields}}'}</code> to insert the current incident data,{' '}
                <code className="text-[10px] bg-muted px-1 rounded">{'{{enriched_context}}'}</code> for SLAs / attachments / journal entries,
                and <code className="text-[10px] bg-muted px-1 rounded">{'{{field_value_reference}}'}</code> for the state/priority value table.
                The field value reference is always appended automatically.
              </p>
            </div>
            <textarea
              rows={18}
              value={cfg.systemPrompt ?? DEFAULT_SYSTEM_PROMPT}
              onChange={e => set('systemPrompt', e.target.value === DEFAULT_SYSTEM_PROMPT ? null : (e.target.value || null))}
              className={`w-full rounded-md border border-input bg-background px-3 py-2 text-[12px] font-mono shadow-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${cfg.systemPrompt === null ? 'text-muted-foreground' : ''}`}
            />
            {cfg.systemPrompt === null
              ? <p className="text-[11px] text-emerald-600">Using built-in default — click &quot;Load default to edit&quot; to customise it.</p>
              : <p className="text-[11px] text-amber-600">Custom prompt active — click &quot;Reset to default&quot; to revert.</p>
            }
          </CardContent></Card>
        </Section>

        {/* ── Greeting Template ── */}
        <Section
          title="Greeting Message"
          description="What the agent says when it first connects."
          actions={
            <div className="flex items-center gap-2">
              {cfg.greetingTemplate !== null && (
                <button type="button" onClick={() => set('greetingTemplate', null)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reset to default
                </button>
              )}
              {cfg.greetingTemplate === null && (
                <button type="button" onClick={() => set('greetingTemplate', DEFAULT_GREETING_TEMPLATE)} className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
                  Load default to edit
                </button>
              )}
            </div>
          }
        >
          <Card><CardContent className="p-5 space-y-3">
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2.5 flex gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Available placeholders:{' '}
                <code className="text-[10px] bg-muted px-1 rounded">{'{{number}}'}</code>{' '}
                <code className="text-[10px] bg-muted px-1 rounded">{'{{short_description}}'}</code>{' '}
                <code className="text-[10px] bg-muted px-1 rounded">{'{{priority}}'}</code>{' '}
                <code className="text-[10px] bg-muted px-1 rounded">{'{{state}}'}</code>{' '}
                <code className="text-[10px] bg-muted px-1 rounded">{'{{sla_summary}}'}</code>{' '}
                <code className="text-[10px] bg-muted px-1 rounded">{'{{attachment_summary}}'}</code>
              </p>
            </div>
            <textarea
              rows={4}
              value={cfg.greetingTemplate ?? DEFAULT_GREETING_TEMPLATE}
              onChange={e => set('greetingTemplate', e.target.value === DEFAULT_GREETING_TEMPLATE ? null : (e.target.value || null))}
              className={`w-full rounded-md border border-input bg-background px-3 py-2 text-[12px] font-mono shadow-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${cfg.greetingTemplate === null ? 'text-muted-foreground' : ''}`}
            />
            {cfg.greetingTemplate === null
              ? <p className="text-[11px] text-emerald-600">Using built-in default — click &quot;Load default to edit&quot; to customise it.</p>
              : <p className="text-[11px] text-amber-600">Custom greeting active — click &quot;Reset to default&quot; to revert.</p>
            }
          </CardContent></Card>
        </Section>

        {/* Save footer */}
        <div className="flex justify-end pb-8">
          <Button onClick={save} disabled={saving} className="gap-1.5">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save all changes'}
          </Button>
        </div>

      </div>
    </div>
  )
}
