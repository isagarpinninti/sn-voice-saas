'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { CheckCircle2, XCircle, Loader2, Copy, Check, Plus, Server, Trash2 } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.up.railway.app'

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
  createdAt: string
}

export default function ConnectionPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [instances, setInstances] = useState<Instance[]>([])
  const [maxInstances, setMaxInstances] = useState(1)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [testedInstanceId, setTestedInstanceId] = useState<string | null>(null)
  const [copied, setCopied] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({ name: '', snInstanceUrl: '', snUsername: '', snPassword: '' })
  useEffect(() => {
    fetch('/api/instances').then(r => r.json()).then(data => {
      setInstances(data.instances || [])
      setMaxInstances(data.maxInstances || 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function copyValue(value: string) {
    navigator.clipboard.writeText(value)
    setCopied(value)
    setTimeout(() => setCopied(''), 2000)
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
    setTestedInstanceId(instanceId)
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
                    <Button size="sm" variant="outline" onClick={() => handleTest(inst.id)} disabled={testing === inst.id}>
                      {testing === inst.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test connection'}
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
                {testResults.length > 0 && testing === null && testedInstanceId === inst.id && (
                  <div className="rounded-lg border border-border bg-background overflow-hidden mt-4">
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
