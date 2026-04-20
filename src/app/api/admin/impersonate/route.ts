export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { startImpersonation, stopImpersonation } from '@/lib/impersonation'
import { logAudit } from '@/lib/audit'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const realUserId = (session.user as { id: string }).id
  const me = await db.user.findUnique({ where: { id: realUserId }, select: { isAdmin: true } })
  if (!me?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const targetUserId = (body?.targetUserId || '').trim()
  if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })

  try {
    await startImpersonation(realUserId, targetUserId)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to impersonate' }, { status: 400 })
  }

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, name: true, tenant: { select: { id: true } } },
  })

  await logAudit({
    actorId: realUserId,
    actorType: 'admin',
    action: 'impersonation.start',
    targetType: 'User',
    targetId: targetUserId,
    tenantId: target?.tenant?.id,
    metadata: { targetEmail: target?.email },
  })

  return NextResponse.json({ ok: true, target })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const realUserId = (session.user as { id: string }).id
  await stopImpersonation()
  await logAudit({
    actorId: realUserId,
    actorType: 'admin',
    action: 'impersonation.stop',
  })
  return NextResponse.json({ ok: true })
}
