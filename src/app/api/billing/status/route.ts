export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ plan: 'FREE' })

  return NextResponse.json({
    plan: tenant.plan,
    minutes_per_month: tenant.minutes_per_month,
    concurrent_limit: tenant.concurrent_limit,
    max_agents: tenant.max_agents,
    subscription_id: tenant.subscription_id,
    plan_expires_at: tenant.plan_expires_at,
  })
}
