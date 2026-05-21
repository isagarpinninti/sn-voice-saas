export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { normalizeCreateInput } from '@/lib/allowed-callers'

type Ctx = { params: Promise<{ id: string }> }

async function resolveAgentPhone(userId: string, agentId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId }, select: { id: true } })
  if (!tenant) return null
  const agent = await db.agent.findFirst({ where: { id: agentId, tenantId: tenant.id } })
  if (!agent) return null
  const phone = await db.phoneNumber.findFirst({ where: { agentId: agent.id, active: true } })
  return { tenant, agent, phone }
}

// GET /api/agents/:id/callers — list callers for this agent's phone number
export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const found = await resolveAgentPhone(session.user.id, id)
  if (!found) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { phone } = found

  if (!phone) {
    return NextResponse.json({ callers: [], phoneNumber: null })
  }

  const callers = await db.allowedCaller.findMany({
    where: { phoneNumberId: phone.id },
    orderBy: [{ active: 'desc' }, { name: 'asc' }, { phoneE164: 'asc' }],
  })

  return NextResponse.json({
    callers,
    phoneNumber: { id: phone.id, e164: phone.e164, friendly: phone.friendly },
  })
}

// POST /api/agents/:id/callers — add a caller to this agent's phone number
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const found = await resolveAgentPhone(session.user.id, id)
  if (!found) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { tenant, phone } = found

  if (!phone) {
    return NextResponse.json({ error: 'This agent has no phone number assigned. Assign a phone number first.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = normalizeCreateInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // Check for duplicate within this phone number scope
  const duplicate = await db.allowedCaller.findFirst({
    where: { phoneNumberId: phone.id, phoneE164: parsed.phoneE164 },
  })
  if (duplicate) {
    return NextResponse.json({ error: `${parsed.phoneE164} is already in this agent's caller group` }, { status: 409 })
  }

  const created = await db.allowedCaller.create({
    data: { ...parsed, tenantId: tenant.id, phoneNumberId: phone.id },
  })

  await logAudit({
    tenantId: tenant.id,
    actorId: session.user.id,
    actorType: 'user',
    action: 'allowlist.caller.added',
    targetType: 'AllowedCaller',
    targetId: created.id,
    metadata: { phoneE164: created.phoneE164, name: created.name, scope: 'phone-number', phoneNumberId: phone.id },
  })

  return NextResponse.json({ caller: created })
}
