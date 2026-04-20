'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Flag, Globe, Building2, Save, Plus } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

type FeatureFlag = {
  id: string
  key: string
  tenantId: string | null
  enabled: boolean
  rolloutPct: number
  description: string | null
  updatedAt: string
}

export default function FeatureFlagsPage() {
  const { toast } = useToast()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [tenantCount, setTenantCount] = useState<number | null>(null)

  const emptyForm = { key: '', tenantId: '', enabled: false, rolloutPct: 0, description: '' }
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    refresh()
    fetch('/api/admin/tenants')
      .then((r) => r.json())
      .then((d) => {
        setTenantCount(Array.isArray(d.tenants) ? d.tenants.length : 0)
      })
      .catch(() => setTenantCount(null))
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/flags', { cache: 'no-store' })
      const d = await res.json()
      setFlags(Array.isArray(d.flags) ? d.flags : [])
    } finally {
      setLoading(false)
    }
  }

  async function saveFlag(payload: Partial<FeatureFlag> & { key: string }) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast('Save failed', 'error')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.key.trim()) return
    await saveFlag({ ...form, tenantId: form.tenantId.trim() || null })
    setForm(emptyForm)
    setAdding(false)
    toast('Flag saved', 'success')
  }

  const global = flags.filter((f) => !f.tenantId)
  const overrides = flags.filter((f) => f.tenantId)

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Feature flags"
        description="Enable features platform-wide, roll them out by percentage, or override per tenant."
        actions={
          <Button onClick={() => setAdding(!adding)} size="sm" variant={adding ? 'outline' : 'default'}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {adding ? 'Cancel' : 'New flag'}
          </Button>
        }
      />

      {adding && (
        <Card className="mb-6 border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-5">
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="key">Key</Label>
                <Input
                  id="key"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="eg. phone_calls, new_dashboard"
                />
              </div>
              <div>
                <Label htmlFor="tenantId">Tenant ID (blank = global)</Label>
                <Input
                  id="tenantId"
                  value={form.tenantId}
                  onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
                  placeholder="cmn... (leave empty for global)"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short reason why this flag exists"
                />
              </div>
              <div className="md:col-span-2">
                <RolloutSlider
                  value={form.rolloutPct}
                  onChange={(v) => setForm({ ...form, rolloutPct: v })}
                  affected={tenantCount}
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="accent-primary w-4 h-4"
                />
                <Label htmlFor="enabled" className="cursor-pointer">
                  Enabled (100% when checked, ignores rollout %)
                </Label>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy || !form.key.trim()} size="sm">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {busy ? 'Saving…' : 'Save flag'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Global flags */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3 px-1">
          <Globe className="w-3.5 h-3.5 text-primary" />
          <p className="text-[11px] text-muted-foreground/80 uppercase tracking-widest font-medium">
            Global flags
          </p>
          <span className="text-[11px] text-muted-foreground/60">{global.length}</span>
        </div>
        {loading ? (
          <Card><CardContent className="p-8 text-center text-[12px] text-muted-foreground">Loading…</CardContent></Card>
        ) : global.length === 0 ? (
          <EmptyState icon={Flag} title="No global flags" description="Create one above to control a feature platform-wide." />
        ) : (
          <div className="space-y-2">
            {global.map((f) => (
              <FlagRow key={f.id} flag={f} onSave={saveFlag} tenantCount={tenantCount} />
            ))}
          </div>
        )}
      </section>

      {/* Tenant overrides */}
      {overrides.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-[11px] text-muted-foreground/80 uppercase tracking-widest font-medium">
              Tenant overrides
            </p>
            <span className="text-[11px] text-muted-foreground/60">{overrides.length}</span>
          </div>
          <div className="space-y-2">
            {overrides.map((f) => (
              <FlagRow key={f.id} flag={f} onSave={saveFlag} tenantCount={tenantCount} isOverride />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FlagRow({
  flag,
  onSave,
  tenantCount,
  isOverride,
}: {
  flag: FeatureFlag
  onSave: (payload: Partial<FeatureFlag> & { key: string }) => Promise<void>
  tenantCount: number | null
  isOverride?: boolean
}) {
  const [pct, setPct] = useState(flag.rolloutPct)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    await onSave({
      key: flag.key,
      tenantId: flag.tenantId,
      enabled: !flag.enabled,
      rolloutPct: flag.rolloutPct,
      description: flag.description,
    })
    setBusy(false)
  }

  async function saveRollout() {
    setBusy(true)
    await onSave({
      key: flag.key,
      tenantId: flag.tenantId,
      enabled: flag.enabled,
      rolloutPct: pct,
      description: flag.description,
    })
    setBusy(false)
    setEditing(false)
  }

  return (
    <Card className={isOverride ? 'border-amber-400/20' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-mono text-[13px] font-semibold text-foreground">{flag.key}</span>
              {flag.enabled ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold tracking-wider uppercase">
                  On
                </span>
              ) : flag.rolloutPct > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-semibold tracking-wider uppercase">
                  {flag.rolloutPct}%
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-semibold tracking-wider uppercase">
                  Off
                </span>
              )}
              {flag.tenantId && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-400/30 bg-amber-400/[0.06] text-amber-400 font-mono">
                  {flag.tenantId.slice(0, 10)}…
                </span>
              )}
            </div>
            {flag.description && <p className="text-[11.5px] text-muted-foreground leading-relaxed">{flag.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Edit rollout
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={toggle} disabled={busy}>
              {flag.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>

        {editing && !flag.enabled && (
          <div className="pt-3 border-t border-border">
            <RolloutSlider value={pct} onChange={setPct} affected={tenantCount} />
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => { setPct(flag.rolloutPct); setEditing(false) }}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveRollout} disabled={busy || pct === flag.rolloutPct}>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {busy ? 'Saving…' : 'Save rollout'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RolloutSlider({
  value,
  onChange,
  affected,
}: {
  value: number
  onChange: (v: number) => void
  affected: number | null
}) {
  const affectedTenants = affected != null ? Math.round((affected * value) / 100) : null
  return (
    <div>
      <div className="flex items-end justify-between mb-1.5">
        <Label>Gradual rollout</Label>
        <span className="text-[13px] font-semibold text-primary tabular-nums">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex items-center justify-between text-[10.5px] text-muted-foreground mt-1">
        <span>0%</span>
        {affectedTenants != null && affected != null && affected > 0 && (
          <span className="tabular-nums">
            ~{affectedTenants} of {affected} tenants
          </span>
        )}
        <span>100%</span>
      </div>
    </div>
  )
}
