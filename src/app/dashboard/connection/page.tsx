'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { CheckCircle2, XCircle, Loader2, Copy, Check, Plus, Server, Trash2, RefreshCw, Phone, Bot, Link2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'

interface TestResult { step: string; status: 'pass' | 'fail'; detail: string }

interface Instance {
  id: string
  name: string
  snInstanceUrl: string
  snUsername: string
  hasPassword: boolean
  active: boolean
  agentCount: number
  token: string | null
  widgetColor: string
  widgetPosition: string
  widgetVoiceOnly: boolean
  widgetAutoOpen: boolean
  widgetGreeting: string
  widgetAgentName: string
  widgetShowBranding: boolean
  widgetLogoUrl: string
  widgetBorderRadius: string
  createdAt: string
}

interface PhoneNumber {
  id: string
  e164: string
  friendly: string | null
  active: boolean
  createdAt: string
  instance: { id: string; name: string; snInstanceUrl: string | null } | null
  agent: { id: string; name: string } | null
}

export default function ConnectionPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [instances, setInstances] = useState<Instance[]>([])
  const [maxInstances, setMaxInstances] = useState(1)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [copied, setCopied] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [savingWidget, setSavingWidget] = useState<string | null>(null)
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({ name: '', snInstanceUrl: '', snUsername: '', snPassword: '' })
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [phonePlanEligible, setPhonePlanEligible] = useState(false)

  useEffect(() => {
    fetch('/api/instances').then(r => r.json()).then(data => {
      setInstances(data.instances || [])
      setMaxInstances(data.maxInstances || 1)
      setLoading(false)
    }).catch(() => setLoading(false))

    fetch('/api/phone-numbers').then(r => r.json()).then(data => {
      setPhoneNumbers(data.phoneNumbers || [])
      setPhonePlanEligible(!!data.planEligible)
    }).catch(() => {})
  }, [])

  function copyValue(value: string) {
    navigator.clipboard.writeText(value)
    setCopied(value)
    setTimeout(() => setCopied(''), 2000)
  }

  function formatPhone(e164: string) {
    // +14155550123 → +1 (415) 555-0123 for US/Canada; everything else stays as-is.
    const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
    return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createForm.snInstanceUrl || !createForm.snUsername || !createForm.snPassword) {
      toast('All connection fields are required', 'error')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })
      const data = await res.json()
      if (res.ok) {
        toast('Instance added', 'success')
        setShowCreate(false)
        setCreateForm({ name: '', snInstanceUrl: '', snUsername: '', snPassword: '' })
        // Reload
        const r = await fetch('/api/instances').then(r => r.json())
        setInstances(r.instances || [])
      } else {
        toast(data.error || 'Failed to create instance', 'error')
      }
    } catch { toast('Network error', 'error') }
    setCreating(false)
  }

  async function handleTest(instanceId: string) {
    setTesting(instanceId)
    setTestResults([])
    try {
      const res = await fetch('/api/tenants/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId }),
      })
      const data = await res.json()
      setTestResults(data.results || [])
    } catch {
      setTestResults([{ step: 'Request', status: 'fail', detail: 'API error' }])
    }
    setTesting(null)
  }

  async function handleDelete(instanceId: string) {
    const ok = await confirm({
      title: 'Delete instance?',
      description: 'Its agents and embed token will be unlinked. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeleting(instanceId)
    try {
      const res = await fetch(`/api/instances/${instanceId}`, { method: 'DELETE' })
      if (res.ok) {
        toast('Instance deleted', 'success')
        setInstances(prev => prev.filter(i => i.id !== instanceId))
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to delete', 'error')
      }
    } catch { toast('Network error', 'error') }
    setDeleting(null)
  }

  function updateWidget(instanceId: string, field: string, value: any) {
    setInstances(prev => prev.map(i => i.id === instanceId ? { ...i, [field]: value } : i))
  }

  async function handleSaveWidget(instanceId: string) {
    setSavingWidget(instanceId)
    const inst = instances.find(i => i.id === instanceId)
    if (!inst) return
    try {
      const res = await fetch(`/api/instances/${instanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetColor: inst.widgetColor,
          widgetPosition: inst.widgetPosition,
          widgetVoiceOnly: inst.widgetVoiceOnly,
          widgetAutoOpen: inst.widgetAutoOpen,
          widgetGreeting: inst.widgetGreeting,
          widgetAgentName: inst.widgetAgentName,
          widgetShowBranding: inst.widgetShowBranding,
          widgetLogoUrl: inst.widgetLogoUrl,
          widgetBorderRadius: inst.widgetBorderRadius,
        }),
      })
      if (res.ok) toast('Widget saved', 'success')
      else toast('Failed to save', 'error')
    } catch { toast('Network error', 'error') }
    setSavingWidget(null)
  }

  async function handleSync(instanceId: string) {
    setSyncing(instanceId)
    try {
      const res = await fetch(`/api/instances/${instanceId}/sync`, { method: 'POST' })
      const data = await res.json()
      if (data.error && !data.synced) {
        toast(data.error, 'error')
      } else {
        toast(data.message || `Synced ${data.synced} agent(s)`, 'success')
        // Reload instances to update agent count
        const r = await fetch('/api/instances').then(r => r.json())
        setInstances(r.instances || [])
      }
    } catch { toast('Network error', 'error') }
    setSyncing(null)
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(token)
    setCopied(token)
    setTimeout(() => setCopied(''), 2000)
  }

  const atLimit = maxInstances !== -1 && instances.length >= maxInstances

  if (loading) return <p className="text-[13px] text-muted-foreground">Loading...</p>

  return (
    <div>
      <PageHeader
        title="Instances"
        description="Connect one or more ServiceNow instances. Each instance gets its own embed widget and agents."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={!!atLimit}>
            <Plus className="w-3.5 h-3.5" />
            Add instance
          </Button>
        }
      />

      {/* Plan badge */}
      <div className="mb-6 inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-card text-[11px] text-muted-foreground">
        <Server className="w-3 h-3" />
        {maxInstances === -1 ? `${instances.length} instances · Unlimited` : `${instances.length} of ${maxInstances} instances`}
      </div>

      {/* Phone numbers — only on phone-eligible plans (Premium / legacy PRO_VOICE / ENTERPRISE) */}
      {phonePlanEligible && (
        <div className="mb-8">
          <Section
            title="Inbound phone numbers"
            count={phoneNumbers.length || undefined}
            description="Numbers provisioned for your tenant. Calls hit your bound agent — same logic as the widget."
            actions={
              <a
                href="mailto:support@zevox.com?subject=Provision%20a%20new%20phone%20number"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Request another number
              </a>
            }
          >
            {phoneNumbers.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg border border-indigo-400/30 bg-indigo-400/[0.08] flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-indigo-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground mb-0.5">No number assigned yet</p>
                      <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                        Your plan includes a dedicated inbound phone number. Email{' '}
                        <a href="mailto:support@zevox.com" className="text-primary hover:underline">support@zevox.com</a>{' '}
                        with the agent you'd like calls routed to and we'll provision one in 1 business day.
                      </p>
                    </div>
                    <a
                      href="mailto:support@zevox.com?subject=Provision%20my%20phone%20number"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-[12px] font-medium hover:bg-foreground/90 transition-colors shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      Request now
                    </a>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {phoneNumbers.map((p) => (
                      <div key={p.id} className="flex items-start justify-between gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Phone className="w-4 h-4 text-primary shrink-0" />
                            <span className="font-mono text-[14px] font-semibold text-foreground tabular-nums">
                              {formatPhone(p.e164)}
                            </span>
                            {p.friendly && (
                              <span className="text-[12.5px] text-muted-foreground">· {p.friendly}</span>
                            )}
                            {p.active ? (
                              <Badge variant="success" dot>Active</Badge>
                            ) : (
                              <Badge variant="secondary" dot>Inactive</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <Bot className="w-3 h-3" />
                              {p.agent?.name || '(orchestrator picks)'}
                            </span>
                            {p.instance && (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Link2 className="w-3 h-3" />
                                {p.instance.snInstanceUrl?.replace('https://', '').replace('.service-now.com', '') || p.instance.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyValue(p.e164)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0"
                          aria-label="Copy number"
                          title="Copy E.164 number"
                        >
                          {copied === p.e164 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <p className="text-[11px] text-muted-foreground/70 mt-2">
              Restrict who can reach these numbers via the{' '}
              <a href="/dashboard/phone-allowlist" className="text-foreground hover:text-primary transition-colors underline decoration-border underline-offset-2">
                Phone Allowlist
              </a>
              .
            </p>
          </Section>
        </div>
      )}

      {/* Create instance form */}
      {showCreate && (
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-5">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Instance name</Label>
                <Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Production, Dev" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Instance URL</Label>
                <Input value={createForm.snInstanceUrl} onChange={e => setCreateForm(f => ({ ...f, snInstanceUrl: e.target.value }))} placeholder="https://yourinstance.service-now.com" type="url" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input value={createForm.snUsername} onChange={e => setCreateForm(f => ({ ...f, snUsername: e.target.value }))} placeholder="admin" />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input value={createForm.snPassword} onChange={e => setCreateForm(f => ({ ...f, snPassword: e.target.value }))} type="password" placeholder="••••••••" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={creating}>{creating ? 'Adding...' : 'Add instance'}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Instance cards */}
      {instances.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Server className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-[13px] font-medium text-foreground">No instances connected</p>
            <p className="text-[12px] text-muted-foreground mt-1">Add your ServiceNow instance to get started.</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add your first instance
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {instances.map(inst => (
            <Card key={inst.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-[14px] font-semibold text-foreground">{inst.name}</h3>
                    <p className="text-[12px] text-muted-foreground font-mono">{inst.snInstanceUrl.replace('https://', '')}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{inst.agentCount} agent{inst.agentCount !== 1 ? 's' : ''} · {inst.snUsername}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleSync(inst.id)} disabled={syncing === inst.id}>
                      {syncing === inst.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RefreshCw className="w-3 h-3" /> Sync</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleTest(inst.id)} disabled={testing === inst.id}>
                      {testing === inst.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(inst.id)}
                      disabled={deleting === inst.id}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {deleting === inst.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>

                {/* Embed token + snippet */}
                {inst.token && (
                  <div className="mb-4">
                    <Label className="text-[11px]">Embed snippet</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <pre className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-[11px] text-foreground/80 font-mono overflow-x-auto whitespace-pre-wrap break-all">
{`<script>window.ZEVOX_TOKEN = "${inst.token}";</script>
<script src="${APP_URL}/widget.js"></script>`}
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => copyToken(`<script>window.ZEVOX_TOKEN = "${inst.token}";</script>\n<script src="${APP_URL}/widget.js"></script>`)}
                      >
                        {copied.includes(inst.token || '') ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Voice Transcribe snippet — for SN incident form UI Page */}
                {inst.token && (
                  <div className="mb-4">
                    <Label className="text-[11px]">Voice Transcribe snippet <span className="text-muted-foreground font-normal">(paste into SN UI Page HTML field)</span></Label>
                    <div className="flex items-start gap-2 mt-1">
                      <pre className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-[11px] text-foreground/80 font-mono overflow-x-auto whitespace-pre-wrap break-all">
{`<div id="va-root"></div>
<script>
(function(){
  window.VA_TOKEN="${inst.token}";
  window.VA_GATEWAY="${APP_URL}";
  var s=document.createElement('script');
  s.src=window.VA_GATEWAY+'/voice-transcribe-widget.js';
  document.head.appendChild(s);
})();
</script>`}
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 mt-0.5"
                        onClick={() => copyToken(`<div id="va-root"></div>\n<script>\n(function(){\n  window.VA_TOKEN="${inst.token}";\n  window.VA_GATEWAY="${APP_URL}";\n  var s=document.createElement('script');\n  s.src=window.VA_GATEWAY+'/voice-transcribe-widget.js';\n  document.head.appendChild(s);\n})();\n</script>`)}
                      >
                        {copied.startsWith('<div id="va-root">') ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      In SN: open UI Page <code>x_ztpas_ai_voice_a_voice_transcribe</code> &rarr; paste into the <strong>HTML</strong> field &rarr; Update
                    </p>
                  </div>
                )}

                {/* SaaS API key for SN sync */}
                {inst.token && (
                  <div className="mb-4">
                    <Label className="text-[11px]">SaaS API key (for SN auto-sync)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input readOnly value={inst.token} className="font-mono text-[11px]" onClick={e => (e.target as HTMLInputElement).select()} />
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => copyToken(inst.token!)}>
                        {copied === inst.token ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      Paste into SN &rarr; <code>x_ztpas_ai_voice_a.saas.api_key</code>
                    </p>
                  </div>
                )}

                {/* Test results */}
                {testResults.length > 0 && testing === null && (
                  <div className="rounded-lg border border-border bg-background overflow-hidden mb-4">
                    {testResults.map((r, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2 border-b border-border last:border-b-0">
                        {r.status === 'pass' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-foreground">{r.step}</p>
                          <p className="text-[10px] text-muted-foreground break-all">{r.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Widget customization toggle */}
                <div className="border-t border-border pt-4">
                  <button
                    onClick={() => setExpandedWidget(expandedWidget === inst.id ? null : inst.id)}
                    className="text-[12px] text-primary hover:text-primary/80 transition-colors"
                  >
                    {expandedWidget === inst.id ? 'Hide widget settings' : 'Widget customization'}
                  </button>

                  {expandedWidget === inst.id && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Brand color</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={inst.widgetColor}
                              onChange={e => updateWidget(inst.id, 'widgetColor', e.target.value)}
                              className="w-8 h-8 rounded border border-border cursor-pointer"
                            />
                            <Input
                              value={inst.widgetColor}
                              onChange={e => updateWidget(inst.id, 'widgetColor', e.target.value)}
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
                                variant={inst.widgetPosition === pos ? 'default' : 'outline'}
                                onClick={() => updateWidget(inst.id, 'widgetPosition', pos)}
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
                          <Label className="text-[11px]">Agent display name</Label>
                          <Input
                            value={inst.widgetAgentName}
                            onChange={e => updateWidget(inst.id, 'widgetAgentName', e.target.value)}
                            placeholder="e.g. Nova"
                            className="text-[12px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Greeting text</Label>
                          <Input
                            value={inst.widgetGreeting}
                            onChange={e => updateWidget(inst.id, 'widgetGreeting', e.target.value)}
                            placeholder="Hi! How can I help?"
                            className="text-[12px]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Logo URL</Label>
                          <Input
                            value={inst.widgetLogoUrl}
                            onChange={e => updateWidget(inst.id, 'widgetLogoUrl', e.target.value)}
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
                                variant={inst.widgetBorderRadius === r ? 'default' : 'outline'}
                                onClick={() => updateWidget(inst.id, 'widgetBorderRadius', r)}
                                className="flex-1 capitalize text-[10px]"
                              >
                                {r}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-6">
                        <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                          <input type="checkbox" checked={inst.widgetVoiceOnly} onChange={e => updateWidget(inst.id, 'widgetVoiceOnly', e.target.checked)} className="accent-primary" />
                          Voice only
                        </label>
                        <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                          <input type="checkbox" checked={inst.widgetAutoOpen} onChange={e => updateWidget(inst.id, 'widgetAutoOpen', e.target.checked)} className="accent-primary" />
                          Auto open
                        </label>
                        <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                          <input type="checkbox" checked={inst.widgetShowBranding} onChange={e => updateWidget(inst.id, 'widgetShowBranding', e.target.checked)} className="accent-primary" />
                          Show branding
                        </label>
                      </div>

                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => handleSaveWidget(inst.id)} disabled={savingWidget === inst.id}>
                          {savingWidget === inst.id ? 'Saving...' : 'Save widget'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Setup guide */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <h3 className="text-[13px] font-semibold text-foreground mb-3">Setup guide</h3>
          <ol className="space-y-1.5 text-[11px] text-muted-foreground">
            <li>1. Install the ZeVox app on your ServiceNow instance</li>
            <li>2. Create Voice Agent(s) with LLM config in ServiceNow</li>
            <li>3. Add the instance here (URL + credentials)</li>
            <li>4. Copy the SaaS API key into SN system property <code>x_ztpas_ai_voice_a.saas.api_key</code></li>
            <li>5. Set <code>x_ztpas_ai_voice_a.saas.api_url</code> to <code>{APP_URL}</code></li>
            <li>6. Agents auto-sync. Embed the widget snippet on your portal.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
