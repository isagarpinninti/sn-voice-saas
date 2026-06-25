export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Section } from '@/components/ui/section'
import { StatCard } from '@/components/ui/stat-card'
import { TenantActions } from '@/components/admin/tenant-actions'
import { ArrowLeft, Clock, PhoneCall, Bot, Link2, CheckCircle2, XCircle, Calendar } from 'lucide-react'

type Props = { params: Promise<{ id: string }> }

export default async function TenantDetailPage({ params }: Props) {
  const session = await auth()
  if (!isUserAdmin(session)) redirect('/dashboard')

  const { id } = await params

  const tenant = await db.tenant.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, createdAt: true } },
      instances: { orderBy: { createdAt: 'asc' } },
      agents: { orderBy: { createdAt: 'asc' } },
      tokens: { where: { active: true } },
      usageLogs: { orderBy: { date: 'desc' }, take: 90 },
    },
  })
  if (!tenant) notFound()

  const auditEvents = await db.auditLog.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: 'desc' },
    take: 15,
  })

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthLogs = tenant.usageLogs.filter((l) => new Date(l.date) >= monthStart)
  const mtdMinutes = monthLogs.reduce((s, l) => s + l.minutes, 0)
  const mtdCalls = monthLogs.reduce((s, l) => s + l.calls, 0)
  const mtdTokens = monthLogs.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0)
  const lastActive = tenant.usageLogs[0]?.date

  // 30-day daily minutes sparkline
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const byDate = new Map<string, number>()
  for (const l of tenant.usageLogs) {
    const d = new Date(l.date)
    d.setHours(0, 0, 0, 0)
    byDate.set(d.toISOString().slice(0, 10), (byDate.get(d.toISOString().slice(0, 10)) || 0) + l.minutes)
  }
  const days: { date: string; minutes: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, minutes: byDate.get(key) || 0 })
  }
  const maxMin = Math.max(...days.map((d) => d.minutes), 0.0001)

  return (
    <div className="animate-fade-up">
      <Link
        href="/admin/tenants"
        className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All tenants
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8 pb-6 border-b border-border">
        <div className="flex items-center gap-4">
          {tenant.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.user.image} alt="" className="w-12 h-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-primary text-[16px] font-semibold">
              {(tenant.user.name || tenant.user.email || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-foreground truncate">
                {tenant.company || tenant.user.name || tenant.user.email}
              </h1>
              <Badge variant={tenant.plan === 'FREE' ? 'secondary' : tenant.plan === 'PREMIUM' || tenant.plan === 'ENTERPRISE' ? 'default' : 'success'}>
                {tenant.plan}
              </Badge>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              {tenant.user.email} · joined{' '}
              {tenant.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-[11px] text-muted-foreground/60 font-mono mt-0.5">{tenant.id}</p>
          </div>
        </div>

        <TenantActions
          tenantId={tenant.id}
          userId={tenant.user.id}
          currentPlan={tenant.plan}
          currentMinutes={tenant.minutes_per_month}
        />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard label="MTD minutes" value={mtdMinutes.toFixed(1)} sub={`of ${tenant.minutes_per_month}`} icon={Clock} accent />
        <StatCard label="MTD calls" value={mtdCalls.toLocaleString()} sub="this month" icon={PhoneCall} />
        <StatCard label="Agents" value={tenant.agents.filter((a) => a.active).length.toString()} sub={`of ${tenant.max_agents === -1 ? '∞' : tenant.max_agents}`} icon={Bot} />
        <StatCard label="Instances" value={tenant.instances.filter((i) => i.active).length.toString()} sub={`of ${tenant.max_instances === -1 ? '∞' : tenant.max_instances}`} icon={Link2} />
      </div>

      {/* 30-day chart */}
      <Section title="30-day usage" description={`Daily minutes. ${mtdTokens.toLocaleString()} tokens this month.`}>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-end gap-[2px] h-32">
              {days.map((d) => {
                const h = Math.max(2, (d.minutes / maxMin) * 100)
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.minutes.toFixed(1)} min`}
                    className="flex-1 rounded-sm bg-gradient-to-t from-primary/30 to-primary/80 hover:from-primary/50 hover:to-primary transition-colors"
                    style={{ height: `${h}%` }}
                  />
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground/70 tabular-nums">
              <span>{days[0].date}</span>
              <span>{lastActive ? `last active ${new Date(lastActive).toLocaleDateString()}` : 'no activity yet'}</span>
              <span>{days[days.length - 1].date}</span>
            </div>
          </CardContent>
        </Card>
      </Section>

      <div className="grid lg:grid-cols-2 gap-6 mt-10">
        {/* Instances */}
        <Section title="Instances" description={`${tenant.instances.length} configured`}>
          <Card>
            <CardContent className="p-0">
              {tenant.instances.length === 0 ? (
                <p className="p-5 text-[12px] text-muted-foreground">No ServiceNow instances connected yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {tenant.instances.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{i.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          {i.snInstanceUrl?.replace('https://', '') || 'no url'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {i.active ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-muted-foreground/60" />
                        )}
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          {i.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Section>

        {/* Agents */}
        <Section title="Agents" description={`${tenant.agents.length} configured`}>
          <Card>
            <CardContent className="p-0">
              {tenant.agents.length === 0 ? (
                <p className="p-5 text-[12px] text-muted-foreground">No agents yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {tenant.agents.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">
                          SN: {a.snAgentId || '—'}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-widest ${
                          a.active ? 'text-emerald-400' : 'text-muted-foreground/60'
                        }`}
                      >
                        {a.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Audit trail */}
      <div className="mt-10">
        <Section
          title="Recent activity"
          description="Admin actions, billing events, and impersonations on this tenant."
          actions={
            <Link
              href={`/admin/audit?tenantId=${tenant.id}`}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View full log →
            </Link>
          }
        >
          <Card>
            <CardContent className="p-0">
              {auditEvents.length === 0 ? (
                <p className="p-5 text-[12px] text-muted-foreground">No audit events recorded.</p>
              ) : (
                <div className="divide-y divide-border">
                  {auditEvents.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 p-3.5 text-[12px]">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground">
                          <span className="font-mono text-primary">{e.action}</span>
                          {e.targetType && (
                            <span className="text-muted-foreground">
                              {' '}
                              on {e.targetType}
                              {e.targetId ? ` ${e.targetId.slice(0, 10)}…` : ''}
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground/70 tabular-nums text-[11px] mt-0.5">
                          {new Date(e.createdAt).toLocaleString()}
                          {' · '}
                          {e.actorType}
                        </p>
                      </div>
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
