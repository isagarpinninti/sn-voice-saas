export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const { id } = await ctx.params

  const row = await db.chatSession.findFirst({
    where: { sessionId: id, tenantId: tenant.id },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let agentName: string | null = null
  if (row.agentId) {
    const agent = await db.agent.findUnique({ where: { id: row.agentId }, select: { name: true } })
    agentName = agent?.name || null
  }

  return NextResponse.json({
    id: row.id,
    sessionId: row.sessionId,
    agentId: row.agentId,
    agentName,
    snUserId: row.snUserId || null,
    history: row.history,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  })
}
