export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { normalizeUpdateInput } from '@/lib/allowed-callers'

type Ctx = { params: Promise<{ id: string }> }

async function ownedCaller(userId: string, callerId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId }, select: { id: true } })
  if (!tenant) return null
  const caller = await db.allowedCaller.findUnique({ where: { id: callerId } })
  if (!caller || caller.tenantId !== tenant.id) return null
  return { tenant, caller }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const found = await ownedCaller(session.user.id, id)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  // PATCH allows partial updates — re-validate only the supplied keys.
  const parsed = normalizeUpdateInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const updated = await db.allowedCaller.update({ where: { id }, data: parsed })
    await logAudit({
      tenantId: found.tenant.id,
      actorId: session.user.id,
      actorType: 'user',
      action: 'allowlist.caller.updated',
      targetType: 'AllowedCaller',
      targetId: id,
      metadata: { changed: Object.keys(parsed) },
    })
    return NextResponse.json({ caller: updated })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Another entry with that phone number already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const found = await ownedCaller(session.user.id, id)
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.allowedCaller.delete({ where: { id } })
  await logAudit({
    tenantId: found.tenant.id,
    actorId: session.user.id,
    actorType: 'user',
    action: 'allowlist.caller.deleted',
    targetType: 'AllowedCaller',
    targetId: id,
    metadata: { phoneE164: found.caller.phoneE164 },
  })
  return NextResponse.json({ ok: true })
}
