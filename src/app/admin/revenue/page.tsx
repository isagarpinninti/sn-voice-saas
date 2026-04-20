export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isUserAdmin } from '@/lib/admin'
import { getPlans } from '@/lib/plans-db'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Section } from '@/components/ui/section'
import { Card, CardContent } from '@/components/ui/card'
import { DollarSign, Users, TrendingUp, TrendingDown, Percent, Sparkles } from 'lucide-react'

const PLAN_COLOR: Record<string, string> = {
  FREE: 'bg-muted-foreground/40',
  STARTER: 'bg-amber-400/70',
  PRO: 'bg-primary',
  PRO_VOICE: 'bg-indigo-400',
  BUSINESS: 'bg-violet-400',
  ENTERPRISE: 'bg-emerald-300',
}

export default async function RevenuePage() {
  const session = await auth()
  if (!isUserAdmin(session)) redirect('/dashboard')

  const plans = await getPlans()
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400_000)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400_000)

  const byPlan = await db.tenant.groupBy({
    by: ['plan'],
    _count: { _all: true },
  })

  const payingActive = await db.tenant.count({
    where: {
      plan: { not: 'FREE' },
      OR: [{ plan_expires_at: null }, { plan_expires_at: { gt: now } }],
    },
  })
  const totalTenants = await db.tenant.count()

  let mrr = 0
  for (const row of byPlan) {
    if (row.plan === 'FREE') continue
    const plan = plans[row.plan]
    if (plan) mrr += (plan.price || 0) * row._count._all
  }
  const arr = mrr * 12
  const arpu = payingActive > 0 ? mrr / payingActive : 0

  const churnedRecent = await db.tenant.count({
    where: {
      plan: { not: 'FREE' },
      plan_expires_at: { gte: thirtyDaysAgo, lt: now },
    },
  })
  const churnedPrior = await db.tenant.count({
    where: {
      plan: { not: 'FREE' },
      plan_expires_at: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
    },
  })
  const churnDelta = churnedPrior > 0 ? ((churnedRecent - churnedPrior) / churnedPrior) * 100 : 0
  const churnRate = payingActive > 0 ? (churnedRecent / payingActive) * 100 : 0

  const newSignups = await db.tenant.count({
    where: { createdAt: { gte: thirtyDaysAgo } },
  })

  // 90-day signup buckets
  const signups = await db.tenant.findMany({
    where: { createdAt: { gte: ninetyDaysAgo } },
    select: { createdAt: true, plan: true },
    orderBy: { createdAt: 'asc' },
  })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const byDay = new Map<string, number>()
  for (const t of signups) {
    const d = new Date(t.createdAt)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    byDay.set(key, (byDay.get(key) || 0) + 1)
  }
  const days: { date: string; count: number }[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, count: byDay.get(key) || 0 })
  }
  const maxCount = Math.max(...days.map((d) => d.count), 1)

  // Recent billing-ish audit events
  const billingEvents = await db.auditLog.findMany({
    where: {
      OR: [
        { action: { startsWith: 'billing.' } },
        { action: { startsWith: 'tenant.plan' } },
        { action: 'tenant.update' },
        { action: 'revenuecat.webhook' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Plan mix bar totals
  const totalForBar = byPlan.reduce((s, r) => s + r._count._all, 0) || 1

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Revenue"
        description="MRR, ARR, churn, and plan mix derived from tenant plans × catalog prices."
      />

      {/* Top stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="MRR"
          value={'$' + mrr.toLocaleString()}
          sub={`${payingActive} paying tenant${payingActive === 1 ? '' : 's'}`}
          icon={DollarSign}
          accent
        />
        <StatCard
          label="ARR (projected)"
          value={'$' + arr.toLocaleString()}
          sub="MRR × 12"
          icon={TrendingUp}
        />
        <StatCard
          label="ARPU"
          value={'$' + arpu.toFixed(0)}
          sub="avg per paying tenant"
          icon={Percent}
        />
        <StatCard
          label="Churn (30d)"
          value={churnRate.toFixed(1) + '%'}
          sub={`${churnedRecent} churned · ${churnDelta >= 0 ? '+' : ''}${churnDelta.toFixed(0)}% vs prior`}
          icon={churnDelta >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Plan mix bar */}
      <Section title="Plan distribution" description={`${totalTenants} total tenants across ${byPlan.length} plan${byPlan.length === 1 ? '' : 's'}.`}>
        <Card>
          <CardContent className="p-5">
            <div className="flex rounded-md overflow-hidden h-3 bg-muted/30 mb-5 border border-border">
              {byPlan.map((row) => {
                const pct = (row._count._all / totalForBar) * 100
                return (
                  <div
                    key={row.plan}
                    className={`${PLAN_COLOR[row.plan] || 'bg-muted'} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${row.plan}: ${row._count._all}`}
                  />
                )
              })}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {byPlan.map((row) => {
                const plan = plans[row.plan]
                const count = row._count._all
                const contribution = plan && row.plan !== 'FREE' ? (plan.price || 0) * count : 0
                const pct = ((count / totalForBar) * 100).toFixed(1)
                return (
                  <div key={row.plan} className="flex items-center gap-3 p-3 rounded-md border border-border bg-card/40">
                    <span className={`w-2.5 h-2.5 rounded-sm ${PLAN_COLOR[row.plan] || 'bg-muted'} shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{plan?.name || row.plan}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {count} · {pct}%
                        {contribution > 0 && <span className="text-foreground"> · ${contribution}/mo</span>}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* 90-day signup chart */}
      <div className="mt-8">
        <Section title="Signups — 90 days" description={`${newSignups} in the last 30 days · ${signups.length} in 90 days.`}>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-end gap-[1px] h-28">
                {days.map((d) => {
                  const h = Math.max(2, (d.count / maxCount) * 100)
                  return (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.count}`}
                      className="flex-1 rounded-sm bg-gradient-to-t from-primary/20 to-primary/70 hover:to-primary transition-colors"
                      style={{ height: `${h}%` }}
                    />
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground/70 tabular-nums">
                <span>{days[0].date}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  peak {maxCount}/day
                </span>
                <span>{days[days.length - 1].date}</span>
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Recent billing events */}
      <div className="mt-8">
        <Section
          title="Recent billing events"
          description="Plan changes, webhook receipts, manual updates."
          actions={
            <Link
              href="/admin/audit?action=billing"
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all →
            </Link>
          }
        >
          <Card>
            <CardContent className="p-0">
              {billingEvents.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-muted-foreground">
                  <Sparkles className="w-4 h-4 mx-auto mb-2 text-muted-foreground/60" />
                  No billing events recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {billingEvents.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-4 px-5 py-3 text-[12.5px]">
                      <div className="min-w-0">
                        <p className="text-foreground">
                          <span className="font-mono text-primary">{e.action}</span>
                          {e.tenantId && (
                            <Link
                              href={`/admin/tenants/${e.tenantId}`}
                              className="ml-2 text-muted-foreground hover:text-foreground transition-colors font-mono text-[11px]"
                            >
                              → {e.tenantId.slice(0, 10)}…
                            </Link>
                          )}
                        </p>
                        {e.metadata != null && (
                          <p className="text-[10.5px] text-muted-foreground/70 mt-0.5 font-mono truncate max-w-[520px]">
                            {JSON.stringify(e.metadata)}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}
