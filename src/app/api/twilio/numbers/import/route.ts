export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PHONE_ELIGIBLE_PLANS } from '@/lib/plans'
import { instanceBasicAuthValue } from '@/lib/instance-credentials'
import { registerPhoneNumberWithLiveKit } from '@/lib/livekit-sip'

// POST — import an existing Twilio number into our system and configure its webhook
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      plan: true,
      twilioConnection: true,
      instances: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' }, select: { id: true } },
    },
  })
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!PHONE_ELIGIBLE_PLANS.has(tenant.plan))
    return NextResponse.json({ error: 'Phone numbers require a Premium plan' }, { status: 403 })
  if (!tenant.twilioConnection?.verified)
    return NextResponse.json({ error: 'Twilio not connected' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const sid   = String(body.sid   || '').trim()   // Twilio IncomingPhoneNumber SID
  const e164  = String(body.e164  || '').trim()
  const friendly = typeof body.friendly === 'string' ? body.friendly.trim() : null
  const agentId  = typeof body.agentId === 'string' && body.agentId ? body.agentId.trim() : null

  if (!sid || !e164) return NextResponse.json({ error: 'sid and e164 required' }, { status: 400 })

  // No Voice webhook to configure — inbound routing is via the Twilio Elastic
  // SIP Trunk association (external, Twilio-console-side) feeding self-hosted
  // livekit-sip, registered by registerPhoneNumberWithLiveKit below.

  // Validate agent ownership
  if (agentId) {
    const agent = await db.agent.findFirst({ where: { id: agentId, tenantId: tenant.id } })
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 400 })
  }

  const instanceId = tenant.instances[0]?.id || null

  try {
    const phone = await db.phoneNumber.upsert({
      where: { e164 },
      create: { e164, friendly, provider: 'TWILIO', providerExternalId: sid, tenantId: tenant.id, agentId, instanceId, active: true },
      update: { friendly, providerExternalId: sid, agentId, instanceId, active: true },
    })

    // Sync to SN if instance is configured
    if (instanceId && agentId) await syncPhoneToSN(tenant.id, instanceId, phone.id, e164, agentId, friendly)
    if (agentId) registerPhoneNumberWithLiveKit(e164, agentId).catch(() => {})

    return NextResponse.json({ phoneNumber: phone })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function syncPhoneToSN(tenantId: string, instanceId: string, phoneId: string, e164: string, agentId: string, friendly: string | null) {
  try {
    const [instance, agent] = await Promise.all([
      db.instance.findUnique({ where: { id: instanceId }, select: { snInstanceUrl: true, snUsername: true, snPassword: true, snPasswordEncrypted: true } }),
      db.agent.findUnique({ where: { id: agentId }, select: { snAgentId: true, name: true } }),
    ])
    if (!instance || !agent?.snAgentId) return

    const basic = instanceBasicAuthValue(instance)
    await fetch(`${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/phone-numbers`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: e164, agent_id: agent.snAgentId, friendly_name: friendly, saas_id: phoneId }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    // Non-fatal — DB is source of truth, SN sync is best-effort
  }
}
