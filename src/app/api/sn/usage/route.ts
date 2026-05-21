/**
 * ServiceNow → SaaS usage stats API.
 *
 * GET /api/sn/usage              — tenant-level stats (calls, minutes, limit, percent)
 * GET /api/sn/usage?sn_agent_id= — same but with per-agent breakdown in `agent` key
 *
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

  const base = {
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
  }

  // Optional: per-agent stats when SN scheduled job queries for a specific agent
  const { searchParams } = new URL(req.url)
  const snAgentId = (searchParams.get('sn_agent_id') || '').trim()
  if (snAgentId) {
    const agent = await db.agent.findFirst({
      where: { tenantId: auth.tenantId, snAgentId },
      select: {
        id: true,
        totalCalls: true,
        totalMinutes: true,
        lastCallAt: true,
      },
    })
    // Include the assigned phone number so the SN scheduled job can write it back
    let phoneE164: string | null = null
    if (agent) {
      const phone = await db.phoneNumber.findFirst({
        where: { agentId: agent.id, active: true },
        select: { e164: true },
      })
      phoneE164 = phone?.e164 ?? null
    }
    return NextResponse.json({
      ...base,
      agent: agent
        ? {
            calls: agent.totalCalls,
            minutes: Math.round(agent.totalMinutes * 100) / 100,
            lastCallAt: agent.lastCallAt?.toISOString() ?? null,
            phone_number: phoneE164,
          }
        : null,
    })
  }

  return NextResponse.json(base)
}
