export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const url = new URL(req.url)
  const limit  = Math.min(50, parseInt(url.searchParams.get('limit')  || '20'))
  const cursor = url.searchParams.get('cursor') || undefined
  const agentId = url.searchParams.get('agentId') || undefined
  const search  = url.searchParams.get('search')?.trim() || undefined

  const where = {
    tenantId: tenant.id,
    ...(agentId ? { agentId } : {}),
  }

  const rows = await db.chatSession.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      sessionId: true,
      agentId: true,
      snUserId: true,
      history: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
    },
  })

  const hasMore = rows.length > limit
  const page = rows.slice(0, limit)
  const nextCursor = hasMore ? page[page.length - 1].id : null

  // Resolve agent names in one query
  const agentIds = [...new Set(page.map(r => r.agentId).filter(Boolean))]
  const agents = agentIds.length
    ? await db.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })
    : []
  const agentMap = Object.fromEntries(agents.map(a => [a.id, a.name]))

  const sessions = page
    .map(r => {
      const history = (r.history as Array<{ role: string; content: string }>) || []
      const userMessages = history.filter(m => m.role === 'user')
      const lastMsg = history.filter(m => m.role === 'user' || m.role === 'assistant').at(-1)
      return {
        id: r.id,
        sessionId: r.sessionId,
        agentId: r.agentId,
        agentName: agentMap[r.agentId] || null,
        snUserId: r.snUserId || null,
        messageCount: history.length,
        userMessageCount: userMessages.length,
        lastMessage: typeof lastMsg?.content === 'string' ? lastMsg.content.slice(0, 160) : null,
        lastMessageRole: lastMsg?.role || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        expiresAt: r.expiresAt,
      }
    })
    .filter(r => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        r.agentName?.toLowerCase().includes(q) ||
        r.snUserId?.toLowerCase().includes(q) ||
        r.sessionId.toLowerCase().includes(q) ||
        r.lastMessage?.toLowerCase().includes(q)
      )
    })

  return NextResponse.json({ sessions, nextCursor, hasMore })
}
