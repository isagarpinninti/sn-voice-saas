export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isUserAdmin } from '@/lib/admin'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Section } from '@/components/ui/section'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, PhoneCall, Cpu, Wrench } from 'lucide-react'

export default async function UsagePage() {
  const session = await auth()
  if (!isUserAdmin(session)) redirect('/dashboard')

  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400_000)
  ninetyDaysAgo.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [all90, mtdByTenant] = await Promise.all([
    db.usageLog.findMany({
      where: { date: { gte: ninetyDaysAgo } },
      orderBy: { date: 'asc' },
    }),
    db.usageLog.groupBy({
      by: ['tenantId'],
      where: { date: { gte: monthStart } },
      _sum: { minutes: true, calls: true, inputTokens: true, outputTokens: true, toolCalls: true },
    }),
  ])

  // Totals (MTD)
  const mtd = all90.filter((l) => new Date(l.date) >= monthStart)
  const totalMin = mtd.reduce((s, l) => s + l.minutes, 0)
  const totalCalls = mtd.reduce((s, l) => s + l.calls, 0)
  const totalTokens = mtd.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0)
  const totalTools = mtd.reduce((s, l) => s + l.toolCalls, 0)

  // 90-day daily totals
  const byDay = new Map<string, number>()
  for (const l of all90) {
    const d = new Date(l.date)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    byDay.set(key, (byDay.get(key) || 0) + l.minutes)
  }

  // Build a 13-week grid (91 days): each week is a column of 7 days (Sun..Sat),
  // most recent week on the right.
  type Cell = { date: string; minutes: number }
  const cells: Cell[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - 90)
  // Align start to Sunday (0)
  start.setDate(start.getDate() - start.getDay())
  for (let i = 0; i <= 97; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    if (d > today) break
    const key = d.toISOString().slice(0, 10)
    cells.push({ date: key, minutes: byDay.get(key) || 0 })
  }
  const maxMin = Math.max(...cells.map((c) => c.minutes), 0.0001)

  function intensity(mins: number): string {
    if (mins === 0) return 'bg-muted/30'
    const ratio = mins / maxMin
    if (ratio < 0.15) return 'bg-primary/20'
    if (ratio < 0.35) return 'bg-primary/40'
    if (ratio < 0.6) return 'bg-primary/65'
    if (ratio < 0.85) return 'bg-primary/85'
    return 'bg-primary'
  }

  // Top 10 tenants by minutes MTD
  const topTenantIds = mtdByTenant
    .map((r) => ({ id: r.tenantId, mins: r._sum.minutes || 0, calls: r._sum.calls || 0 }))
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 10)
  const topIds = topTenantIds.map((t) => t.id)
  const topTenantInfo = topIds.length
    ? await db.tenant.findMany({
        where: { id: { in: topIds } },
        select: {
          id: true,
          plan: true,
          company: true,
          minutes_per_month: true,
          user: { select: { email: true, name: true } },
        },
      })
    : []
  const tenantMap = new Map(topTenantInfo.map((t) => [t.id, t]))
  const topTotal = topTenantIds.reduce((s, t) => s + t.mins, 0) || 1

  // Columns are weeks (Sun-origin). Group cells into 7-day columns.
  const weeks: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Usage"
        description="Platform-wide voice minute consumption. 90-day heatmap and top tenants this month."
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Minutes (MTD)" value={totalMin.toFixed(0)} sub="across all tenants" icon={Clock} accent />
        <StatCard label="Calls (MTD)" value={totalCalls.toLocaleString()} sub="this month" icon={PhoneCall} />
        <StatCard
          label="Tokens (MTD)"
          value={totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + 'K' : totalTokens.toString()}
          sub="input + output"
          icon={Cpu}
        />
        <StatCard label="Tool calls (MTD)" value={totalTools.toLocaleString()} sub="ServiceNow ops" icon={Wrench} />
      </div>

      {/* Heatmap */}
      <Section title="13-week activity" description="Each square is one day. Darker = more minutes. Hover for details.">
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <div className="flex gap-[3px]" style={{ minWidth: '520px' }}>
              {/* Day-of-week labels */}
              <div className="flex flex-col gap-[3px] pr-2 text-[9px] text-muted-foreground/60 tracking-widest uppercase">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                  <span key={d} className="h-3 leading-3" style={{ visibility: i % 2 === 0 ? 'visible' : 'hidden' }}>
                    {d}
                  </span>
                ))}
              </div>

              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {Array.from({ length: 7 }).map((_, di) => {
                    const cell = week[di]
                    if (!cell) return <div key={di} className="w-3 h-3" />
                    return (
                      <div
                        key={di}
                        title={`${cell.date} — ${cell.minutes.toFixed(1)} min`}
                        className={`w-3 h-3 rounded-[2.5px] ${intensity(cell.minutes)} transition-colors`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-5 text-[10px] text-muted-foreground/70">
              <span>Less</span>
              <span className="w-3 h-3 rounded-[2.5px] bg-muted/30" />
              <span className="w-3 h-3 rounded-[2.5px] bg-primary/20" />
              <span className="w-3 h-3 rounded-[2.5px] bg-primary/40" />
              <span className="w-3 h-3 rounded-[2.5px] bg-primary/65" />
              <span className="w-3 h-3 rounded-[2.5px] bg-primary/85" />
              <span className="w-3 h-3 rounded-[2.5px] bg-primary" />
              <span>More</span>
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* Top tenants */}
      <div className="mt-8">
        <Section
          title="Top tenants this month"
          description={`${mtdByTenant.length} tenant${mtdByTenant.length === 1 ? '' : 's'} with activity.`}
        >
          <Card>
            <CardContent className="p-0">
              {topTenantIds.length === 0 ? (
                <p className="p-8 text-center text-[13px] text-muted-foreground">No usage this month yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {topTenantIds.map((row, idx) => {
                    const t = tenantMap.get(row.id)
                    const pct = (row.mins / topTotal) * 100
                    const limit = t?.minutes_per_month || 0
                    const limitPct = limit > 0 ? Math.min(100, (row.mins / limit) * 100) : 0
                    return (
                      <div key={row.id} className="px-5 py-3.5 hover:bg-accent/20 transition-colors">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-[11px] font-mono text-muted-foreground/60 w-5 tabular-nums">
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <Link
                                href={`/admin/tenants/${row.id}`}
                                className="text-[13px] font-medium text-foreground hover:text-primary transition-colors truncate block"
                              >
                                {t?.company || t?.user?.name || t?.user?.email || row.id}
                              </Link>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {t?.plan} · {t?.user?.email}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[13px] font-semibold text-foreground tabular-nums">
                              {row.mins.toFixed(1)} min
                            </p>
                            <p className="text-[10.5px] text-muted-foreground tabular-nums">
                              {row.calls.toLocaleString()} calls · {pct.toFixed(1)}% of top 10
                            </p>
                          </div>
                        </div>
                        {limit > 0 && (
                          <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${limitPct >= 90 ? 'bg-destructive' : limitPct >= 70 ? 'bg-amber-400' : 'bg-primary'}`}
                              style={{ width: `${limitPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}
