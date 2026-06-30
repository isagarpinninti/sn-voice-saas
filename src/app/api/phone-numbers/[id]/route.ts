export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

// Tenant can update: agentId, friendly name, active status.
// They cannot change e164, provider, or tenantId.
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const phone = await db.phoneNumber.findFirst({ where: { id, tenantId: tenant.id } })
  if (!phone) return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (body.agentId !== undefined) {
    // Verify agent belongs to this tenant
    if (body.agentId) {
      const agent = await db.agent.findFirst({ where: { id: body.agentId, tenantId: tenant.id } })
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    data.agentId = body.agentId || null
  }
  if (typeof body.friendly === 'string') data.friendly = body.friendly || null
  if (typeof body.active === 'boolean') data.active = body.active

  const updated = await db.phoneNumber.update({ where: { id }, data })
  return NextResponse.json({ success: true, phoneNumber: updated })
}
