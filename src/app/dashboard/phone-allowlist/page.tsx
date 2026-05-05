'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Phone, Plus, Trash2, Edit2, ShieldCheck, ShieldOff, Mail, Hash, User } from 'lucide-react'

type Caller = {
  id: string
  phoneE164: string
  name: string | null
  email: string | null
  employeeId: string | null
  snUserSysId: string | null
  active: boolean
  createdAt: string
}

type FormState = {
  phoneE164: string
  name: string
  email: string
  employeeId: string
  snUserSysId: string
}

const EMPTY: FormState = { phoneE164: '', name: '', email: '', employeeId: '', snUserSysId: '' }

export default function PhoneAllowlistPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [callers, setCallers] = useState<Caller[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/allowed-callers', { cache: 'no-store' })
      const d = await res.json()
      setCallers(Array.isArray(d.callers) ? d.callers : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  function startEdit(c: Caller) {
    setEditingId(c.id)
    setAdding(false)
    setForm({
      phoneE164: c.phoneE164,
      name: c.name || '',
      email: c.email || '',
      employeeId: c.employeeId || '',
      snUserSysId: c.snUserSysId || '',
    })
  }

  function startAdd() {
    setEditingId(null)
    setAdding(true)
    setForm(EMPTY)
  }

  function cancelEdit() {
    setEditingId(null)
    setAdding(false)
    setForm(EMPTY)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const payload = {
        phoneE164: form.phoneE164.trim(),
        name: form.name.trim() || null,
        email: form.email.trim() || null,
        employeeId: form.employeeId.trim() || null,
        snUserSysId: form.snUserSysId.trim() || null,
      }
      const url = editingId ? `/api/allowed-callers/${editingId}` : '/api/allowed-callers'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error || 'Save failed', 'error')
        return
      }
      toast(editingId ? 'Caller updated' : 'Caller added', 'success')
      cancelEdit()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: Caller) {
    const ok = await confirm({
      title: `Remove ${c.phoneE164}?`,
      description: c.name ? `${c.name} will lose access to your phone line. Reversible by re-adding the number.` : 'This caller will lose access to your phone line. Reversible by re-adding the number.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`/api/allowed-callers/${c.id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast('Delete failed', 'error')
      return
    }
    toast('Removed', 'success')
    await refresh()
  }

  async function toggleActive(c: Caller) {
    const res = await fetch(`/api/allowed-callers/${c.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !c.active }),
    })
    if (!res.ok) {
      toast('Update failed', 'error')
      return
    }
    toast(c.active ? 'Caller disabled' : 'Caller enabled', 'success')
    await refresh()
  }

  const activeCount = callers.filter(c => c.active).length
  const totalCount = callers.length
  const showingForm = adding || editingId !== null

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Phone allowlist"
        description="Restrict who can reach your voice agent by phone. When the list is empty, every caller gets through. When it has entries, only those callers connect — others hear a polite hangup."
        actions={
          !showingForm && (
            <Button onClick={startAdd} size="sm">
              <Plus className="w-3.5 h-3.5" />
              Add caller
            </Button>
          )
        }
      />

      {/* Mode banner */}
      <Card className={`mb-6 border-${activeCount > 0 ? 'primary/30 bg-primary/[0.03]' : 'amber-400/30 bg-amber-400/[0.03]'}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {activeCount > 0 ? (
              <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            ) : (
              <ShieldOff className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="text-[13.5px] font-semibold text-foreground mb-0.5">
                {activeCount > 0
                  ? `Allowlist enforced — ${activeCount} active caller${activeCount === 1 ? '' : 's'}`
                  : 'Open access — every caller gets through'}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {activeCount > 0
                  ? `Calls from numbers not on this list are rejected with a polite hangup. ${totalCount - activeCount > 0 ? `(${totalCount - activeCount} disabled, not enforced.)` : ''}`
                  : 'Add at least one entry below to enable the allowlist. While the list is empty, calls are unrestricted (subject to plan + quota).'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add / edit form */}
      {showingForm && (
        <Card className="mb-6 border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-5">
            <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phoneE164">Phone number (E.164) *</Label>
                <Input
                  id="phoneE164"
                  value={form.phoneE164}
                  onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}
                  placeholder="+14155550123"
                  required
                  className="font-mono"
                  disabled={!!editingId}
                />
                <p className="text-[10.5px] text-muted-foreground/70 mt-1">Include country code with +. Example: +14155550123</p>
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" />
              </div>
              <div>
                <Label htmlFor="employeeId">Employee ID</Label>
                <Input id="employeeId" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="EMP-1234" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="snUserSysId">ServiceNow user sys_id (optional)</Label>
                <Input
                  id="snUserSysId"
                  value={form.snUserSysId}
                  onChange={(e) => setForm({ ...form, snUserSysId: e.target.value })}
                  placeholder="e.g. 6816f79cc0a8016401c5a33be04be441"
                  className="font-mono"
                  maxLength={32}
                />
                <p className="text-[10.5px] text-muted-foreground/70 mt-1">
                  32-char hex sys_id of the matching <code className="px-1 py-0.5 rounded bg-secondary text-foreground font-mono">sys_user</code> record. Passed to tool scripts as <code className="px-1 py-0.5 rounded bg-secondary text-foreground font-mono">caller_user_id</code> for attribution — e.g. so an incident created during the call shows up under the right user's history.
                </p>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                <Button type="submit" disabled={busy} size="sm">
                  {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add caller'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-[13px] text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : callers.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="No callers configured"
          description="Add the phone numbers that should be able to reach your voice agent. While this list is empty, all callers are accepted."
          action={!showingForm && <Button onClick={startAdd} size="sm"><Plus className="w-3.5 h-3.5" />Add the first caller</Button>}
        />
      ) : (
        <Section title="Allowed callers" count={totalCount}>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {callers.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Phone className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-mono text-[14px] font-semibold text-foreground">{c.phoneE164}</span>
                        {c.name && <span className="text-[12.5px] text-muted-foreground">· {c.name}</span>}
                        {c.active ? (
                          <Badge variant="success" dot>Active</Badge>
                        ) : (
                          <Badge variant="secondary" dot>Disabled</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground flex-wrap">
                        {c.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                        {c.employeeId && <span className="inline-flex items-center gap-1"><Hash className="w-3 h-3" />{c.employeeId}</span>}
                        {c.snUserSysId && <span className="inline-flex items-center gap-1 font-mono"><User className="w-3 h-3" />{c.snUserSysId.slice(0, 12)}…</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleActive(c)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        aria-label={c.active ? 'Disable' : 'Enable'}
                        title={c.active ? 'Disable (keep entry, stop enforcing)' : 'Enable'}
                      >
                        {c.active ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        aria-label="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Section>
      )}
    </div>
  )
}
