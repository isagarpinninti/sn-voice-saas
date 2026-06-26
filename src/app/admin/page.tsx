export const dynamic = 'force-dynamic'

import { db } from '@/lib/db'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Section } from '@/components/ui/section'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Users, Building2, CheckCircle2, DollarSign, PhoneCall, FileText, CreditCard, Paintbrush } from 'lucide-react'

export default async function AdminPage() {
  const totalTenants = await db.tenant.count()
  const activeTenants = await db.instance.count({ where: { active: true } })
  const paidTenants = await db.tenant.count({ where: { plan: { not: 'FREE' } } })

  const tenants = await db.tenant.findMany({
    include: {
      user: { select: { name: true, email: true, image: true } },
      instances: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
      tokens: { where: { active: true }, take: 1 },
      usageLogs: { where: { date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Includes legacy plans so MRR isn't understated for tenants still on old tiers.
  const planPrices: Record<string, number> = {
    FREE: 0, PRO: 79, PREMIUM: 199,
    PRO_VOICE: 149, ENTERPRISE: 299, BUSINESS: 0, STARTER: 0,
  }
  const mrr = tenants.reduce((sum, t) => sum + (planPrices[t.plan] || 0), 0)
  const monthCalls = tenants.reduce((s, t) => s + t.usageLogs.reduce((ss, l) => ss + l.calls, 0), 0)

  // Recent tenant rows for the DataTable
  type Row = {
    id: string
    user: React.ReactNode
    plan: React.ReactNode
    instance: React.ReactNode
    minutes: string
    joined: string
  }
  const rows: Row[] = tenants.slice(0, 12).map(t => {
    const mins = t.usageLogs.reduce((s, l) => s + l.minutes, 0)
    return {
      id: t.id,
      user: (
        <div className="flex items-center gap-2.5">
          {t.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.user.image} alt="" className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
              {t.user.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-foreground truncate">{t.user.name || 'Unknown'}</p>
            <p className="text-[10px] text-muted-foreground truncate">{t.user.email}</p>
          </div>
        </div>
      ),
      plan: (
        <Badge
          variant={t.plan === 'PREMIUM' || t.plan === 'ENTERPRISE' ? 'default' : t.plan === 'PRO' || t.plan === 'PRO_VOICE' ? 'success' : 'secondary'}
        >
          {t.plan}
        </Badge>
      ),
      instance: t.instances[0]?.snInstanceUrl ? (
        <span className="text-[11px] text-foreground/80 font-mono">
          {t.instances[0].snInstanceUrl.replace('https://', '').replace('.service-now.com', '')}
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground/60">—</span>
      ),
      minutes: mins.toFixed(1),
      joined: t.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }
  })

  const columns: DataTableColumn<Row>[] = [
    { key: 'user', label: 'User' },
    { key: 'plan', label: 'Plan' },
    { key: 'instance', label: 'Instance' },
    { key: 'minutes', label: 'Minutes', align: 'right' },
    { key: 'joined', label: 'Joined', width: '100px' },
  ]

  return (
    <div>
      <PageHeader
        title="Admin Console"
        description="Operations, platform health, and tenant management."
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        <StatCard label="Tenants" value={totalTenants.toLocaleString()} sub="total accounts" icon={Building2} />
        <StatCard label="Connected" value={activeTenants.toLocaleString()} sub="ServiceNow linked" icon={CheckCircle2} />
        <StatCard label="Paid" value={paidTenants.toLocaleString()} sub="active subscriptions" icon={Users} />
        <StatCard label="MRR" value={`$${mrr.toLocaleString()}`} sub="monthly recurring" icon={DollarSign} accent />
        <StatCard label="Calls" value={monthCalls.toLocaleString()} sub="this month" icon={PhoneCall} />
      </div>

      {/* Quick links */}
      <div className="mb-10">
        <Section title="Manage" description="Jump to the most-used admin operations.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link href="/admin/users" className="block group">
              <Card className="h-full hover:border-border/80 transition-colors">
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-md bg-muted/60 border border-border flex items-center justify-center mb-3 group-hover:border-destructive/40 transition-colors">
                    <Users className="w-4 h-4 text-muted-foreground group-hover:text-destructive transition-colors" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground mb-0.5">Users</p>
                  <p className="text-[12px] text-muted-foreground">Promote or revoke admin access.</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/admin/subscriptions" className="block group">
              <Card className="h-full hover:border-border/80 transition-colors">
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-md bg-muted/60 border border-border flex items-center justify-center mb-3 group-hover:border-destructive/40 transition-colors">
                    <CreditCard className="w-4 h-4 text-muted-foreground group-hover:text-destructive transition-colors" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground mb-0.5">Subscriptions</p>
                  <p className="text-[12px] text-muted-foreground">Plan distribution and billing state.</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/admin/logs" className="block group">
              <Card className="h-full hover:border-border/80 transition-colors">
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-md bg-muted/60 border border-border flex items-center justify-center mb-3 group-hover:border-destructive/40 transition-colors">
                    <FileText className="w-4 h-4 text-muted-foreground group-hover:text-destructive transition-colors" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground mb-0.5">Live Logs</p>
                  <p className="text-[12px] text-muted-foreground">Real-time pipeline + SN events.</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/admin/config" className="block group">
              <Card className="h-full hover:border-border/80 transition-colors">
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-md bg-muted/60 border border-border flex items-center justify-center mb-3 group-hover:border-destructive/40 transition-colors">
                    <Paintbrush className="w-4 h-4 text-muted-foreground group-hover:text-destructive transition-colors" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground mb-0.5">Platform Config</p>
                  <p className="text-[12px] text-muted-foreground">Logo, favicon, name, and theme colors.</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </Section>
      </div>

      {/* Recent tenants */}
      <Section
        title="Recent tenants"
        description="The 12 most recently created accounts."
        actions={
          <Link
            href="/admin/tenants"
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            View all →
          </Link>
        }
      >
        <DataTable columns={columns} rows={rows} />
      </Section>
    </div>
  )
}
