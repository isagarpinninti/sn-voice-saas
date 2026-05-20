/**
 * ServiceNow → SaaS agent sync API.
 *
 * Called by a business rule on x_ztpas_ai_voice_a_voice_agent whenever
 * an agent is created, updated, or deleted in ServiceNow.
 *
 * Auth: Bearer token (instance API key shown on Connection page).
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateSnRequest } from '@/lib/sn-auth'
import { addLog } from '@/lib/log-store'

// ── POST — Create agent from ServiceNow ─────────────────────────────────
export async function POST(req: Request) {
  const auth = await authenticateSnRequest(req)
  if (!auth) {
    addLog('warn', 'sn', 'POST /api/sn/agents — Unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const snAgentId = (body?.sn_agent_id || '').trim()
  const name = (body?.name || '').trim() || 'Untitled Agent'

  addLog('info', 'sn', `POST /api/sn/agents — tenant=${auth.tenantId} sn_agent_id=${snAgentId || '(none)'} name="${name}"`)

  if (!snAgentId) {
    return NextResponse.json({ error: 'sn_agent_id is required' }, { status: 400 })
  }

  // Check if agent already exists for this tenant
  const existing = await db.agent.findFirst({
    where: { tenantId: auth.tenantId, snAgentId },
    include: { tokens: { where: { active: true }, take: 1 } },
  })

  if (existing) {
    let existingToken = existing.tokens[0]?.token ?? null

    // Agent exists but has no active token — create one now so SN always gets a token back
    if (!existingToken) {
      const freshToken =
        'sk_live_' +
        Array.from({ length: 32 }, () =>
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
        ).join('')
      await db.apiToken.create({
        data: { tenantId: auth.tenantId, agentId: existing.id, name: 'Default', token: freshToken },
      })
      existingToken = freshToken
      addLog('info', 'sn', `POST /api/sn/agents — created missing token for existing agent id=${existing.id}`)
    }

    addLog('info', 'sn', `POST /api/sn/agents — agent exists id=${existing.id} token=yes`)
    return NextResponse.json({
      id: existing.id,
      name: existing.name,
      snAgentId: existing.snAgentId,
      token: existingToken,
      message: 'Agent already exists — returned existing record',
    })
  }

  // Plan-limit check
  const tenant = await db.tenant.findUnique({
    where: { id: auth.tenantId },
    include: { agents: { where: { active: true } } },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  if (tenant.max_agents !== -1 && tenant.agents.length >= tenant.max_agents) {
    return NextResponse.json(
      { error: `Plan limit reached (${tenant.max_agents} agent${tenant.max_agents === 1 ? '' : 's'}). Upgrade your plan.` },
      { status: 403 },
    )
  }

  const token =
    'sk_live_' +
    Array.from({ length: 32 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
    ).join('')

  const agent = await db.agent.create({
    data: {
      tenantId: auth.tenantId,
      instanceId: auth.instanceId,
      name,
      snAgentId,
      tokens: {
        create: { tenantId: auth.tenantId, name: 'Default', token },
      },
    },
    include: { tokens: true },
  })

  addLog('info', 'sn', `POST /api/sn/agents — created agent id=${agent.id} token=${token.slice(0, 14)}...`)

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    snAgentId: agent.snAgentId,
    token,
    message: 'Agent created successfully',
  })
}

// ── PATCH — Update agent from ServiceNow ────────────────────────────────
export async function PATCH(req: Request) {
  const auth = await authenticateSnRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const snAgentId = (body?.sn_agent_id || '').trim()

  if (!snAgentId) {
    return NextResponse.json({ error: 'sn_agent_id is required' }, { status: 400 })
  }

  let agent = await db.agent.findFirst({
    where: { tenantId: auth.tenantId, snAgentId },
  })

  // Auto-create if not found (upsert — handles agents created before sync was configured)
  if (!agent) {
    const newToken =
      'sk_live_' +
      Array.from({ length: 32 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
      ).join('')
    agent = await db.agent.create({
      data: {
        tenantId: auth.tenantId,
        instanceId: auth.instanceId,
        name: body.name || 'Untitled Agent',
        snAgentId,
        active: body.active !== undefined ? body.active : true,
        tokens: { create: { tenantId: auth.tenantId, name: 'Default', token: newToken } },
      },
    })
    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      snAgentId: agent.snAgentId,
      active: agent.active,
      token: newToken,
      message: 'Agent created (upsert from PATCH)',
    })
  }

  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.active !== undefined) updateData.active = body.active
  if (body.tts_voice !== undefined) updateData.ttsVoice = body.tts_voice

  const updated = await db.agent.update({
    where: { id: agent.id },
    data: updateData,
    include: { tokens: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } } },
  })

  // Return token so SN can keep embed_snippet in sync
  const token = updated.tokens[0]?.token ?? null

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    snAgentId: updated.snAgentId,
    active: updated.active,
    token,
    message: 'Agent updated successfully',
  })
}

// ── DELETE — Deactivate agent from ServiceNow ───────────────────────────
export async function DELETE(req: Request) {
  const auth = await authenticateSnRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const snAgentId = (searchParams.get('sn_agent_id') || '').trim()

  if (!snAgentId) {
    return NextResponse.json({ error: 'sn_agent_id query param is required' }, { status: 400 })
  }

  const agent = await db.agent.findFirst({
    where: { tenantId: auth.tenantId, snAgentId },
  })

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  await db.agent.update({
    where: { id: agent.id },
    data: { active: false },
  })

  return NextResponse.json({
    id: agent.id,
    snAgentId: agent.snAgentId,
    message: 'Agent deactivated successfully',
  })
}
