import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHONE_ELIGIBLE_PLANS } from '@/lib/plans'
import { getPlan } from '@/lib/plans-db'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Section } from '@/components/ui/section'
import { buttonVariants } from '@/components/ui/button'
import { Crown, Clock, PhoneCall, Cpu, Code, BarChart3, CreditCard, Phone, Sparkles, ArrowRight } from 'lucide-react'
import Link from 'next/link'

// Inline SVG sparkline — last `points.length` data points scaled into a 120x32 box.
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 120
  const h = 28
  const max = Math.max(...points, 0.0001)
  const step = w / (points.length - 1)
  const coords = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7 mt-3 overflow-visible" aria-hidden="true">
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary/70"
      />
    </svg>
  )
}

export default async function DashboardOverview() {
  const session = await auth()
  if (!session?.user?.id) return null

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      tokens: { where: { active: true }, take: 1 },
      usageLogs: { orderBy: { date: 'desc' } },
      instances: { where: { active: true }, take: 1 },
      agents: { where: { active: true }, take: 1 },
    },
  })

  if (!tenant) return <p className="text-sm text-muted-foreground">Setting up your account...</p>

  // First-run onboarding: redirect users with no instance AND no agent to the wizard.
  const noInstance = tenant.instances.length === 0
  const noAgent = tenant.agents.length === 0
  if (noInstance && noAgent && tenant.usageLogs.length === 0) {
    const { redirect } = await import('next/navigation')
    redirect('/dashboard/onboarding')
  }

  const planRecord = await getPlan(tenant.plan)
  const plan = {
    name: planRecord?.name ?? tenant.plan,
    price: planRecord?.price ?? 0,
  }
  const isFree = tenant.plan === 'FREE'

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const relevantLogs = isFree
    ? tenant.usageLogs
    : tenant.usageLogs.filter(l => new Date(l.date) >= monthStart)

  const calls = relevantLogs.reduce((s, l) => s + l.calls, 0)
  const minutes = relevantLogs.reduce((s, l) => s + l.minutes, 0)
  const tokens = relevantLogs.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0)
  const limit = tenant.minutes_per_month
  const pct = Math.min(100, Math.round((minutes / limit) * 100))
  const hasUsage = tenant.usageLogs.length > 0

  // 14-day sparkline
  const sparkData: number[] = []
  if (hasUsage) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const byDate = new Map<string, number>()
    for (const l of tenant.usageLogs) {
      const d = new Date(l.date)
      d.setHours(0, 0, 0, 0)
      const key = d.toISOString().slice(0, 10)
      byDate.set(key, (byDate.get(key) || 0) + l.minutes)
    }
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      sparkData.push(byDate.get(d.toISOString().slice(0, 10)) || 0)
    }
  }

  // Recent activity rows (last 5 days, newest first)
  type Row = { date: string; calls: number; minutes: string }
  const recentRows: Row[] = tenant.usageLogs.slice(0, 5).map(l => ({
    date: new Date(l.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: l.calls,
    minutes: l.minutes.toFixed(1),
  }))
  const recentColumns: DataTableColumn<Row>[] = [
    { key: 'date', label: 'Date', width: '120px' },
    { key: 'calls', label: 'Calls', align: 'right' },
    { key: 'minutes', label: 'Minutes', align: 'right' },
  ]

  const showPhoneTeaser = !PHONE_ELIGIBLE_PLANS.has(tenant.plan)

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Overview"
        description={`Welcome back${session.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}. Here's how your voice agent is doing.`}
      />

      {/* Phone calls teaser (tenants without phone-eligible plan) */}
      {showPhoneTeaser && (
        <div className="relative mb-10 overflow-hidden rounded-xl border border-indigo-400/20 bg-card/40">
          <div
            className="absolute inset-0 opacity-80 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 40% 80% at 0% 50%, rgba(99, 102, 241, 0.16), transparent 60%), radial-gradient(ellipse 40% 80% at 100% 50%, rgba(16, 185, 129, 0.10), transparent 60%)',
            }}
          />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg border border-indigo-400/30 bg-indigo-400/[0.08] flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-indigo-300" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[13px] font-semibold text-foreground">Phone calls are included with Premium</p>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-indigo-400/30 bg-indigo-400/[0.08] text-indigo-300 tracking-wider uppercase font-semibold">
                    Premium
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Dedicated inbound number, same agent as the widget. Upgrade to Premium to provision your number.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-foreground text-background text-[12px] font-medium hover:bg-foreground/90 transition-colors shrink-0"
            >
              <Sparkles className="w-3 h-3" />
              Upgrade to Premium
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Empty state for first-run tenants */}
      {!hasUsage && (
        <div className="mb-10">
          <EmptyState
            icon={PhoneCall}
            title="No calls yet"
            description="Create your first agent and embed its widget on a website or ServiceNow portal to start collecting voice conversations."
            action={
              <Link href="/dashboard/agents" className={buttonVariants({ size: 'sm' })}>
                Manage agents
              </Link>
            }
          />
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard
          label="Plan"
          value={plan.name}
          sub={isFree ? 'One-time trial' : `$${plan.price}/mo`}
          icon={Crown}
          accent
        />
        <StatCard
          label="Minutes used"
          value={minutes.toFixed(1)}
          sub={isFree ? `of ${limit} total` : `of ${limit} this month`}
          icon={Clock}
        >
          {hasUsage && <Sparkline points={sparkData} />}
        </StatCard>
        <StatCard
          label="Calls"
          value={calls.toLocaleString()}
          sub={isFree ? 'total' : 'this month'}
          icon={PhoneCall}
        />
        <StatCard
          label="Tokens"
          value={tokens > 1000 ? (tokens / 1000).toFixed(1) + 'K' : tokens.toString()}
          sub="input + output"
          icon={Cpu}
        />
      </div>

      {/* Usage progress (only with usage) */}
      {hasUsage && (
        <Card className="mb-10">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium text-foreground">
                {isFree ? 'Trial usage' : 'Monthly minutes'}
              </span>
              <span className="text-[12px] text-muted-foreground tabular-nums">
                {minutes.toFixed(1)} / {limit} min{isFree ? ' (one-time)' : ''}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${pct > 80 ? 'bg-amber-500' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {isFree && pct >= 100 && (
              <p className="text-[11px] text-amber-400 mt-2">
                Free trial exhausted —{' '}
                <Link href="/dashboard/billing" className="underline hover:text-amber-300">
                  upgrade to Pro
                </Link>{' '}
                for 500 min/month
              </p>
            )}
            {!isFree && pct > 80 && (
              <p className="text-[11px] text-amber-400 mt-2">
                Approaching limit —{' '}
                <Link href="/dashboard/billing" className="underline hover:text-amber-300">
                  upgrade
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      {hasUsage && (
        <div className="mb-10">
          <Section
            title="Recent activity"
            description="Last 5 days of voice activity."
            actions={
              <Link
                href="/dashboard/usage"
                className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                View all →
              </Link>
            }
          >
            <DataTable columns={recentColumns} rows={recentRows} />
          </Section>
        </div>
      )}

      {/* Quick actions */}
      <Section title="Quick actions" description="Jump to the things you'll do most.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/dashboard/agents" className="block group">
            <Card className="h-full hover:border-border/80 transition-colors">
              <CardContent className="p-5">
                <div className="w-8 h-8 rounded-md bg-muted/60 border border-border flex items-center justify-center mb-3 group-hover:border-primary/40 transition-colors">
                  <Code className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-[13px] font-semibold text-foreground mb-0.5">Manage agents</p>
                <p className="text-[12px] text-muted-foreground">Create agents and grab embed codes.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/usage" className="block group">
            <Card className="h-full hover:border-border/80 transition-colors">
              <CardContent className="p-5">
                <div className="w-8 h-8 rounded-md bg-muted/60 border border-border flex items-center justify-center mb-3 group-hover:border-primary/40 transition-colors">
                  <BarChart3 className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-[13px] font-semibold text-foreground mb-0.5">View analytics</p>
                <p className="text-[12px] text-muted-foreground">Detailed usage and conversation data.</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/billing" className="block group">
            <Card className="h-full hover:border-border/80 transition-colors">
              <CardContent className="p-5">
                <div className="w-8 h-8 rounded-md bg-muted/60 border border-border flex items-center justify-center mb-3 group-hover:border-primary/40 transition-colors">
                  <CreditCard className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-[13px] font-semibold text-foreground mb-0.5">Manage plan</p>
                <p className="text-[12px] text-muted-foreground">{isFree ? 'Upgrade for more minutes' : 'View billing details'}.</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </Section>
    </div>
  )
}
