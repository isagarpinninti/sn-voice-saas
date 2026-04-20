/**
 * Agent embed token — generate a fresh token when an agent has none.
 *
 * POST /api/agents/[id]/token
 *   Creates a new active ApiToken bound to this agent. Used by the dashboard
 *   when the embed snippet shows "No token" (e.g. for legacy agents that
 *   were created before the per-agent token flow, or whose token was revoked).
 *
 *   If the agent already has an active token, returns that one — POST is
 *   idempotent in that case so a double-click can't create duplicate tokens.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function generateEmbedToken() {
  return (
    'sk_live_' +
    Array.from({ length: 32 }, () =>
      TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)]
    ).join('')
  )
}

export async function POST(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const agent = await db.agent.findFirst({
    where: { id, tenantId: tenant.id },
    include: {
      tokens: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Idempotent — if there's already an active token, hand it back rather than
  // create a duplicate.
  const existing = agent.tokens[0]
  if (existing) {
    return NextResponse.json({ token: existing.token, created: false })
  }

  const created = await db.apiToken.create({
    data: {
      tenantId: tenant.id,
      agentId: agent.id,
      name: 'Default',
      token: generateEmbedToken(),
    },
  })

  return NextResponse.json({ token: created.token, created: true })
}
