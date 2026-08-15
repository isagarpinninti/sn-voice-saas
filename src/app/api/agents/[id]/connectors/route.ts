/**
 * Which connectors (and, later, which specific tools) a given agent can call.
 *
 * GET /api/agents/[id]/connectors — every tenant connector, with enabled state for this agent
 * PUT /api/agents/[id]/connectors — { connectorId, enabled } toggle
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

async function loadOwnedAgent(userId: string, agentId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const agent = await db.agent.findFirst({ where: { id: agentId, tenantId: tenant.id } })
  return agent ? { tenant, agent } : null
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedAgent(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [connectors, agentConnectors] = await Promise.all([
    db.connector.findMany({
      where: { tenantId: owned.tenant.id },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { tools: true } } },
    }),
    db.agentConnector.findMany({ where: { agentId: owned.agent.id } }),
  ])

  const enabledIds = new Set(agentConnectors.map((ac) => ac.connectorId))

  return NextResponse.json({
    connectors: connectors.map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      baseUrl: c.baseUrl,
      toolCount: c._count.tools,
      enabled: enabledIds.has(c.id),
    })),
  })
}

export async function PUT(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedAgent(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const connectorId = String(body?.connectorId || '')
  const enabled = !!body?.enabled
  if (!connectorId) return NextResponse.json({ error: 'connectorId is required' }, { status: 400 })

  const connector = await db.connector.findFirst({ where: { id: connectorId, tenantId: owned.tenant.id } })
  if (!connector) return NextResponse.json({ error: 'Connector not found' }, { status: 404 })

  if (enabled) {
    await db.agentConnector.upsert({
      where: { agentId_connectorId: { agentId: owned.agent.id, connectorId } },
      create: { agentId: owned.agent.id, connectorId, enabledTools: [] },
      update: {},
    })
  } else {
    await db.agentConnector.deleteMany({ where: { agentId: owned.agent.id, connectorId } })
  }

  return NextResponse.json({ success: true })
}
