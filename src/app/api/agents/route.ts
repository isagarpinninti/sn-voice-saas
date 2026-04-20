/**
 * Agents API — list / create agents for the current tenant.
 *
 * GET   /api/agents       — list all agents (with their default token)
 * POST  /api/agents       — create a new agent. Body: { name, snAgentId? }
 *                            Plan-limit enforced: tenant.max_agents (-1 = unlimited)
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PLANS, PlanKey } from '@/lib/plans'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      agents: {
        orderBy: { createdAt: 'asc' },
        include: {
          tokens: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
        },
      },
    },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  return NextResponse.json({
    plan: tenant.plan,
    maxAgents: tenant.max_agents,
    agentCount: tenant.agents.length,
    agents: tenant.agents.map((a) => ({
      id: a.id,
      name: a.name,
      snAgentId: a.snAgentId,
      active: a.active,
      createdAt: a.createdAt,
      token: a.tokens[0]?.token ?? null,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: { agents: { where: { active: true } } },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Plan-limit check (max_agents === -1 means unlimited)
  if (tenant.max_agents !== -1 && tenant.agents.length >= tenant.max_agents) {
    const planName = PLANS[tenant.plan as PlanKey]?.name || tenant.plan
    return NextResponse.json(
      {
        error: `${planName} plan allows ${tenant.max_agents} agent${tenant.max_agents === 1 ? '' : 's'}. Upgrade to add more.`,
      },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => null)
  const name = (body?.name || '').trim() || 'Untitled Agent'
  const snAgentId = (body?.snAgentId || '').trim() || null

  // Generate a fresh embed token for this agent
  const token =
    'sk_live_' +
    Array.from({ length: 32 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
    ).join('')

  const agent = await db.agent.create({
    data: {
      tenantId: tenant.id,
      name,
      snAgentId,
      tokens: {
        create: { tenantId: tenant.id, name: 'Default', token },
      },
    },
    include: { tokens: true },
  })

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    snAgentId: agent.snAgentId,
    token: agent.tokens[0]?.token,
  })
}
