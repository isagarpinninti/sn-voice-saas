'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { AgentConnectorsSection } from '@/components/dashboard/agent-connectors-section'
import { Textarea } from '@/components/ui/textarea'
import { VOICES } from '@/lib/voices'
import { KOKORO_VOICES } from '@/lib/kokoro-voices'
import { ArrowLeft, Trash2, AlertTriangle, X, Volume2, Loader2, Copy, Check, Send, Bot, Phone, ExternalLink } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.up.railway.app'

interface AgentConfig {
  id: string
  name: string
  snAgentId: string | null
  active: boolean
  token: string | null
  systemPrompt: string | null
  llmModel: string | null
  voiceId: string | null
}

interface WidgetConfig {
  widgetMode: string
  widgetColor: string
  widgetPosition: string
  widgetAutoOpen: boolean
  widgetGreeting: string
  widgetTitle: string
  widgetShowBranding: boolean
  widgetLogoUrl: string
  widgetBorderRadius: string
  widgetLauncherLabel: string
  widgetLauncherDark: boolean
  widgetWorkspaceTables: string
}

interface ChatMsg { role: 'user' | 'agent'; text: string }

const DEFAULT_WIDGET: WidgetConfig = {
  widgetMode: 'voice_only',
  widgetColor: '#10b981',
  widgetPosition: 'right',
  widgetAutoOpen: false,
  widgetGreeting: '',
  widgetTitle: '',
  widgetShowBranding: true,
  widgetLogoUrl: '',
  widgetBorderRadius: 'full',
  widgetLauncherLabel: 'Start a call',
  widgetLauncherDark: true,
  widgetWorkspaceTables: '',
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()

  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [copied, setCopied] = useState('')

  // Voice state
  const [currentVoice, setCurrentVoice] = useState('aura-asteria-en')
  const [savingVoice, setSavingVoice] = useState(false)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Widget state
  const [widget, setWidget] = useState<WidgetConfig>(DEFAULT_WIDGET)
  const [savingWidget, setSavingWidget] = useState(false)

  // Phone numbers assigned to this agent
  const [phoneNumbers, setPhoneNumbers] = useState<{ id: string; e164: string; friendly: string | null; provider: string; active: boolean }[]>([])

  // Test agent state
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSessionId, setChatSessionId] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/agents/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { toast(d.error, 'error'); router.push('/dashboard/agents'); return }
        setAgent(d)
      })
      .catch(() => toast('Failed to load agent', 'error'))
      .finally(() => setLoading(false))

    fetch(`/api/agents/${id}/voice`)
      .then(r => r.json())
      .then(d => { if (d.voice) setCurrentVoice(d.voice) })
      .catch(() => {})

    fetch(`/api/agents/${id}/widget`)
      .then(r => r.json())
      .then(d => { if (!d.error) setWidget({ ...DEFAULT_WIDGET, ...d }) })
      .catch(() => {})

    fetch('/api/phone-numbers', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const all = d.phoneNumbers || []
        setPhoneNumbers(all.filter((p: any) => p.agent?.id === id))
      })
      .catch(() => {})
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (audioRef.current) audioRef.current.pause() }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMsgs])

  function update<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setAgent((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function updateWidget(field: keyof WidgetConfig, value: any) {
    setWidget(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!agent) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agent.name,
          active: agent.active,
          systemPrompt: agent.systemPrompt ?? '',
          llmModel: agent.llmModel ?? '',
          voiceId: agent.voiceId ?? '',
        }),
      })
      if (res.ok) {
        const fresh = await fetch(`/api/agents/${id}`, { cache: 'no-store' }).then((r) => r.json())
        if (!fresh.error) setAgent(fresh)
        toast('Agent saved', 'success')
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to save', 'error')
      }
    } catch { toast('Network error', 'error') }
    setSaving(false)
  }

  async function handleSaveWidget() {
    setSavingWidget(true)
    try {
      const res = await fetch(`/api/agents/${id}/widget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(widget),
      })
      if (res.ok) toast('Widget settings saved', 'success')
      else toast('Failed to save widget settings', 'error')
    } catch { toast('Network error', 'error') }
    setSavingWidget(false)
  }

  async function handleSelectVoice(voiceId: string) {
    setCurrentVoice(voiceId)
    setSavingVoice(true)
    try {
      const res = await fetch(`/api/agents/${id}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceId }),
      })
      const data = await res.json()
      if (res.ok) toast('Voice updated on ServiceNow', 'success')
      else toast(data.error || 'Failed to update voice', 'error')
    } catch { toast('Network error', 'error') }
    setSavingVoice(false)
  }

  async function handlePreview(voiceId: string, sampleText: string) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playingVoice === voiceId) { setPlayingVoice(null); return }
    setLoadingVoice(voiceId)
    try {
      const res = await fetch(`${APP_URL}/api/voice/preview?voice=${voiceId}&text=${encodeURIComponent(sampleText)}`)
      if (!res.ok) { setLoadingVoice(null); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url) }
      audio.oncanplay = () => { setLoadingVoice(null); setPlayingVoice(voiceId); audio.play() }
      audio.onerror = () => { setLoadingVoice(null); setPlayingVoice(null) }
    } catch { setLoadingVoice(null) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
      if (res.ok) { toast('Agent deleted', 'success'); router.push('/dashboard/agents') }
      else toast('Failed to delete agent', 'error')
    } catch { toast('Network error', 'error') }
    setDeleting(false)
  }

  async function handleChatSend() {
    if (!chatInput.trim() || chatBusy || !agent?.token) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatMsgs(prev => [...prev, { role: 'user', text: msg }])
    setChatBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: agent.token, agent: agent.id, message: msg, session_id: chatSessionId || undefined }),
      })
      const d = await res.json()
      setChatSessionId(d.session_id || chatSessionId)
      if (d.message) setChatMsgs(prev => [...prev, { role: 'agent', text: d.message }])
      else if (d.error) setChatMsgs(prev => [...prev, { role: 'agent', text: `Error: ${d.error}` }])
    } catch {
      setChatMsgs(prev => [...prev, { role: 'agent', text: 'Connection error. Please try again.' }])
    }
    setChatBusy(false)
  }

  function copySnippet() {
    if (!agent) return
    const snippet = `<script>\nwindow.ZEVOX_TOKEN="${agent.token}";\nwindow.ZEVOX_AGENT="${agent.id}";\n</script>\n<script src="${APP_URL}/widget.js"></script>`
    navigator.clipboard.writeText(snippet)
    setCopied('snippet')
    setTimeout(() => setCopied(''), 2000)
  }

  if (loading || !agent) {
    return <p className="text-[13px] text-muted-foreground">Loading agent...</p>
  }

  const snippet = `<script>\nwindow.ZEVOX_TOKEN="${agent.token}";\nwindow.ZEVOX_AGENT="${agent.id}";\n</script>\n<script src="${APP_URL}/widget.js"></script>`

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/agents" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3 h-3" />
          All Agents
        </Link>
      </div>

      <PageHeader
        title={agent.name}
        description="Agent settings. Optionally linked to a ServiceNow Voice Agent record."
        actions={
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        }
      />

      <div className="max-w-3xl space-y-10">

        {/* Identity */}
        <Section title="Identity" description="Name and ServiceNow link for this agent.">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={agent.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. IT Support Bot"
                />
                <p className="text-[10px] text-muted-foreground/70">For your reference only.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sn-id">ServiceNow Voice Agent sys_id (optional)</Label>
                <Input
                  id="sn-id"
                  value={agent.snAgentId || ''}
                  readOnly
                  placeholder="Not linked — this agent isn't backed by a ServiceNow Voice Agent record"
                  className="font-mono text-[12px] bg-muted/50 cursor-not-allowed"
                />
                <p className="text-[10px] text-muted-foreground/70">Read-only — synced from ServiceNow, if connected. Agents built purely on connectors don&apos;t need this.</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="active" className="cursor-pointer">Active</Label>
                <input
                  id="active"
                  type="checkbox"
                  checked={agent.active}
                  onChange={(e) => update('active', e.target.checked)}
                  className="accent-primary"
                />
                <p className="text-[10px] text-muted-foreground/70">Inactive agents are excluded from the orchestrator.</p>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Personality & voice — self-hosted engine, no ServiceNow required */}
        <Section title="Personality & voice" description="How this agent talks, on the widget (WebRTC) and phone paths. Works independently of ServiceNow.">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="agent-prompt">Instructions</Label>
                <Textarea
                  id="agent-prompt"
                  value={agent.systemPrompt || ''}
                  onChange={(e) => update('systemPrompt', e.target.value)}
                  placeholder="You are a helpful voice assistant. Your responses will be spoken aloud, so avoid emojis, bullet points, or any formatting that can't be spoken. Keep responses brief and conversational."
                  rows={6}
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Personality, tone, and guardrails for this agent. Leave blank to use ZeVox&apos;s default prompt.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-llm">LLM model</Label>
                <Input
                  id="agent-llm"
                  value={agent.llmModel || ''}
                  onChange={(e) => update('llmModel', e.target.value)}
                  placeholder="e.g. groq/llama-3.3-70b-versatile"
                  className="font-mono text-[12px]"
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Must match a model configured on your voice-engine&apos;s LiteLLM proxy. Leave blank for the tenant default.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Voice</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KOKORO_VOICES.map((v) => {
                    const isSelected = (agent.voiceId || 'af_heart') === v.id
                    return (
                      <div
                        key={v.id}
                        onClick={() => update('voiceId', v.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); update('voiceId', v.id) } }}
                        role="radio"
                        aria-checked={isSelected}
                        tabIndex={0}
                        className={`cursor-pointer text-left p-2.5 rounded-lg border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isSelected
                            ? 'border-primary/60 bg-primary/[0.04] ring-1 ring-primary/30'
                            : 'border-border bg-card hover:border-border/80'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[12.5px] font-semibold text-foreground">{v.name}</span>
                          {isSelected && (
                            <svg className="w-3 h-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ml-auto ${v.gender === 'female' ? 'bg-pink-500/10 text-pink-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {v.gender === 'female' ? 'F' : 'M'}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60">{v.accent}</span>
                        </div>
                        <p className="text-[10.5px] text-muted-foreground leading-snug">{v.description}</p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  Kokoro voice for the self-hosted STT/TTS pipeline — separate from the ServiceNow widget voice below.
                </p>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Embed Snippet */}
        <Section title="Widget embed snippet" description="Paste this into your portal page. ZEVOX_AGENT ensures this specific agent handles the conversation.">
          <Card>
            <CardContent className="p-5">
              {agent.token ? (
                <div>
                  <div className="flex items-start gap-2">
                    <pre className="flex-1 px-3 py-3 rounded-md bg-background border border-border text-[11px] text-foreground/80 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                      {snippet}
                    </pre>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 mt-0.5" onClick={copySnippet}>
                      {copied === 'snippet' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-2">
                    <code>ZEVOX_AGENT</code> = this agent&rsquo;s SaaS ID · <code>ZEVOX_TOKEN</code> = your instance API key
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">No API token — go to the Connection page to generate one.</p>
              )}
            </CardContent>
          </Card>
        </Section>

        {/* Widget Customization */}
        <Section title="Widget customization" description="Configure how the chat/voice widget looks and behaves for this agent.">
          <Card>
            <CardContent className="p-5 space-y-5">
              {/* Mode */}
              <div className="space-y-1.5">
                <Label className="text-[11px]">Mode</Label>
                <div className="flex gap-2">
                  {[
                    { value: 'voice_only', label: 'Voice only' },
                    { value: 'chat_only', label: 'Chat only' },
                    { value: 'both', label: 'Voice + Chat' },
                  ].map(m => (
                    <Button
                      key={m.value}
                      type="button"
                      size="sm"
                      variant={widget.widgetMode === m.value ? 'default' : 'outline'}
                      onClick={() => updateWidget('widgetMode', m.value)}
                      className="text-[11px]"
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Brand color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={widget.widgetColor}
                      onChange={e => updateWidget('widgetColor', e.target.value)}
                      className="w-8 h-8 rounded border border-border cursor-pointer"
                    />
                    <Input
                      value={widget.widgetColor}
                      onChange={e => updateWidget('widgetColor', e.target.value)}
                      className="font-mono text-[11px]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Position</Label>
                  <div className="flex gap-2">
                    {['left', 'right'].map(pos => (
                      <Button
                        key={pos}
                        type="button"
                        size="sm"
                        variant={widget.widgetPosition === pos ? 'default' : 'outline'}
                        onClick={() => updateWidget('widgetPosition', pos)}
                        className="flex-1 capitalize text-[11px]"
                      >
                        {pos}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Display title</Label>
                  <Input
                    value={widget.widgetTitle}
                    onChange={e => updateWidget('widgetTitle', e.target.value)}
                    placeholder="e.g. IT Support"
                    className="text-[12px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Greeting message</Label>
                  <Input
                    value={widget.widgetGreeting}
                    onChange={e => updateWidget('widgetGreeting', e.target.value)}
                    placeholder="Hi! How can I help you today?"
                    className="text-[12px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Logo URL</Label>
                  <Input
                    value={widget.widgetLogoUrl}
                    onChange={e => updateWidget('widgetLogoUrl', e.target.value)}
                    placeholder="https://..."
                    className="text-[12px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Border radius</Label>
                  <div className="flex gap-2">
                    {['full', 'lg', 'md', 'none'].map(r => (
                      <Button
                        key={r}
                        type="button"
                        size="sm"
                        variant={widget.widgetBorderRadius === r ? 'default' : 'outline'}
                        onClick={() => updateWidget('widgetBorderRadius', r)}
                        className="flex-1 capitalize text-[10px]"
                      >
                        {r}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Launcher button label</Label>
                  <Input
                    value={widget.widgetLauncherLabel}
                    onChange={e => updateWidget('widgetLauncherLabel', e.target.value)}
                    placeholder="Start a call"
                    className="text-[12px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Launcher theme</Label>
                  <div className="flex gap-2">
                    {[{label:'Dark',value:true},{label:'Light',value:false}].map(t => (
                      <Button
                        key={String(t.value)}
                        type="button"
                        size="sm"
                        variant={widget.widgetLauncherDark === t.value ? 'default' : 'outline'}
                        onClick={() => updateWidget('widgetLauncherDark', t.value)}
                        className="flex-1 text-[10px]"
                      >
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                  <input type="checkbox" checked={widget.widgetAutoOpen} onChange={e => updateWidget('widgetAutoOpen', e.target.checked)} className="accent-primary" />
                  Auto open on page load
                </label>
                <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                  <input type="checkbox" checked={widget.widgetShowBranding} onChange={e => updateWidget('widgetShowBranding', e.target.checked)} className="accent-primary" />
                  Show &ldquo;Powered by ZeVox&rdquo;
                </label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]">Workspace panel — show on tables</Label>
                <Input
                  value={widget.widgetWorkspaceTables}
                  onChange={e => updateWidget('widgetWorkspaceTables', e.target.value)}
                  placeholder="incident, change_request, sc_task (leave blank for all)"
                  className="text-[12px]"
                />
                <p className="text-[11px] text-muted-foreground">Comma-separated SN table names for the Agent Workspace sidebar panel. Download the Update Set from <Link href="/dashboard/downloads/sn-app" className="underline underline-offset-2 hover:text-foreground">ServiceNow App</Link>.</p>
              </div>

              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={handleSaveWidget} disabled={savingWidget}>
                  {savingWidget ? 'Saving...' : 'Save widget settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Phone Numbers */}
        <Section
          title="Phone numbers"
          description="Inbound calls to these numbers are routed to this agent."
        >
          {phoneNumbers.length === 0 ? (
            <Card>
              <CardContent className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-[12.5px] text-muted-foreground">No phone numbers assigned to this agent yet.</p>
                </div>
                <Link
                  href="/dashboard/phone-numbers"
                  className="shrink-0 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Manage numbers <ExternalLink className="w-3 h-3" />
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {phoneNumbers.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-7 h-7 rounded-md border border-primary/20 bg-primary/[0.06] flex items-center justify-center shrink-0">
                        <Phone className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold font-mono text-foreground">{p.e164}</p>
                        {p.friendly && <p className="text-[11px] text-muted-foreground">{p.friendly}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider border border-border rounded px-1.5 py-0.5">{p.provider}</span>
                        <span className={`text-[10px] font-medium ${p.active ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {p.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5 border-t border-border">
                  <Link
                    href="/dashboard/phone-numbers"
                    className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Manage all numbers <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </Section>

        {/* Voice Selection (legacy ServiceNow WS widget path only — needs a linked SN Voice Agent) */}
        {agent.snAgentId && (
        <Section title="Voice (ServiceNow widget)" description="For the legacy ServiceNow-connected widget path only. Saved directly to ServiceNow. Click to preview.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VOICES.map((v) => {
              const isSelected = currentVoice === v.id
              const isPlaying = playingVoice === v.id
              const isLoading = loadingVoice === v.id
              return (
                <div
                  key={v.id}
                  onClick={() => handleSelectVoice(v.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectVoice(v.id) } }}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  className={`cursor-pointer text-left p-3 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? 'border-primary/60 bg-primary/[0.04] ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{v.name}</span>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {savingVoice && isSelected && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(v.id, v.sampleText) }}
                      className={`p-1 rounded-md transition-colors ${isPlaying ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                      title="Preview voice"
                    >
                      {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${v.gender === 'female' ? 'bg-pink-500/10 text-pink-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {v.gender === 'female' ? 'F' : 'M'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">{v.accent}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{v.description}</p>
                </div>
              )
            })}
          </div>
        </Section>
        )}

        {/* Connectors */}
        <AgentConnectorsSection agentId={id} />

        {/* Test Agent */}
        <Section title="Test agent" description="Send a message and see how this agent responds via the chat API. Requires an active ServiceNow connection with a configured LLM.">
          <Card>
            <CardContent className="p-0">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <span className="text-[13px] font-medium text-foreground">{agent.name}</span>
                {chatSessionId && (
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                    session: {chatSessionId.slice(0, 8)}…
                  </span>
                )}
                {chatMsgs.length > 0 && (
                  <button
                    onClick={() => { setChatMsgs([]); setChatSessionId('') }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="h-64 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
                {chatMsgs.length === 0 && (
                  <p className="text-[12px] text-muted-foreground/60 text-center mt-8">
                    Send a message to test this agent&rsquo;s responses.
                  </p>
                )}
                {chatMsgs.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-xl text-[12.5px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatBusy && (
                  <div className="flex justify-start">
                    <div className="px-3 py-2 rounded-xl rounded-bl-sm bg-muted flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '120ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '240ms' }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border">
                {!agent.token ? (
                  <p className="text-[11px] text-muted-foreground flex-1">No API token — generate one on the Connection page first.</p>
                ) : (
                  <>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }}
                      placeholder="Type a message..."
                      disabled={chatBusy}
                      className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 outline-none border border-border rounded-lg px-3 py-2 focus:border-primary/50 transition-colors disabled:opacity-50"
                    />
                    <Button size="sm" onClick={handleChatSend} disabled={chatBusy || !chatInput.trim()}>
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Delete */}
        <Section title="Danger zone" description="Permanently remove this agent.">
          <Card className="border-destructive/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Delete agent</p>
                  <p className="text-[11px] text-muted-foreground">
                    This permanently removes the agent and its API tokens. The ServiceNow record is not affected.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="w-3 h-3" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>

      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">Delete &ldquo;{agent.name}&rdquo;?</h3>
                <p className="text-[12px] text-muted-foreground mt-1">
                  This will permanently delete the agent and its API tokens. The ServiceNow Voice Agent record will not be deleted.
                </p>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="text-muted-foreground hover:text-foreground ml-auto shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete agent'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
