export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getPlan } from '@/lib/plans-db'

/**
 * Plan upgrade/downgrade — no payment required.
 * Applies the selected plan immediately and sets a 1-year expiry.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { plan } = body

  const validPlans = ['FREE', 'PRO', 'PREMIUM'] as const
  if (!validPlans.includes(plan as any)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const target = await getPlan(plan)

  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      plan,
      minutes_per_month: target?.minutesPerMonth ?? tenant.minutes_per_month,
      concurrent_limit: target?.concurrentLimit ?? tenant.concurrent_limit,
      max_agents: target?.maxAgents ?? tenant.max_agents,
      max_instances: target?.maxInstances ?? tenant.max_instances,
      // FREE plan: clear expiry (it's the baseline). Paid plans: 1-year access.
      plan_expires_at: plan === 'FREE' ? null : oneYearFromNow,
      subscription_id: null,
    },
  })

  const planNames: Record<string, string> = { FREE: 'Free', PRO: 'Pro', PREMIUM: 'Premium' }
  return NextResponse.json({
    message: plan === 'FREE'
      ? 'Switched to Free plan'
      : `Upgraded to ${planNames[plan] ?? plan} — enjoy your new plan!`,
  })
}
