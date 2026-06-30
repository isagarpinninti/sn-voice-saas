'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { Phone, Bot, Edit2, Check, X, ChevronRight } from 'lucide-react'
import Link from 'next/link'

type Agent = { id: string; name: string; active: boolean }

type PhoneNumber = {
  id: string
  e164: string
  friendly: string | null
  provider: string
  active: boolean
  createdAt: string
  agent: { id: string; name: string } | null
  instance: { id: string; name: string; snInstanceUrl: string } | null
}

export default function PhoneNumbersPage() {
  const { toast } = useToast()
  const [numbers, setNumbers] = useState<PhoneNumber[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [planEligible, setPlanEligible] = useState(false)

  // Per-row edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFriendly, setEditFriendly] = useState('')
  const [editAgentId, setEditAgentId] = useState('')
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [pRes, aRes] = await Promise.all([
        fetch('/api/phone-numbers', { cache: 'no-store' }),
        fetch('/api/agents', { cache: 'no-store' }),
      ])
      const pd = await pRes.json()
      const ad = await aRes.json()
      setNumbers(pd.phoneNumbers || [])
      setPlanEligible(pd.planEligible ?? false)
      setAgents(Array.isArray(ad.agents) ? ad.agents : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  function startEdit(p: PhoneNumber) {
    setEditingId(p.id)
    setEditFriendly(p.friendly || '')
    setEditAgentId(p.agent?.id || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditFriendly('')
    setEditAgentId('')
  }

  async function saveEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendly: editFriendly, agentId: editAgentId || null }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast('Saved', 'success')
      setEditingId(null)
      await refresh()
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: PhoneNumber) {
    try {
      const res = await fetch(`/api/phone-numbers/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      })
      if (!res.ok) throw new Error()
      toast(p.active ? 'Number deactivated' : 'Number activated', 'success')
      await refresh()
    } catch {
      toast('Failed to update', 'error')
    }
  }

  const activeNumbers = numbers.filter(n => n.active)
  const inactiveNumbers = numbers.filter(n => !n.active)

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Voice"
        title="Phone numbers"
        description="Each number routes inbound calls to a specific agent. Contact support to provision or release numbers."
      />

      {!planEligible && (
        <Card className="mb-6 border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-[12.5px] text-muted-foreground">
              Phone calls require a Premium plan.{' '}
              <Link href="/dashboard/billing" className="text-foreground underline underline-offset-2">
                Upgrade to unlock
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-secondary/50 animate-pulse" />)}
        </div>
      ) : numbers.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="No phone numbers yet"
          description="Phone numbers are provisioned by your account admin. Once assigned, they'll appear here and you can link them to specific agents."
        />
      ) : (
        <div className="space-y-6">
          {activeNumbers.length > 0 && (
            <Section title="Active" description={`${activeNumbers.length} number${activeNumbers.length !== 1 ? 's' : ''} routing calls`}>
              <div className="space-y-2">
                {activeNumbers.map(p => (
                  <NumberRow
                    key={p.id}
                    p={p}
                    agents={agents}
                    editing={editingId === p.id}
                    editFriendly={editFriendly}
                    editAgentId={editAgentId}
                    saving={saving}
                    onStartEdit={() => startEdit(p)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={() => saveEdit(p.id)}
                    onToggleActive={() => toggleActive(p)}
                    setEditFriendly={setEditFriendly}
                    setEditAgentId={setEditAgentId}
                  />
                ))}
              </div>
            </Section>
          )}

          {inactiveNumbers.length > 0 && (
            <Section title="Inactive" description="Calls to these numbers will be rejected">
              <div className="space-y-2">
                {inactiveNumbers.map(p => (
                  <NumberRow
                    key={p.id}
                    p={p}
                    agents={agents}
                    editing={editingId === p.id}
                    editFriendly={editFriendly}
                    editAgentId={editAgentId}
                    saving={saving}
                    onStartEdit={() => startEdit(p)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={() => saveEdit(p.id)}
                    onToggleActive={() => toggleActive(p)}
                    setEditFriendly={setEditFriendly}
                    setEditAgentId={setEditAgentId}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section title="Caller allowlist" description="Restrict which callers can reach your agents.">
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Manage allowed callers</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    By default all callers are accepted. Add entries to restrict access to specific phone numbers.
                  </p>
                </div>
                <Link
                  href="/dashboard/phone-allowlist"
                  className="shrink-0 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Configure <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </CardContent>
            </Card>
          </Section>
        </div>
      )}
    </div>
  )
}

function NumberRow({
  p, agents, editing, editFriendly, editAgentId, saving,
  onStartEdit, onCancelEdit, onSaveEdit, onToggleActive,
  setEditFriendly, setEditAgentId,
}: {
  p: PhoneNumber
  agents: Agent[]
  editing: boolean
  editFriendly: string
  editAgentId: string
  saving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onToggleActive: () => void
  setEditFriendly: (v: string) => void
  setEditAgentId: (v: string) => void
}) {
  return (
    <Card className={!p.active ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-9 h-9 rounded-lg border border-primary/20 bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
            <Phone className="w-4 h-4 text-primary" />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Friendly name</p>
                    <Input
                      value={editFriendly}
                      onChange={e => setEditFriendly(e.target.value)}
                      placeholder="e.g. IT Helpdesk"
                      className="text-[12px] h-8"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Agent</p>
                    <select
                      value={editAgentId}
                      onChange={e => setEditAgentId(e.target.value)}
                      className="w-full h-8 text-[12px] rounded-md border border-input bg-background px-2 outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">— No agent assigned —</option>
                      {agents.filter(a => a.active).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={onSaveEdit} disabled={saving} className="h-7 text-[11px]">
                    <Check className="w-3 h-3" /> {saving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onCancelEdit} disabled={saving} className="h-7 text-[11px]">
                    <X className="w-3 h-3" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-foreground tracking-tight font-mono">
                    {p.e164}
                  </p>
                  {p.friendly && (
                    <p className="text-[12px] text-muted-foreground">{p.friendly}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{p.provider}</Badge>
                  {p.agent ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Bot className="w-3 h-3" /> {p.agent.name}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-500">No agent assigned</span>
                  )}
                  {p.instance && (
                    <span className="text-[11px] text-muted-foreground/60 hidden sm:block truncate max-w-[160px]">
                      {p.instance.snInstanceUrl?.replace('https://', '')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {!editing && (
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={onStartEdit} className="h-7 text-[11px] gap-1">
                <Edit2 className="w-3 h-3" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onToggleActive}
                className={`h-7 text-[11px] ${p.active ? 'text-destructive hover:bg-destructive/10 border-destructive/30' : ''}`}
              >
                {p.active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
