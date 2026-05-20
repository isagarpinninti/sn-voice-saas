'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { UserRoundCog, ShieldOff, Save } from 'lucide-react'

// Active sellable plans first, legacy enum values after the divider so admins
// can still see/migrate tenants on old tiers.
const PLAN_OPTIONS = ['FREE', 'PRO', 'PREMIUM', 'STARTER', 'PRO_VOICE', 'BUSINESS', 'ENTERPRISE'] as const
const LEGACY_PLANS = new Set(['STARTER', 'PRO_VOICE', 'BUSINESS', 'ENTERPRISE'])

type Props = {
  tenantId: string
  userId: string
  currentPlan: string
  currentMinutes: number
  currentExpiresAt?: string | null
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

export function TenantActions({ tenantId, userId, currentPlan, currentMinutes, currentExpiresAt }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [plan, setPlan] = useState(currentPlan)
  const [minutes, setMinutes] = useState(currentMinutes)
  const [expiresAt, setExpiresAt] = useState<string>(toInputDate(currentExpiresAt))
  const [busy, setBusy] = useState(false)

  const dirty =
    plan !== currentPlan ||
    minutes !== currentMinutes ||
    expiresAt !== toInputDate(currentExpiresAt)

  async function save() {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { plan, minutes_per_month: minutes }
      // Send expiry date — null clears it (permanent access on selected plan)
      body.plan_expires_at = expiresAt ? new Date(expiresAt).toISOString() : null

      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(err.error || 'Update failed', 'error')
        return
      }
      toast('Subscription updated', 'success')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function impersonate() {
    const ok = await confirm({
      title: 'Impersonate this user?',
      description: 'You will log in as this user. All actions will be audited.',
      confirmLabel: 'Impersonate',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast('Impersonation failed: ' + (err.error || res.status), 'error')
        return
      }
      window.location.href = '/dashboard'
    } finally {
      setBusy(false)
    }
  }

  async function suspend() {
    const ok = await confirm({
      title: 'Suspend tenant?',
      description: 'Setting plan to FREE and zeroing minutes will prevent new calls. This is reversible.',
      confirmLabel: 'Suspend',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'FREE', minutes_per_month: 0 }),
      })
      if (!res.ok) {
        toast('Suspend failed', 'error')
        return
      }
      toast('Tenant suspended', 'success')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium mb-1.5">
          Plan
        </label>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          disabled={busy}
          className="h-9 px-3 rounded-md bg-card border border-border text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        >
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}{LEGACY_PLANS.has(p) ? ' (legacy)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium mb-1.5">
          Minutes / month
        </label>
        <input
          type="number"
          min={0}
          value={minutes}
          onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
          disabled={busy}
          className="h-9 w-28 px-3 rounded-md bg-card border border-border text-[13px] text-foreground tabular-nums focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div>
        <label className="block text-[10px] text-muted-foreground/70 uppercase tracking-widest font-medium mb-1.5">
          Access expires
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={busy}
            className="h-9 px-3 rounded-md bg-card border border-border text-[13px] text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          {expiresAt && (
            <button
              type="button"
              onClick={() => setExpiresAt('')}
              disabled={busy}
              title="Clear — grant permanent access"
              className="h-9 px-2 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Never
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          {expiresAt ? `Expires ${new Date(expiresAt).toLocaleDateString()}` : 'No expiry — permanent access'}
        </p>
      </div>
      <Button onClick={save} disabled={!dirty || busy} size="sm">
        <Save className="w-3.5 h-3.5 mr-1.5" />
        {busy ? 'Saving…' : 'Save'}
      </Button>
      <Button onClick={impersonate} disabled={busy} size="sm" variant="outline">
        <UserRoundCog className="w-3.5 h-3.5 mr-1.5" />
        Impersonate
      </Button>
      <Button onClick={suspend} disabled={busy} size="sm" variant="outline" className="text-destructive hover:bg-destructive/10 hover:border-destructive/40">
        <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
        Suspend
      </Button>
    </div>
  )
}
