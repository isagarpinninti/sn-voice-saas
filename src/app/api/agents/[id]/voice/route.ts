/**
 * Agent voice API — read/write tts_voice on the ServiceNow voice agent record.
 *
 * GET  /api/agents/[id]/voice — fetch current voice from SN
 * PUT  /api/agents/[id]/voice — update voice on SN { voice: "aura-asteria-en" }
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

async function getAgentWithInstance(userId: string, agentId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const agent = await db.agent.findFirst({
    where: { id: agentId, tenantId: tenant.id },
    include: { instance: true },
  })
  return agent
}

function snAuth(instance: { snUsername: string; snPassword: string }) {
  return 'Basic ' + Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const agent = await getAgentWithInstance(session.user.id, id)
  if (!agent?.snAgentId || !agent.instance) {
    return NextResponse.json({ voice: 'aura-asteria-en' })
  }

  try {
    const res = await fetch(
      `${agent.instance.snInstanceUrl}/api/now/table/x_ztpas_ai_voice_a_voice_agent/${agent.snAgentId}?sysparm_fields=tts_voice&sysparm_display_value=false`,
      {
        headers: { Authorization: snAuth(agent.instance), Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!res.ok) return NextResponse.json({ voice: 'aura-asteria-en' })
    const data = await res.json()
    return NextResponse.json({ voice: data.result?.tts_voice || 'aura-asteria-en' })
  } catch {
    return NextResponse.json({ voice: 'aura-asteria-en' })
  }
}

export async function PUT(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  const voice = body?.voice
  if (!voice) return NextResponse.json({ error: 'voice is required' }, { status: 400 })

  const agent = await getAgentWithInstance(session.user.id, id)
  if (!agent?.snAgentId || !agent.instance) {
    return NextResponse.json({ error: 'Agent not linked to SN or no instance configured' }, { status: 400 })
  }

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
      return NextResponse.json({ error: 'Failed to update SN: HTTP ' + res.status }, { status: 502 })
    }
    return NextResponse.json({ success: true, voice })
  } catch (err: any) {
    return NextResponse.json({ error: 'SN unreachable: ' + err.message }, { status: 502 })
  }
}
