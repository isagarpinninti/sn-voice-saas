'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Trash2 } from 'lucide-react'

interface Plan {
  id: string
  key: string
  name: string
  price: number
  minutesPerMonth: number
  concurrentLimit: number
  maxAgents: number
  maxInstances: number
  overageRate: number | null
  oneTimeTrial: boolean
  features: string[]
  cta: string
  popular: boolean
  displayOrder: number
  active: boolean
}

const EMPTY: Plan = {
  id: '', key: '', name: '', price: 0, minutesPerMonth: 0,
  concurrentLimit: 1, maxAgents: 1, maxInstances: 1,
  overageRate: null, oneTimeTrial: false, features: [],
  cta: 'Get started', popular: false, displayOrder: 100, active: true,
}

export default function PlansAdminPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [plans, setPlans] = useState<Plan[]>([])
  const [editing, setEditing] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { refresh() }, [])
  async function refresh() {
    const r = await fetch('/api/admin/plans')
    const d = await r.json()
    setPlans(d.plans || [])
  }

  async function save(p: Plan) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      if (!res.ok) { toast('Save failed', 'error'); return }
      toast('Plan saved', 'success')
      setEditing(null)
      refresh()
    } finally { setBusy(false) }
  }

  async function remove(key: string) {
    const ok = await confirm({
      title: 'Delete plan?',
      description: `The "${key}" plan row will be removed. The app will fall back to the hardcoded default for this key.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    await fetch('/api/admin/plans?key=' + encodeURIComponent(key), { method: 'DELETE' })
    toast('Plan deleted', 'success')
    refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription Plans"
        description="Edit the plan names, prices, minute allowances, and feature bullets shown on the landing + billing pages. Changes go live within 60 seconds (cache TTL)."
      />

      <div className="flex items-center gap-2 mb-2">
        <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>Add plan</Button>
      </div>

      <div className="space-y-2">
        {plans.map(p => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[14px]">{p.name}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">{p.key}</span>
                    {p.popular && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded">POPULAR</span>}
                    {!p.active && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">INACTIVE</span>}
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-1">
                    ${p.price}/mo · {p.minutesPerMonth} min/mo · {p.maxAgents === -1 ? '∞' : p.maxAgents} agents · {p.maxInstances === -1 ? '∞' : p.maxInstances} instances
                  </div>
                  <div className="text-[11px] text-muted-foreground/70 mt-1">{p.features.length} feature bullet(s)</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => remove(p.key)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <Section title={editing.id ? 'Edit plan' : 'New plan'}>
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Key (e.g. FREE, PRO)</Label>
                  <Input value={editing.key} onChange={e => setEditing({ ...editing, key: e.target.value.toUpperCase() })} disabled={!!editing.id} />
                </div>
                <div>
                  <Label>Display Name</Label>
                  <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label>Price ($ / month)</Label>
                  <Input type="number" value={editing.price} onChange={e => setEditing({ ...editing, price: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Minutes / month</Label>
                  <Input type="number" value={editing.minutesPerMonth} onChange={e => setEditing({ ...editing, minutesPerMonth: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Concurrent limit</Label>
                  <Input type="number" value={editing.concurrentLimit} onChange={e => setEditing({ ...editing, concurrentLimit: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label>Max Agents (-1 = ∞)</Label>
                  <Input type="number" value={editing.maxAgents} onChange={e => setEditing({ ...editing, maxAgents: parseInt(e.target.value) })} />
                </div>
                <div>
                  <Label>Max Instances (-1 = ∞)</Label>
                  <Input type="number" value={editing.maxInstances} onChange={e => setEditing({ ...editing, maxInstances: parseInt(e.target.value) })} />
                </div>
                <div>
                  <Label>Overage rate ($ / min, blank = none)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.overageRate ?? ''}
                    onChange={e => setEditing({ ...editing, overageRate: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Display order</Label>
                  <Input type="number" value={editing.displayOrder} onChange={e => setEditing({ ...editing, displayOrder: parseInt(e.target.value) || 100 })} />
                </div>
                <div>
                  <Label>CTA button text</Label>
                  <Input value={editing.cta} onChange={e => setEditing({ ...editing, cta: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Features (one per line)</Label>
                <textarea
                  className="w-full mt-1.5 px-3 py-2 rounded-md border border-input bg-background text-[13px] font-mono"
                  rows={8}
                  value={editing.features.join('\n')}
                  onChange={e => setEditing({ ...editing, features: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                />
              </div>

              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={editing.popular} onChange={e => setEditing({ ...editing, popular: e.target.checked })} className="accent-primary" />
                  Highlight as "Popular"
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={editing.oneTimeTrial} onChange={e => setEditing({ ...editing, oneTimeTrial: e.target.checked })} className="accent-primary" />
                  One-time trial (lifetime allowance)
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} className="accent-primary" />
                  Active (show on pricing)
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => save(editing)} disabled={busy || !editing.key.trim()}>
                  {busy ? 'Saving…' : 'Save plan'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </Section>
      )}
    </div>
  )
}
