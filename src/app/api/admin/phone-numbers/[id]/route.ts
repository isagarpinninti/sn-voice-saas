export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!isUserAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const phone = await db.phoneNumber.findUnique({ where: { id } })
  if (!phone) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (typeof body.active === 'boolean') data.active = body.active
  if (typeof body.friendly === 'string') data.friendly = body.friendly || null

  if (body.agentId !== undefined) {
    if (body.agentId) {
      const agent = await db.agent.findFirst({ where: { id: body.agentId, tenantId: phone.tenantId } })
      if (!agent) return NextResponse.json({ error: 'Agent not found or not owned by tenant' }, { status: 400 })
    }
    data.agentId = body.agentId || null
  }

  if (body.instanceId !== undefined) {
    if (body.instanceId) {
      const inst = await db.instance.findFirst({ where: { id: body.instanceId, tenantId: phone.tenantId } })
      if (!inst) return NextResponse.json({ error: 'Instance not found' }, { status: 400 })
    }
    data.instanceId = body.instanceId || null
  }

  const updated = await db.phoneNumber.update({ where: { id }, data })

  await logAudit({
    tenantId: phone.tenantId,
    actorId: session?.user?.id,
    actorType: 'admin',
    action: 'phone.number.updated',
    targetType: 'PhoneNumber',
    targetId: id,
    metadata: { changes: data },
  })

  return NextResponse.json({ success: true, phoneNumber: updated })
}
