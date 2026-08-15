/**
 * Single agent API.
 *
 * GET    /api/agents/[id]   — fetch one agent
 * PATCH  /api/agents/[id]   — update name, active, systemPrompt, llmModel, voiceId
 * DELETE /api/agents/[id]   — hard-delete (cascades to ApiToken)
 *
 * Widget config is now on Tenant (one widget per instance), not per agent.
 *
 * systemPrompt/llmModel/voiceId are the self-hosted voice-engine's config
 * (see config/agent_config_zevox.py) — independent of ServiceNow. Before
 * this route exposed them, the only way to set an agent's personality was
 * through the SN scoped app's Agent Instructions field, which meant
 * tenants without a ServiceNow instance had no way to customize their
 * agent at all.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

async function loadOwnedAgent(userId: string, agentId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const agent = await db.agent.findFirst({
    where: { id: agentId, tenantId: tenant.id },
    include: {
      tokens: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
    },
  })
  return agent ? { tenant, agent } : null
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const owned = await loadOwnedAgent(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { tenant, agent: a } = owned

  // Auto-create a token if the agent has none (e.g. created via SN sync)
  let tokenValue = a.tokens[0]?.token ?? null
  if (!tokenValue) {
    const newToken =
      'sk_live_' +
      Array.from({ length: 32 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
      ).join('')
    const created = await db.apiToken.create({
      data: { tenantId: tenant.id, agentId: a.id, name: 'Default', token: newToken },
    })
    tokenValue = created.token
  }

  return NextResponse.json({
    id: a.id,
    name: a.name,
    snAgentId: a.snAgentId,
    active: a.active,
    createdAt: a.createdAt,
    token: tokenValue,
    systemPrompt: a.systemPrompt,
    llmModel: a.llmModel,
    voiceId: a.voiceId,
  })
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const owned = await loadOwnedAgent(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim() || 'Untitled Agent'
  if (typeof body.active === 'boolean') data.active = body.active
  if (typeof body.systemPrompt === 'string') data.systemPrompt = body.systemPrompt.trim() || null
  if (typeof body.llmModel === 'string') data.llmModel = body.llmModel.trim() || null
  if (typeof body.voiceId === 'string') data.voiceId = body.voiceId.trim() || null

  const updated = await db.agent.update({
    where: { id: owned.agent.id },
    data,
  })

  return NextResponse.json({ success: true, id: updated.id })
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const owned = await loadOwnedAgent(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Hard delete — cascades to ApiToken via the schema relation
  await db.agent.delete({ where: { id: owned.agent.id } })

  return NextResponse.json({ success: true })
}
