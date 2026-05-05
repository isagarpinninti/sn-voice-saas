export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import { PLANS, PlanKey } from '@/lib/plans'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Section } from '@/components/ui/section'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { DollarSign, Users, AlertCircle, Gift, CreditCard } from 'lucide-react'

export default async function SubscriptionsPage() {
  const tenants = await db.tenant.findMany({
    include: {
      user: { select: { name: true, email: true } },
      usageLogs: {
        where: {
          date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Plan groupings
  type Group = {
    plan: string
    label: string
    price: number
    count: number
    tenants: typeof tenants
  }
  // Only the plans defined in PLANS render — legacy enum values (STARTER /
  // PRO_VOICE / BUSINESS / ENTERPRISE) are skipped here. Tenants still on
  // those plans show up in /admin/tenants where admins can migrate them.
  const planOrder: PlanKey[] = ['PREMIUM', 'PRO', 'FREE']
  const groups: Group[] = planOrder
    .filter((p) => PLANS[p])
    .map((p) => {
      const plan = PLANS[p]
      const matching = tenants.filter((t) => t.plan === p)
      return {
        plan: p,
        label: plan.name,
        price: plan.price,
        count: matching.length,
        tenants: matching,
      }
    })
    .filter((g) => g.count > 0)

  // Stats
  const mrr = tenants.reduce((sum, t) => {
    const plan = PLANS[t.plan as PlanKey]
    return sum + (plan?.price ?? 0)
  }, 0)
  const paidCount = tenants.filter((t) => t.plan !== 'FREE').length
  const freeCount = tenants.filter((t) => t.plan === 'FREE').length
  const expiredCount = tenants.filter(
    (t) => t.plan_expires_at && new Date(t.plan_expires_at) < new Date()
  ).length

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Plan distribution, billing state, and usage across all tenants. Read-only — manual plan changes happen via Razorpay/RevenueCat."
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard label="MRR" value={`$${mrr.toLocaleString()}`} sub="monthly recurring" icon={DollarSign} accent />
        <StatCard label="Paid" value={paidCount.toLocaleString()} sub="active subscriptions" icon={CreditCard} />
        <StatCard label="Free" value={freeCount.toLocaleString()} sub="trial / unpaid" icon={Gift} />
        <StatCard label="Expired" value={expiredCount.toLocaleString()} sub="past plan_expires_at" icon={AlertCircle} />
      </div>

      {tenants.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No subscriptions yet"
          description="Subscriptions will appear here once tenants sign up and choose a plan."
        />
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <Section
              key={group.plan}
              title={group.label}
              description={`${group.count} tenant${group.count === 1 ? '' : 's'} · $${group.price}/mo each · $${(group.price * group.count).toLocaleString()} MRR`}
            >
              <Card className="overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Tenant</th>
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Status</th>
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Provider ID</th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Minutes (mo)</th>
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.tenants.map((t) => {
                      const minutes = t.usageLogs.reduce((s, l) => s + l.minutes, 0)
                      const expired = t.plan_expires_at && new Date(t.plan_expires_at) < new Date()
                      const providerId = t.subscription_id || t.revenuecat_id || null
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="text-[12px] font-medium text-foreground truncate">
                              {t.user.name || 'Unnamed'}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">{t.user.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            {expired ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                Expired
                              </span>
                            ) : t.plan === 'FREE' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                                Trial
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                            {providerId ? providerId.substring(0, 24) + (providerId.length > 24 ? '…' : '') : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground tabular-nums">
                            {minutes.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground tabular-nums">
                            {t.plan_expires_at
                              ? new Date(t.plan_expires_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            </Section>
          ))}
        </div>
      )}
    </div>
  )
}
