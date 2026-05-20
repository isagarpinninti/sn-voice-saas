/**
 * Agent voice API — read/write tts_voice bidirectionally.
 *
 * GET  /api/agents/[id]/voice — return cached ttsVoice from SaaS DB (fast, no SN roundtrip)
 * PUT  /api/agents/[id]/voice — update SaaS DB + push to SN { voice: "aura-asteria-en" }
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

async function getAgentWithInstance(userId: string, agentId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  return db.agent.findFirst({
    where: { id: agentId, tenantId: tenant.id },
    include: { instance: true },
  })
}

function snAuth(instance: { snUsername: string; snPassword: string }) {
  return 'Basic ' + Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const agent = await getAgentWithInstance(session.user.id, id)
  if (!agent) return NextResponse.json({ voice: 'aura-asteria-en' })

  // Return cached value from SaaS DB — kept in sync by the SN async BR
  return NextResponse.json({ voice: agent.ttsVoice || 'aura-asteria-en' })
}

export async function PUT(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  const voice = body?.voice
  if (!voice) return NextResponse.json({ error: 'voice is required' }, { status: 400 })

  const agent = await getAgentWithInstance(session.user.id, id)
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Always update SaaS DB so the cached value is current
  await db.agent.update({ where: { id: agent.id }, data: { ttsVoice: voice } })

  // Push to SN if the agent is linked to an instance
  if (agent.snAgentId && agent.instance) {
    try {
      const res = await fetch(
        `${agent.instance.snInstanceUrl}/api/now/table/x_ztpas_ai_voice_a_voice_agent/${agent.snAgentId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: snAuth(agent.instance),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ tts_voice: voice }),
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!res.ok) {
        return NextResponse.json(
          { success: true, voice, snWarning: 'Voice saved locally; SN update failed: HTTP ' + res.status },
        )
      }
    } catch (err: any) {
      return NextResponse.json(
        { success: true, voice, snWarning: 'Voice saved locally; SN unreachable: ' + err.message },
      )
    }
  }

  return NextResponse.json({ success: true, voice })
}
