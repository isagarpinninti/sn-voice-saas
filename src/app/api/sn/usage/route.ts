/**
 * ServiceNow → SaaS usage stats API.
 *
 * GET /api/sn/usage — returns current-month and last-30-day usage for the tenant.
 * Auth: Bearer <instance API key>
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateSnRequest } from '@/lib/sn-auth'

export async function GET(req: Request) {
  const auth = await authenticateSnRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { id: auth.tenantId },
    select: { minutes_per_month: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Aggregate current-month usage
  const rows = await db.usageLog.findMany({
    where: {
      tenantId: auth.tenantId,
      date: { gte: monthStart, lt: monthEnd },
    },
    select: { calls: true, minutes: true },
  })

  const calls = rows.reduce((s, r) => s + r.calls, 0)
  const minutes = rows.reduce((s, r) => s + r.minutes, 0)
  const limit = tenant.minutes_per_month
  const percent = limit > 0 ? Math.round((minutes / limit) * 1000) / 10 : 0

  // Last 7 days breakdown
  const since7 = new Date(now)
  since7.setDate(since7.getDate() - 6)
  const recent = await db.usageLog.findMany({
    where: { tenantId: auth.tenantId, date: { gte: since7 } },
    orderBy: { date: 'asc' },
    select: { date: true, calls: true, minutes: true },
  })

  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return NextResponse.json({
    period,
    calls,
    minutes: Math.round(minutes * 100) / 100,
    limit,
    percent,
    recent: recent.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      calls: r.calls,
      minutes: Math.round(r.minutes * 100) / 100,
    })),
  })
}
