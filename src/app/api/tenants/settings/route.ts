export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * Tenant settings: company name only.
 * SN connection and widget config are now per-Instance — see /api/instances.
 */

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  return NextResponse.json({
    company: tenant.company || '',
    plan: tenant.plan,
    maxInstances: tenant.max_instances,
    maxAgents: tenant.max_agents,
  })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updateData: Record<string, unknown> = {}
  if (body.company !== undefined) updateData.company = body.company || null

  await db.tenant.update({
    where: { userId: session.user.id },
    data: updateData,
  })

  return NextResponse.json({ success: true })
}
