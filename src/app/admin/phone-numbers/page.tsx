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
import { Phone, Plus, Trash2, Building2, Bot, Link2 } from 'lucide-react'

type PhoneNumber = {
  id: string
  e164: string
  friendly: string | null
  twilioSid: string | null
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
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({
    e164: '',
    tenantId: '',
    agentId: '',
    twilioSid: '',
    friendly: '',
  })
  const [tenantAgents, setTenantAgents] = useState<Agent[]>([])

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
          twilioSid: form.twilioSid.trim() || null,
          friendly: form.friendly.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Create failed', 'error')
        return
      }
      toast('Phone number added', 'success')
      setForm({ e164: '', tenantId: '', agentId: '', twilioSid: '', friendly: '' })
      setAdding(false)
      await refresh()
    } finally {
      setBusy(false)
    }
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
        description="Inbound phone numbers provisioned on Twilio and routed to a tenant's voice agent."
        actions={
          <Button onClick={() => setAdding(!adding)} size="sm" variant={adding ? 'outline' : 'default'}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {adding ? 'Cancel' : 'Add number'}
          </Button>
        }
      />

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
              <div className="md:col-span-2">
                <Label htmlFor="twilioSid">Twilio PN SID (optional)</Label>
                <Input
                  id="twilioSid"
                  value={form.twilioSid}
                  onChange={(e) => setForm({ ...form, twilioSid: e.target.value })}
                  placeholder="PN..."
                  className="font-mono"
                />
                <p className="text-[10.5px] text-muted-foreground/70 mt-1">
                  Copy from Twilio console → Phone Numbers → your number. Helps identify the resource for automation.
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
          description="Buy a number in Twilio console, configure its Voice webhook to POST to /api/phone/incoming, then add it here to route calls to a tenant's agent."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rows.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Phone className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-mono text-[14px] font-semibold text-foreground">{p.e164}</span>
                      {p.friendly && <span className="text-[12px] text-muted-foreground">· {p.friendly}</span>}
                      {!p.active && <Badge variant="outline">Inactive</Badge>}
                      <Badge variant={p.tenant.plan === 'ENTERPRISE' ? 'default' : 'success'}>
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
                        {p.agent?.name || '(orchestrator picks)'}
                      </span>
                      {p.instance && (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="w-3 h-3" />
                          {p.instance.snInstanceUrl?.replace('https://', '') || p.instance.name}
                        </span>
                      )}
                      {p.twilioSid && <span className="font-mono text-[10.5px]">{p.twilioSid.slice(0, 14)}…</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
