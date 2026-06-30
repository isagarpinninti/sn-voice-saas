'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Phone, Plus, Trash2, Building2, Bot, Link2, Sparkles, PhoneOutgoing, Edit2, Check, X } from 'lucide-react'

type PhoneNumber = {
  id: string
  e164: string
  friendly: string | null
  provider: string
  providerExternalId: string | null
  active: boolean
  createdAt: string
  tenantId: string
  agentId: string | null
  instanceId: string | null
  tenant: { id: string; company: string | null; plan: string; user: { email: string | null } }
  agent: { id: string; name: string } | null
  instance: { id: string; name: string; snInstanceUrl: string | null } | null
}

type Agent = { id: string; name: string; active: boolean }

export default function PhoneNumbersAdminPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<PhoneNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    e164: '',
    tenantId: '',
    agentId: '',
    provider: 'TWILIO',
    providerExternalId: '',
    friendly: '',
  })
  const [provForm, setProvForm] = useState({
    provider: 'twilio',
    country: 'US',
    areaCode: '',
    contains: '',
    tenantId: '',
    agentId: '',
    friendly: '',
  })
  const [tenantAgents, setTenantAgents] = useState<Agent[]>([])
  const [provTenantAgents, setProvTenantAgents] = useState<Agent[]>([])

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAgentId, setEditAgentId] = useState('')
  const [editFriendly, setEditFriendly] = useState('')
  const [editAgents, setEditAgents] = useState<Agent[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/phone-numbers', { cache: 'no-store' })
      const d = await res.json()
      setRows(Array.isArray(d.phoneNumbers) ? d.phoneNumbers : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // Load agents for tenant when tenantId is entered — helps the admin pick an agent
  useEffect(() => {
    const t = form.tenantId.trim()
    if (t.length < 8) {
      setTenantAgents([])
      return
    }
    let cancelled = false
    fetch(`/api/admin/tenants/${encodeURIComponent(t)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const agents: Agent[] = Array.isArray(d?.tenant?.agents) ? d.tenant.agents.filter((a: any) => a.active) : []
        setTenantAgents(agents)
      })
      .catch(() => setTenantAgents([]))
    return () => {
      cancelled = true
    }
  }, [form.tenantId])

  useEffect(() => {
    const t = provForm.tenantId.trim()
    if (t.length < 8) {
      setProvTenantAgents([])
      return
    }
    let cancelled = false
    fetch(`/api/admin/tenants/${encodeURIComponent(t)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const agents: Agent[] = Array.isArray(d?.tenant?.agents) ? d.tenant.agents.filter((a: any) => a.active) : []
        setProvTenantAgents(agents)
      })
      .catch(() => setProvTenantAgents([]))
    return () => {
      cancelled = true
    }
  }, [provForm.tenantId])

  async function provision(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/admin/phone-numbers/provision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: provForm.provider,
          country: provForm.country.trim().toUpperCase(),
          areaCode: provForm.areaCode.trim() || undefined,
          contains: provForm.contains.trim() || undefined,
          tenantId: provForm.tenantId.trim(),
          agentId: provForm.agentId || null,
          friendly: provForm.friendly.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Provisioning failed', 'error')
        return
      }
      toast(`Provisioned ${data.phoneNumber?.e164 || 'number'}`, 'success')
      setProvForm({ provider: 'twilio', country: 'US', areaCode: '', contains: '', tenantId: '', agentId: '', friendly: '' })
      setProvisioning(false)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/admin/phone-numbers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          e164: form.e164.trim(),
          tenantId: form.tenantId.trim(),
          agentId: form.agentId || null,
          provider: form.provider,
          providerExternalId: form.providerExternalId.trim() || null,
          friendly: form.friendly.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Create failed', 'error')
        return
      }
      toast('Phone number added', 'success')
      setForm({ e164: '', tenantId: '', agentId: '', provider: 'TWILIO', providerExternalId: '', friendly: '' })
      setAdding(false)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function callOut(p: PhoneNumber) {
    const to = window.prompt(`Outbound call from ${p.e164}\n\nEnter destination in E.164 format (e.g. +14155550123):`)
    if (!to) return
    const trimmed = to.trim()
    if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) {
      toast('Target must be in E.164 format (e.g. +14155550123)', 'error')
      return
    }
    const ok = await confirm({
      title: `Call ${trimmed} from ${p.e164}?`,
      description: `This will place an outbound call via ${p.provider}. The target's phone will ring, and when answered the voice agent connects.`,
      confirmLabel: 'Place call',
    })
    if (!ok) return
    const res = await fetch(`/api/admin/phone-numbers/${encodeURIComponent(p.id)}/call-out`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: trimmed }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast(data.error || 'Call failed', 'error')
      return
    }
    toast(`Calling ${trimmed}…`, 'success')
  }

  async function startEdit(p: PhoneNumber) {
    setEditingId(p.id)
    setEditFriendly(p.friendly || '')
    setEditAgentId(p.agentId || '')
    // Load agents for this tenant
    setEditAgents([])
    fetch(`/api/admin/tenants/${encodeURIComponent(p.tenantId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const agents: Agent[] = Array.isArray(d?.tenant?.agents) ? d.tenant.agents.filter((a: any) => a.active) : []
        setEditAgents(agents)
      })
      .catch(() => {})
  }

  function cancelEdit() {
    setEditingId(null)
    setEditAgentId('')
    setEditFriendly('')
    setEditAgents([])
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: editAgentId || null, friendly: editFriendly }),
      })
      if (!res.ok) { toast('Save failed', 'error'); return }
      toast('Updated', 'success')
      cancelEdit()
      await refresh()
    } finally {
      setSavingEdit(false)
    }
  }

  async function toggleActive(p: PhoneNumber) {
    const res = await fetch(`/api/admin/phone-numbers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    if (!res.ok) { toast('Update failed', 'error'); return }
    toast(p.active ? 'Deactivated' : 'Activated', 'success')
    await refresh()
  }

  async function remove(p: PhoneNumber) {
    const ok = await confirm({
      title: `Remove ${p.e164}?`,
      description: 'Calls to this number will hang up immediately. Reversible by re-adding the number.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`/api/admin/phone-numbers?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' })
    if (!res.ok) {
      toast('Delete failed', 'error')
      return
    }
    toast('Removed', 'success')
    await refresh()
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Phone numbers"
        description="Inbound phone numbers (Twilio or Telnyx) routed to a tenant's voice agent."
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => { setProvisioning(!provisioning); if (!provisioning) setAdding(false) }}
              size="sm"
              variant={provisioning ? 'outline' : 'default'}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {provisioning ? 'Cancel' : 'Provision new'}
            </Button>
            <Button
              onClick={() => { setAdding(!adding); if (!adding) setProvisioning(false) }}
              size="sm"
              variant={adding ? 'outline' : 'secondary'}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {adding ? 'Cancel' : 'Add manually'}
            </Button>
          </div>
        }
      />

      {provisioning && (
        <Card className="mb-6 border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-5">
            <div className="mb-3 text-[12px] text-muted-foreground">
              Searches the provider, buys the first matching number, binds it to our webhook app, and registers it —
              all in one step. Rolls back (releases the number) if any step fails.
            </div>
            <form onSubmit={provision} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="provProvider">Provider *</Label>
                <select
                  id="provProvider"
                  value={provForm.provider}
                  onChange={(e) => setProvForm({ ...provForm, provider: e.target.value })}
                  className="w-full h-9 px-3 rounded-md bg-card border border-border text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                >
                  <option value="twilio">Twilio</option>
                </select>
              </div>
              <div>
                <Label htmlFor="provCountry">Country *</Label>
                <Input
                  id="provCountry"
                  value={provForm.country}
                  onChange={(e) => setProvForm({ ...provForm, country: e.target.value })}
                  placeholder="US"
                  required
                  maxLength={2}
                  className="uppercase"
                />
              </div>
              <div>
                <Label htmlFor="provAreaCode">Area code (optional)</Label>
                <Input
                  id="provAreaCode"
                  value={provForm.areaCode}
                  onChange={(e) => setProvForm({ ...provForm, areaCode: e.target.value })}
                  placeholder="415"
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label htmlFor="provContains">Contains digits (optional)</Label>
                <Input
                  id="provContains"
                  value={provForm.contains}
                  onChange={(e) => setProvForm({ ...provForm, contains: e.target.value })}
                  placeholder="e.g. 555"
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label htmlFor="provTenantId">Tenant ID *</Label>
                <Input
                  id="provTenantId"
                  value={provForm.tenantId}
                  onChange={(e) => setProvForm({ ...provForm, tenantId: e.target.value, agentId: '' })}
                  placeholder="cmn... (use ⌘K to find)"
                  required
                  className="font-mono"
                />
              </div>
              <div>
                <Label htmlFor="provAgentId">Agent</Label>
                <select
                  id="provAgentId"
                  value={provForm.agentId}
                  onChange={(e) => setProvForm({ ...provForm, agentId: e.target.value })}
                  className="w-full h-9 px-3 rounded-md bg-card border border-border text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  disabled={provTenantAgents.length === 0}
                >
                  <option value="">{provTenantAgents.length === 0 ? 'Enter tenant ID to load' : '(orchestrator picks)'}</option>
                  {provTenantAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="provFriendly">Friendly name (optional)</Label>
                <Input
                  id="provFriendly"
                  value={provForm.friendly}
                  onChange={(e) => setProvForm({ ...provForm, friendly: e.target.value })}
                  placeholder="SF Support Line"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={busy} size="sm">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  {busy ? 'Provisioning…' : 'Search & buy'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {adding && (
        <Card className="mb-6 border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-5">
            <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="e164">E.164 number *</Label>
                <Input
                  id="e164"
                  value={form.e164}
                  onChange={(e) => setForm({ ...form, e164: e.target.value })}
                  placeholder="+14155550123"
                  required
                />
              </div>
              <div>
                <Label htmlFor="friendly">Friendly name</Label>
                <Input
                  id="friendly"
                  value={form.friendly}
                  onChange={(e) => setForm({ ...form, friendly: e.target.value })}
                  placeholder="SF Support Line"
                />
              </div>
              <div>
                <Label htmlFor="tenantId">Tenant ID *</Label>
                <Input
                  id="tenantId"
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value, agentId: '' })}
                  placeholder="cmn... (use ⌘K to find)"
                  required
                  className="font-mono"
                />
              </div>
              <div>
                <Label htmlFor="agentId">Agent</Label>
                <select
                  id="agentId"
                  value={form.agentId}
                  onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                  className="w-full h-9 px-3 rounded-md bg-card border border-border text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  disabled={tenantAgents.length === 0}
                >
                  <option value="">{tenantAgents.length === 0 ? 'Enter tenant ID to load' : '(orchestrator picks)'}</option>
                  {tenantAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="provider">Provider</Label>
                <select
                  id="provider"
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                  className="w-full h-9 px-3 rounded-md bg-card border border-border text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                >
                  <option value="TWILIO">Twilio</option>
                </select>
              </div>
              <div>
                <Label htmlFor="providerExternalId">External ID (optional)</Label>
                <Input
                  id="providerExternalId"
                  value={form.providerExternalId}
                  onChange={(e) => setForm({ ...form, providerExternalId: e.target.value })}
                  placeholder="PN..."
                  className="font-mono"
                />
                <p className="text-[10.5px] text-muted-foreground/70 mt-1">
                  Twilio Phone Number SID (e.g. PNxxx). Optional; used for provisioning automation.
                </p>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={busy} size="sm">
                  {busy ? 'Adding…' : 'Add phone number'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-[13px] text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="No phone numbers yet"
          description="Buy a number in Twilio or Telnyx, point its voice webhook at /api/phone/incoming, then add it here to route calls to a tenant's agent."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rows.map((p) => (
                <div key={p.id} className="p-4 space-y-2">
                  {/* Row header — always visible */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Phone className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-mono text-[14px] font-semibold text-foreground">{p.e164}</span>
                        {p.friendly && <span className="text-[12px] text-muted-foreground">· {p.friendly}</span>}
                        <Badge variant={p.active ? 'success' : 'outline'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                        <Badge variant={p.tenant.plan === 'PREMIUM' || p.tenant.plan === 'ENTERPRISE' ? 'default' : 'success'}>
                          {p.tenant.plan}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {p.tenant.company || p.tenant.user.email || p.tenantId.slice(0, 10) + '…'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Bot className="w-3 h-3" />
                          {p.agent?.name || <span className="text-amber-400">No agent assigned</span>}
                        </span>
                        {p.instance && (
                          <span className="inline-flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            {p.instance.snInstanceUrl?.replace('https://', '') || p.instance.name}
                          </span>
                        )}
                        <Badge variant="outline">{p.provider}</Badge>
                        {p.providerExternalId && <span className="font-mono text-[10.5px]">{p.providerExternalId.slice(0, 14)}…</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {editingId === p.id ? (
                        <>
                          <button type="button" onClick={() => saveEdit(p.id)} disabled={savingEdit}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-emerald-500 hover:bg-emerald-500/10 transition-colors" title="Save">
                            <Check className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={cancelEdit} disabled={savingEdit}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-secondary transition-colors" title="Cancel">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => startEdit(p)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Edit agent / friendly name">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => toggleActive(p)}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors ${p.active ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                            title={p.active ? 'Deactivate' : 'Activate'}>
                            <Phone className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => callOut(p)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-primary/70 hover:bg-primary/10 hover:text-primary transition-colors" title="Place outbound call">
                            <PhoneOutgoing className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => remove(p)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors" title="Remove">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingId === p.id && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Friendly name</label>
                        <Input value={editFriendly} onChange={e => setEditFriendly(e.target.value)}
                          placeholder="e.g. IT Helpdesk" className="text-[12px] h-8" autoFocus />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned agent</label>
                        <select value={editAgentId} onChange={e => setEditAgentId(e.target.value)}
                          className="w-full h-8 text-[12px] rounded-md border border-input bg-background px-2 outline-none focus:ring-1 focus:ring-primary">
                          <option value="">{editAgents.length === 0 ? 'Loading…' : '(orchestrator picks)'}</option>
                          {editAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
