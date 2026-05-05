export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHONE_ELIGIBLE_PLANS } from '@/lib/plans'

// Customer-facing, tenant-scoped READ of PhoneNumber rows.
// Provisioning still happens admin-side via /api/admin/phone-numbers.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, plan: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const planEligible = PHONE_ELIGIBLE_PLANS.has(tenant.plan)

  const phoneNumbers = await db.phoneNumber.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      e164: true,
      friendly: true,
      active: true,
      createdAt: true,
      instance: { select: { id: true, name: true, snInstanceUrl: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ phoneNumbers, planEligible, plan: tenant.plan })
}
