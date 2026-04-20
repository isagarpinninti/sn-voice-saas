import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PLANS, PlanKey } from '@/lib/plans'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Section } from '@/components/ui/section'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { PhoneCall, Clock, Cpu, MessageSquare, Wrench, BarChart3 } from 'lucide-react'

export default async function UsagePage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: { usageLogs: { orderBy: { date: 'desc' }, take: 30 } },
  })

  if (!tenant) return null

  const plan = PLANS[tenant.plan as PlanKey]
  const thisMonth = tenant.usageLogs.filter(l => {
    const d = new Date(l.date)
    return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear()
  })

  const totalCalls = thisMonth.reduce((s, l) => s + l.calls, 0)
  const totalMinutes = thisMonth.reduce((s, l) => s + l.minutes, 0)
  const totalInputTokens = thisMonth.reduce((s, l) => s + l.inputTokens, 0)
  const totalOutputTokens = thisMonth.reduce((s, l) => s + l.outputTokens, 0)
  const totalToolCalls = thisMonth.reduce((s, l) => s + l.toolCalls, 0)

  const overageCalls = Math.max(0, totalMinutes - tenant.minutes_per_month)
  const overageCost = plan.overageRate ? overageCalls * plan.overageRate : 0

  // ── Usage forecast ──
  // Project end-of-month based on current daily average. Only meaningful for
  // paid plans with a monthly reset; for FREE plan the limit is lifetime.
  const now = new Date()
  const daysElapsed = Math.max(1, now.getDate())
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = daysInMonth - daysElapsed
  const dailyAvg = totalMinutes / daysElapsed
  const projectedTotal = totalMinutes + dailyAvg * daysRemaining
  const limit = tenant.minutes_per_month || plan.minutesPerMonth || 1
  const projectedPct = Math.round((projectedTotal / limit) * 100)
  const willBreach = projectedTotal > limit
  // Estimated breach date if trending over
  let breachDateLabel = ''
  if (willBreach && dailyAvg > 0) {
    const minutesLeft = Math.max(0, limit - totalMinutes)
    const daysUntilBreach = minutesLeft / dailyAvg
    const breachDate = new Date(now.getTime() + daysUntilBreach * 86400_000)
    breachDateLabel = breachDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const hasUsage = tenant.usageLogs.length > 0

  // Build a 14-day series for the bar chart (oldest → newest, zero-filled)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const byDate = new Map<string, { minutes: number; calls: number }>()
  for (const l of tenant.usageLogs) {
    const d = new Date(l.date)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    const existing = byDate.get(key) || { minutes: 0, calls: 0 }
    byDate.set(key, { minutes: existing.minutes + l.minutes, calls: existing.calls + l.calls })
  }
  const series: Array<{ date: string; label: string; minutes: number; calls: number }> = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const stats = byDate.get(key) || { minutes: 0, calls: 0 }
    series.push({
      date: key,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      minutes: stats.minutes,
      calls: stats.calls,
    })
  }
  const maxMinutes = Math.max(...series.map(s => s.minutes), 0.0001)

  // Table rows: 14 most-recent days, newest first
  type Row = { date: string; calls: number; minutes: string; tokens: string }
  const tableRows: Row[] = series
    .slice()
    .reverse()
    .map(s => {
      const log = tenant.usageLogs.find(
        l => new Date(l.date).toISOString().slice(0, 10) === s.date
      )
      const tokens = log ? log.inputTokens + log.outputTokens : 0
      return {
        date: s.label,
        calls: s.calls,
        minutes: s.minutes.toFixed(1),
        tokens: tokens > 1000 ? (tokens / 1000).toFixed(1) + 'K' : String(tokens),
      }
    })

  const columns: DataTableColumn<Row>[] = [
    { key: 'date', label: 'Date', width: '120px' },
    { key: 'calls', label: 'Calls', align: 'right' },
    { key: 'minutes', label: 'Minutes', align: 'right' },
    { key: 'tokens', label: 'Tokens', align: 'right' },
  ]

  return (
    <div>
      <PageHeader
        title="Usage"
        description={`Current billing period — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        <StatCard label="Calls" value={totalCalls.toLocaleString()} sub="this month" icon={PhoneCall} />
        <StatCard
          label="Minutes"
          value={totalMinutes.toFixed(1)}
          sub={`of ${tenant.minutes_per_month}`}
          icon={Clock}
          accent
        />
        <StatCard
          label="Input Tokens"
          value={totalInputTokens > 1000 ? (totalInputTokens / 1000).toFixed(1) + 'K' : String(totalInputTokens)}
          sub="this month"
          icon={Cpu}
        />
        <StatCard
          label="Output Tokens"
          value={totalOutputTokens > 1000 ? (totalOutputTokens / 1000).toFixed(1) + 'K' : String(totalOutputTokens)}
          sub="this month"
          icon={MessageSquare}
        />
        <StatCard label="Tool Calls" value={totalToolCalls.toLocaleString()} sub="this month" icon={Wrench} />
      </div>

      {!hasUsage ? (
        <EmptyState
          icon={BarChart3}
          title="No usage yet"
          description="Once your widget is embedded and your first call completes, daily usage will appear here."
        />
      ) : (
        <>
          {/* Forecast — projects end-of-month based on current daily average */}
          {tenant.plan !== 'FREE' && totalMinutes > 0 && (
            <Card className="mb-8">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium">Month-end forecast</p>
                    <p className="text-[13px] text-foreground mt-1">
                      At your current pace of <span className="font-medium">{dailyAvg.toFixed(1)} min/day</span>, you will use about <span className="font-medium">{projectedTotal.toFixed(0)}</span> of your <span className="font-medium">{limit}</span> minute allowance ({projectedPct}%).
                    </p>
                    {willBreach && breachDateLabel && (
                      <p className="text-[13px] text-amber-600 mt-2">
                        ⚠ Projected to hit your limit on <span className="font-medium">{breachDateLabel}</span>. Consider upgrading to avoid interruption.
                      </p>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${projectedPct > 100 ? 'bg-amber-500' : projectedPct > 80 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                    style={{ width: Math.min(100, projectedPct) + '%' }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Plan + estimated bill */}
          <div className="grid md:grid-cols-2 gap-3 mb-10">
            <Card>
              <CardContent className="p-5">
                <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium mb-2">Current plan</p>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[24px] font-semibold tracking-tight text-foreground">{plan.name}</span>
                  <span className="text-[12px] text-muted-foreground">${plan.price}/mo</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-4">
                  {tenant.minutes_per_month.toLocaleString()} minutes included
                </p>
                <a href="/dashboard/billing" className="text-[12px] text-primary hover:text-primary/80 transition-colors">
                  Upgrade plan →
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium mb-2">Estimated bill</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted-foreground">Plan ({plan.name})</span>
                    <span className="text-foreground tabular-nums">${plan.price.toFixed(2)}</span>
                  </div>
                  {overageCost > 0 && (
                    <div className="flex justify-between text-[12px]">
                      <span className="text-amber-400">Overage ({overageCalls.toFixed(1)} min × ${plan.overageRate})</span>
                      <span className="text-amber-400 tabular-nums">${overageCost.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[13px] font-semibold pt-2 border-t border-border">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground tabular-nums">${(plan.price + overageCost).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily usage chart */}
          <Section title="Last 14 days" description="Daily minutes consumed.">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-end gap-1.5 h-32">
                  {series.map(s => {
                    const h = Math.max(2, (s.minutes / maxMinutes) * 100)
                    return (
                      <div key={s.date} className="flex-1 flex flex-col items-center group">
                        <div className="w-full flex items-end h-full">
                          <div
                            className="w-full rounded-sm bg-primary/40 group-hover:bg-primary transition-colors"
                            style={{ height: `${h}%` }}
                            title={`${s.label}: ${s.minutes.toFixed(1)} min, ${s.calls} calls`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/70">
                  <span>{series[0].label}</span>
                  <span>{series[series.length - 1].label}</span>
                </div>
              </CardContent>
            </Card>
          </Section>

          {/* Daily breakdown table */}
          <div className="mt-10">
            <Section title="Daily breakdown" description="Per-day usage details.">
              <DataTable columns={columns} rows={tableRows} />
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
