'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { UserRoundCog, ShieldOff, Save } from 'lucide-react'

const PLAN_OPTIONS = ['FREE', 'STARTER', 'PRO', 'PRO_VOICE', 'BUSINESS', 'ENTERPRISE'] as const

type Props = {
  tenantId: string
  userId: string
  currentPlan: string
  currentMinutes: number
}

export function TenantActions({ tenantId, userId, currentPlan, currentMinutes }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [plan, setPlan] = useState(currentPlan)
  const [minutes, setMinutes] = useState(currentMinutes)
  const [busy, setBusy] = useState(false)

  const dirty = plan !== currentPlan || minutes !== currentMinutes

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan, minutes_per_month: minutes }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(err.error || 'Update failed', 'error')
        return
      }
      toast('Tenant updated', 'success')
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
              {p}
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
