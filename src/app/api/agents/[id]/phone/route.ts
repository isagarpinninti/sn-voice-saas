/**
 * Agent phone number assignment.
 *
 * PUT    /api/agents/[id]/phone  { phoneNumberId } — assign phone to agent
 * DELETE /api/agents/[id]/phone                   — unassign current phone
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

async function resolveOwned(userId: string, agentId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const agent = await db.agent.findFirst({ where: { id: agentId, tenantId: tenant.id } })
  return agent ? { tenant, agent } : null
}

export async function PUT(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const owned = await resolveOwned(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const phoneNumberId = (body?.phoneNumberId || '').trim()
  if (!phoneNumberId) return NextResponse.json({ error: 'phoneNumberId is required' }, { status: 400 })

  // Verify phone belongs to this tenant
  const phone = await db.phoneNumber.findFirst({
    where: { id: phoneNumberId, tenantId: owned.tenant.id },
  })
  if (!phone) return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })

  // Unassign from previous agent if needed (one phone → one agent)
  if (phone.agentId && phone.agentId !== owned.agent.id) {
    await db.phoneNumber.update({ where: { id: phoneNumberId }, data: { agentId: null } })
  }

  // Unassign any existing phone from this agent (one agent → one phone)
  await db.phoneNumber.updateMany({
    where: { agentId: owned.agent.id, id: { not: phoneNumberId } },
    data: { agentId: null },
  })

  // Assign
  await db.phoneNumber.update({ where: { id: phoneNumberId }, data: { agentId: owned.agent.id } })

  return NextResponse.json({ success: true, phoneNumberId })
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const owned = await resolveOwned(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.phoneNumber.updateMany({
    where: { agentId: owned.agent.id },
    data: { agentId: null },
  })

  return NextResponse.json({ success: true })
}
