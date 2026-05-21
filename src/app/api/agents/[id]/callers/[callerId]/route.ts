export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { normalizeUpdateInput } from '@/lib/allowed-callers'

type Ctx = { params: Promise<{ id: string; callerId: string }> }

async function resolveOwnedCaller(userId: string, agentId: string, callerId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId }, select: { id: true } })
  if (!tenant) return null
  const agent = await db.agent.findFirst({ where: { id: agentId, tenantId: tenant.id } })
  if (!agent) return null
  const caller = await db.allowedCaller.findUnique({ where: { id: callerId } })
  if (!caller || caller.tenantId !== tenant.id) return null
  return { tenant, agent, caller }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, callerId } = await ctx.params
  const found = await resolveOwnedCaller(session.user.id, id, callerId)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = normalizeUpdateInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const updated = await db.allowedCaller.update({ where: { id: callerId }, data: parsed })
  await logAudit({
    tenantId: found.tenant.id,
    actorId: session.user.id,
    actorType: 'user',
    action: 'allowlist.caller.updated',
    targetType: 'AllowedCaller',
    targetId: callerId,
    metadata: { changed: Object.keys(parsed) },
  })
  return NextResponse.json({ caller: updated })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, callerId } = await ctx.params
  const found = await resolveOwnedCaller(session.user.id, id, callerId)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.allowedCaller.delete({ where: { id: callerId } })
  await logAudit({
    tenantId: found.tenant.id,
    actorId: session.user.id,
    actorType: 'user',
    action: 'allowlist.caller.deleted',
    targetType: 'AllowedCaller',
    targetId: callerId,
    metadata: { phoneE164: found.caller.phoneE164 },
  })
  return NextResponse.json({ ok: true })
}
