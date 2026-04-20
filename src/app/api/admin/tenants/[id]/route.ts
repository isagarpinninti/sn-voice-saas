export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isUserAdmin } from '@/lib/admin'
import { logAudit } from '@/lib/audit'
import { getPlan } from '@/lib/plans-db'
import { Plan } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_PLANS = new Set<Plan>(['FREE', 'STARTER', 'PRO', 'PRO_VOICE', 'BUSINESS', 'ENTERPRISE'])

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await ctx.params

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
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ tenant })
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))

  const before = await db.tenant.findUnique({ where: { id } })
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (typeof body.plan === 'string') {
    if (!VALID_PLANS.has(body.plan as Plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }
    data.plan = body.plan as Plan
    // When changing plan, refresh the limits from PlanDefinition so the tenant
    // row matches the authoritative plan. Fall back to existing values.
    const def = await getPlan(body.plan as Plan)
    if (def) {
      data.minutes_per_month = def.minutesPerMonth
      data.concurrent_limit = def.concurrentLimit
      data.max_agents = def.maxAgents
      data.max_instances = def.maxInstances
    }
  }

  if (typeof body.minutes_per_month === 'number') data.minutes_per_month = body.minutes_per_month
  if (typeof body.concurrent_limit === 'number') data.concurrent_limit = body.concurrent_limit
  if (typeof body.max_agents === 'number') data.max_agents = body.max_agents
  if (typeof body.max_instances === 'number') data.max_instances = body.max_instances
  if (body.plan_expires_at === null || typeof body.plan_expires_at === 'string') {
    data.plan_expires_at = body.plan_expires_at ? new Date(body.plan_expires_at) : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await db.tenant.update({ where: { id }, data })

  await logAudit({
    tenantId: id,
    actorId: session?.user?.id,
    actorType: 'admin',
    action: 'tenant.update',
    targetType: 'Tenant',
    targetId: id,
    metadata: {
      changed: Object.keys(data),
      before: {
        plan: before.plan,
        minutes_per_month: before.minutes_per_month,
        concurrent_limit: before.concurrent_limit,
      },
      after: {
        plan: updated.plan,
        minutes_per_month: updated.minutes_per_month,
        concurrent_limit: updated.concurrent_limit,
      },
    },
  })

  return NextResponse.json({ tenant: updated })
}
