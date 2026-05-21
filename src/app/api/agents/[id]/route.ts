/**
 * Single agent API.
 *
 * GET    /api/agents/[id]   — fetch one agent
 * PATCH  /api/agents/[id]   — update name, snAgentId, active (syncs back to SN)
 * DELETE /api/agents/[id]   — hard-delete (cascades to ApiToken)
 *
 * Widget config is now on Tenant (one widget per instance), not per agent.
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

function snBasicAuth(username: string, password: string) {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const owned = await loadOwnedAgent(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const a = owned.agent
  return NextResponse.json({
    id: a.id,
    name: a.name,
    snAgentId: a.snAgentId,
    active: a.active,
    ttsVoice: a.ttsVoice,
    createdAt: a.createdAt,
    token: a.tokens[0]?.token ?? null,
    callerGroupSysId: a.callerGroupSysId ?? null,
    callerGroupName: a.callerGroupName ?? null,
  })
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params

  // Load with instance so we can write back to SN
  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const agent = await db.agent.findFirst({
    where: { id, tenantId: tenant.id },
    include: { instance: true },
  })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim() || 'Untitled Agent'
  if (typeof body.snAgentId === 'string') data.snAgentId = body.snAgentId.trim() || null
  if (typeof body.active === 'boolean') data.active = body.active

  const updated = await db.agent.update({
    where: { id: agent.id },
    data,
  })

  // Push name/active changes back to ServiceNow (fire-and-forget; dashboard save
  // succeeds even if SN is temporarily unreachable)
  const snFields: Record<string, unknown> = {}
  if (data.name !== undefined) snFields.name = data.name
  if (data.active !== undefined) snFields.active = data.active

  // Fall back to tenant's primary instance if agent has no direct instance link
  let snInstance = agent.instance
  if (!snInstance) {
    snInstance = await db.instance.findFirst({
      where: { tenantId: agent.tenantId, active: true },
      orderBy: { createdAt: 'asc' },
    }) as typeof agent.instance
  }

  if (Object.keys(snFields).length > 0 && agent.snAgentId && snInstance) {
    fetch(
      `${snInstance.snInstanceUrl}/api/now/table/x_ztpas_ai_voice_a_voice_agent/${agent.snAgentId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: snBasicAuth(snInstance!.snUsername, snInstance!.snPassword),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(snFields),
        signal: AbortSignal.timeout(10000),
      },
    ).catch(() => {})
  }

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
