/**
 * Sync agents from a ServiceNow instance into the SaaS.
 *
 * POST /api/instances/[id]/sync
 *
 * Calls the SN scoped API to list all active voice agents,
 * then upserts them into the SaaS Agent table.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const instance = await db.instance.findFirst({
    where: { id, tenantId: tenant.id },
  })
  if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

  // Call SN scoped API to list agents
  const authHeader = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')
  let snAgents: { sys_id: string; name: string; active: boolean }[] = []

  try {
    const res = await fetch(
      `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/voice_agent/admin/agents`,
      {
        headers: { Authorization: `Basic ${authHeader}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      },
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: `SN API returned ${res.status}. Check credentials and that the ZeVox app is installed.` },
        { status: 502 },
      )
    }
    const data = await res.json()
    const result = data.result || data
    snAgents = (result.agents || []).map((a: any) => ({
      sys_id: a.sys_id,
      name: a.name || 'Untitled Agent',
      active: a.active === true || a.active === 'true',
    }))
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to reach SN: ' + err.message }, { status: 502 })
  }

  if (snAgents.length === 0) {
    return NextResponse.json({ synced: 0, message: 'No voice agents found in ServiceNow.' })
  }

  const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  function generateEmbedToken() {
    return (
      'sk_live_' +
      Array.from({ length: 32 }, () =>
        TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)]
      ).join('')
    )
  }

  // Upsert each agent
  let created = 0
  let updated = 0
  for (const sn of snAgents) {
    const existing = await db.agent.findFirst({
      where: { tenantId: tenant.id, snAgentId: sn.sys_id },
      include: { tokens: { where: { active: true }, take: 1 } },
    })
    if (existing) {
      await db.agent.update({
        where: { id: existing.id },
        data: { name: sn.name, active: sn.active, instanceId: instance.id },
      })
      
      // If the existing agent has no active token, generate one automatically
      if (existing.tokens.length === 0) {
        await db.apiToken.create({
          data: {
            tenantId: tenant.id,
            agentId: existing.id,
            name: 'Default',
            token: generateEmbedToken(),
          },
        })
      }
      
      updated++
    } else {
      // Plan limit check
      const agentCount = await db.agent.count({ where: { tenantId: tenant.id, active: true } })
      if (tenant.max_agents !== -1 && agentCount >= tenant.max_agents) {
        return NextResponse.json({
          synced: created + updated,
          created,
          updated,
          error: `Plan limit reached (${tenant.max_agents} agents). Synced ${created + updated} of ${snAgents.length}.`,
        })
      }
      
      const token = generateEmbedToken()
      await db.agent.create({
        data: {
          tenantId: tenant.id,
          instanceId: instance.id,
          name: sn.name,
          snAgentId: sn.sys_id,
          active: sn.active,
          tokens: {
            create: { tenantId: tenant.id, name: 'Default', token },
          },
        },
      })
      created++
    }
  }

  return NextResponse.json({
    synced: created + updated,
    created,
    updated,
    message: `Synced ${snAgents.length} agent(s) from ServiceNow.`,
  })
}
