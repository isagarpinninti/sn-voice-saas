'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Section } from '@/components/ui/section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { ArrowLeft, Copy, Check, ExternalLink, Loader2, CheckCircle2, XCircle, RefreshCw, Trash2, AlertTriangle, X } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'

interface MEAgent {
  id: string; name: string; active: boolean
  meUrl: string; apiKey: string
  oauthClientId: string; oauthClientSecret: string; oauthRefreshToken: string; oauthDomain: string
  llmProvider: string; llmApiKey: string; llmModel: string; llmBaseUrl: string
  ttsVoice: string; sttLanguage: string
  greeting: string; identity: string; instructions: string
  token: string | null
}

export default function MEAgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()

  const [agent, setAgent] = useState<MEAgent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string; latencyMs?: number } | null>(null)

  // Copy states
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedIframe, setCopiedIframe] = useState(false)
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  // Live API key editing (user must re-enter to change)
  const [newApiKey, setNewApiKey] = useState('')
  const [newLlmKey, setNewLlmKey] = useState('')

  // Widget test (iframe)
  const [showWidgetTest, setShowWidgetTest] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const formLoaded = useRef(false)

  useEffect(() => {
    fetch(`/api/me-agents/${id}`).then(r => r.json()).then(d => {
      if (d.error) { toast(d.error, 'error'); router.push('/dashboard/manage-engine'); return }
      setAgent(d)
    }).catch(() => toast('Failed to load', 'error')).finally(() => setLoading(false))
  }, [id])

  function upd<K extends keyof MEAgent>(k: K, v: MEAgent[K]) {
    setAgent(p => p ? { ...p, [k]: v } : p)
  }

  async function handleSave() {
    if (!agent) return
    setSaving(true)
    const body: any = { ...agent }
    if (newApiKey.trim()) body.apiKey = newApiKey.trim()
    if (newLlmKey.trim()) body.llmApiKey = newLlmKey.trim()
    try {
      const res = await fetch(`/api/me-agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { toast('Saved', 'success'); setNewApiKey(''); setNewLlmKey('') }
      else { const d = await res.json(); toast(d.error || 'Save failed', 'error') }
    } catch { toast('Network error', 'error') }
    setSaving(false)
  }

  async function handleGenerateToken() {
    setGeneratingToken(true)
    try {
      const res = await fetch(`/api/me-agents/${id}/token`, { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.token) { setAgent(p => p ? { ...p, token: d.token } : p); toast('Token generated', 'success') }
      else toast(d.error || 'Failed', 'error')
    } catch { toast('Network error', 'error') }
    setGeneratingToken(false)
  }

  async function handleTest() {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch(`/api/me-agents/${id}/test`, { method: 'POST' })
      setTestResult(await res.json())
    } catch { setTestResult({ success: false, error: 'Network error' }) }
    setTesting(false)
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/me-agents/${id}`, { method: 'DELETE' })
      if (res.ok) { toast('Agent deleted', 'success'); router.push('/dashboard/manage-engine') }
      else toast('Delete failed', 'error')
    } catch { toast('Network error', 'error') }
    setDeleting(false)
  }

  function copy(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => { setter(true); setTimeout(() => setter(false), 2000) })
  }

  function launchInPageTest() {
    if (!agent?.token) return
    setShowWidgetTest(true)
    setTimeout(() => {
      if (!formLoaded.current) {
        formLoaded.current = true
        ;(window as any).ZEVOX_TOKEN = agent.token
        ;(window as any).ZEVOX_MODE = 'form'
        const s = document.createElement('script')
        s.src = `${APP_URL}/widget.js`
        document.head.appendChild(s)
      }
      const iframe = iframeRef.current
      if (!iframe || !agent.token) return
      const safe = agent.token.replace(/[^a-zA-Z0-9_\-]/g, '')
      const safeUrl = APP_URL.replace(/['"<>]/g, '')
      const html = '<!DOCTYPE html><html><head><style>*{margin:0;padding:0}html,body{background:transparent;overflow:hidden}</style></head>' +
        `<body><script>window.ZEVOX_TOKEN="${safe}";window.ZEVOX_MODE="portal";<\/script><script src="${safeUrl}/widget.js"><\/script></body></html>`
      iframe.contentWindow?.document.open()
      iframe.contentWindow?.document.write(html)
      iframe.contentWindow?.document.close()
    }, 100)
  }

  if (loading || !agent) return <p className="text-[13px] text-muted-foreground">Loading agent…</p>

  const widgetUrl = agent.token ? `${APP_URL}/voice?token=${agent.token}` : null

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/manage-engine" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3 h-3" /> All ME Agents
        </Link>
      </div>

      <PageHeader
        title={agent.name}
        description="ManageEngine voice agent — self-contained, no ServiceNow required."
        actions={<Button onClick={handleSave} disabled={saving} size="sm">{saving ? 'Saving…' : 'Save changes'}</Button>}
      />

      <div className="max-w-3xl space-y-10">

        {/* ── Identity ── */}
        <Section title="Identity" description="Name and status of this agent.">
          <Card><CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={agent.name} onChange={e => upd('name', e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="cursor-pointer">Active</Label>
              <input type="checkbox" checked={agent.active} onChange={e => upd('active', e.target.checked)} className="accent-primary" />
            </div>
          </CardContent></Card>
        </Section>

        {/* ── ManageEngine Connection ── */}
        <Section title="ManageEngine Connection" description="ServiceDesk Plus instance URL and Technician API key. Click Test Connection to verify.">
          <Card><CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>ManageEngine URL</Label>
              <Input value={agent.meUrl} onChange={e => upd('meUrl', e.target.value)} placeholder="https://helpdesk.company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Technician API Key</Label>
              <Input
                type="password"
                value={newApiKey}
                onChange={e => setNewApiKey(e.target.value)}
                placeholder={agent.apiKey ? `Current: ${agent.apiKey} — enter new to replace` : 'Enter API key'}
              />
              <p className="text-[10px] text-muted-foreground/70">Leave blank to keep the current key. Found in ME Admin → API → Technician Key.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                Test Connection
              </Button>
              {testResult && (
                <div className={`flex items-center gap-1.5 text-[12px] font-medium ${testResult.success ? 'text-emerald-600' : 'text-destructive'}`}>
                  {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {testResult.success ? testResult.message : testResult.error}
                </div>
              )}
            </div>
          </CardContent></Card>
        </Section>

        {/* ── SDP Cloud OAuth ── */}
        <Section title="SDP Cloud OAuth" description="Zoho OAuth credentials for ManageEngine ServiceDesk Plus Cloud. When set, these are used instead of the Technician API key.">
          <Card><CardContent className="p-5 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100 text-[12px] text-blue-700">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              For SDP Cloud, fill these fields. Leave blank to use the Technician API key (on-premise only).
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client ID</Label>
                <Input value={agent.oauthClientId} onChange={e => upd('oauthClientId', e.target.value)} placeholder="1000.XXXX..." className="font-mono text-[12px]" />
              </div>
              <div className="space-y-1.5">
                <Label>Zoho Domain</Label>
                <select
                  value={agent.oauthDomain}
                  onChange={e => upd('oauthDomain', e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="accounts.zoho.com">Global (accounts.zoho.com)</option>
                  <option value="accounts.zoho.in">India (accounts.zoho.in)</option>
                  <option value="accounts.zoho.eu">EU (accounts.zoho.eu)</option>
                  <option value="accounts.zoho.com.au">Australia (accounts.zoho.com.au)</option>
                  <option value="accounts.zoho.jp">Japan (accounts.zoho.jp)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Client Secret</Label>
              <Input type="password" value={agent.oauthClientSecret} onChange={e => upd('oauthClientSecret', e.target.value)} placeholder="0b0657e..." className="font-mono text-[12px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Refresh Token</Label>
              <Input type="password" value={agent.oauthRefreshToken} onChange={e => upd('oauthRefreshToken', e.target.value)} placeholder="1000.xxxx..." className="font-mono text-[12px]" />
              <p className="text-[10px] text-muted-foreground/70">
                Get this from Zoho API Console → Self Client → generate code with scope <code className="font-mono text-[10px]">SDPOnDemand.requests.ALL,SDPOnDemand.setup.READ</code> → exchange for tokens.
              </p>
            </div>
          </CardContent></Card>
        </Section>

        {/* ── LLM Config ── */}
        <Section title="LLM Configuration" description="Language model settings used by this agent. Stored in ZeVox — no ServiceNow needed.">
          <Card><CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={agent.llmModel} onChange={e => upd('llmModel', e.target.value)} placeholder="gpt-4o-mini" />
              </div>
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Input value={agent.llmProvider} onChange={e => upd('llmProvider', e.target.value)} placeholder="openai" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input value={agent.llmBaseUrl} onChange={e => upd('llmBaseUrl', e.target.value)} placeholder="https://api.openai.com/v1" />
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={newLlmKey}
                onChange={e => setNewLlmKey(e.target.value)}
                placeholder={agent.llmApiKey ? `Current: ${agent.llmApiKey} — enter new to replace` : 'Enter LLM API key'}
              />
            </div>
          </CardContent></Card>
        </Section>

        {/* ── Voice ── */}
        <Section title="Voice Settings" description="STT language and TTS voice for this agent.">
          <Card><CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>TTS Voice</Label>
                <Input value={agent.ttsVoice} onChange={e => upd('ttsVoice', e.target.value)} placeholder="aura-asteria-en" />
                <p className="text-[10px] text-muted-foreground/70">Deepgram Aura voice ID.</p>
              </div>
              <div className="space-y-1.5">
                <Label>STT Language</Label>
                <Input value={agent.sttLanguage} onChange={e => upd('sttLanguage', e.target.value)} placeholder="multi" />
                <p className="text-[10px] text-muted-foreground/70">Use "multi" for auto-detect.</p>
              </div>
            </div>
          </CardContent></Card>
        </Section>

        {/* ── Persona ── */}
        <Section title="Agent Persona" description="Greeting, identity, and behavioural instructions sent to the LLM.">
          <Card><CardContent className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Greeting</Label>
              <Input value={agent.greeting} onChange={e => upd('greeting', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Identity</Label>
              <textarea
                rows={3}
                value={agent.identity}
                onChange={e => upd('identity', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <p className="text-[10px] text-muted-foreground/70">Who the agent is. Appears at the top of the system prompt.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Instructions</Label>
              <textarea
                rows={4}
                value={agent.instructions}
                onChange={e => upd('instructions', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <p className="text-[10px] text-muted-foreground/70">Behaviour rules injected into the system prompt.</p>
            </div>
          </CardContent></Card>
        </Section>

        {/* ── Widget Token ── */}
        <Section title="Widget Token" description="Generate a token to embed the voice widget. Share the direct link or paste the iframe into ManageEngine.">
          <Card><CardContent className="p-5 space-y-5">
            {!agent.token ? (
              <div className="flex items-center gap-3">
                <p className="text-[13px] text-muted-foreground flex-1">No token yet — generate one to enable the widget.</p>
                <Button size="sm" onClick={handleGenerateToken} disabled={generatingToken}>
                  {generatingToken ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                  Generate token
                </Button>
              </div>
            ) : (
              <>
                {/* Direct link */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-2">Direct link</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 px-3 py-2 rounded-md bg-muted/50 border border-border text-[11.5px] font-mono text-foreground/80 truncate">
                      {widgetUrl}
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copy(widgetUrl!, setCopiedUrl)}>
                      {copiedUrl ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                    <a href={widgetUrl!} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
                      <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3" /></Button>
                    </a>
                  </div>
                </div>

                {/* iFrame embed */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-2">iFrame embed — paste into ManageEngine</p>
                  <div className="flex items-start gap-2">
                    <pre className="flex-1 min-w-0 px-3 py-2.5 rounded-md bg-muted/50 border border-border text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre leading-relaxed">
{`<iframe
  src="${widgetUrl}"
  width="100%"
  height="600"
  frameborder="0"
  allow="microphone"
></iframe>`}
                    </pre>
                    <Button variant="outline" size="sm" className="mt-0.5 shrink-0"
                      onClick={() => copy(`<iframe\n  src="${widgetUrl}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  allow="microphone"\n></iframe>`, setCopiedIframe)}>
                      {copiedIframe ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">
                    Add this to a ManageEngine custom widget, announcement, or portal page. <code className="font-mono text-[10px]">allow=&quot;microphone&quot;</code> is required.
                  </p>
                </div>

                {/* Script snippet */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.1em] mb-2">Script snippet — floating widget on any page</p>
                  <div className="flex items-start gap-2">
                    <pre className="flex-1 min-w-0 px-3 py-2.5 rounded-md bg-muted/50 border border-border text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre leading-relaxed">
{`<script>window.ZEVOX_TOKEN = "${agent.token}";</script>
<script src="${APP_URL}/widget.js"></script>`}
                    </pre>
                    <Button variant="outline" size="sm" className="mt-0.5 shrink-0"
                      onClick={() => copy(`<script>window.ZEVOX_TOKEN = "${agent.token}";</script>\n<script src="${APP_URL}/widget.js"></script>`, setCopiedSnippet)}>
                      {copiedSnippet ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>

                {/* Regenerate */}
                <div className="pt-2 border-t border-border">
                  <Button variant="outline" size="sm" onClick={handleGenerateToken} disabled={generatingToken} className="text-muted-foreground">
                    {generatingToken ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                    Regenerate token
                  </Button>
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">Regenerating invalidates the current token — update any embeds that use it.</p>
                </div>
              </>
            )}
          </CardContent></Card>
        </Section>

        {/* ── Live Widget Test ── */}
        {agent.token && (
          <Section title="Live Test" description="Test the widget directly in this page. Both form mode (top bar) and portal mode (bottom-right) load simultaneously.">
            <Card><CardContent className="p-5 space-y-4">
              {!showWidgetTest ? (
                <Button size="sm" onClick={launchInPageTest}>
                  Launch widget test
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[13px] text-emerald-600 font-medium">Widget active — form bar at top of page, portal widget in bottom-right corner.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setShowWidgetTest(false); formLoaded.current = false; const el = document.getElementById('zv'); if (el) el.remove(); (window as any).__zv = false }}>
                    Close test
                  </Button>
                </div>
              )}
            </CardContent></Card>
          </Section>
        )}

        {/* ── Danger zone ── */}
        <Section title="Danger zone" description="Permanently remove this agent.">
          <Card className="border-destructive/20"><CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-foreground">Delete agent</p>
                <p className="text-[11px] text-muted-foreground">Removes the agent, its token, and all settings. Cannot be undone.</p>
              </div>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowDelete(true)}>
                <Trash2 className="w-3 h-3" /> Delete
              </Button>
            </div>
          </CardContent></Card>
        </Section>
      </div>

      {/* Portal widget iframe */}
      {showWidgetTest && (
        <iframe ref={iframeRef} allowTransparency src="about:blank" scrolling="no"
          style={{ position: 'fixed', bottom: 0, right: 0, width: 420, height: 520, border: 'none', background: 'transparent', zIndex: 999990, pointerEvents: 'all' }} />
      )}

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">Delete &ldquo;{agent.name}&rdquo;?</h3>
                <p className="text-[12px] text-muted-foreground mt-1">This permanently removes the agent and its token. The ManageEngine instance is not affected.</p>
              </div>
              <button onClick={() => setShowDelete(false)} className="text-muted-foreground hover:text-foreground ml-auto">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete agent'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
