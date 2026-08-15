export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encrypt'
import { PHONE_ELIGIBLE_PLANS } from '@/lib/plans'
import { instanceBasicAuthValue } from '@/lib/instance-credentials'
import { registerPhoneNumberWithLiveKit } from '@/lib/livekit-sip'

// POST — purchase a number from Twilio and import it
// body: { e164, agentId?, friendly? }
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
  const e164     = String(body.e164     || '').trim()
  const agentId  = typeof body.agentId === 'string' && body.agentId ? body.agentId.trim() : null
  const friendly = typeof body.friendly === 'string' && body.friendly ? body.friendly.trim() : null

  if (!e164) return NextResponse.json({ error: 'e164 required' }, { status: 400 })

  if (agentId) {
    const agent = await db.agent.findFirst({ where: { id: agentId, tenantId: tenant.id } })
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 400 })
  }

  const { accountSid, authToken } = {
    accountSid: tenant.twilioConnection.accountSid,
    authToken: decrypt(tenant.twilioConnection.authToken),
  }
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  // Purchase the number. No VoiceUrl webhook — inbound routing is via the
  // Twilio Elastic SIP Trunk association (external, Twilio-console-side)
  // feeding self-hosted livekit-sip, registered by registerPhoneNumberWithLiveKit
  // below, not a Voice webhook on this number.
  const buyForm = new URLSearchParams()
  buyForm.set('PhoneNumber', e164)
  if (friendly) buyForm.set('FriendlyName', friendly)

  const buyRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: buyForm.toString(), signal: AbortSignal.timeout(15_000) },
  )
  if (!buyRes.ok) {
    const err = await buyRes.json().catch(() => ({}))
    return NextResponse.json({ error: `Purchase failed: ${err?.message || buyRes.status}` }, { status: 502 })
  }
  const purchased = await buyRes.json()
  const sid = purchased.sid as string

  const instanceId = tenant.instances[0]?.id || null

  try {
    const phone = await db.phoneNumber.create({
      data: { e164, friendly: friendly || purchased.friendly_name || null, provider: 'TWILIO', providerExternalId: sid, tenantId: tenant.id, agentId, instanceId, active: true },
    })

    if (instanceId && agentId) {
      await syncPhoneToSN(instanceId, phone.id, e164, agentId, friendly)
    }
    if (agentId) {
      registerPhoneNumberWithLiveKit(e164, agentId).catch(() => {})
    }

    return NextResponse.json({ phoneNumber: phone })
  } catch (e: any) {
    // Rollback: release the purchased number
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(sid)}.json`,
      { method: 'DELETE', headers: { Authorization: `Basic ${basic}` } },
    ).catch(() => {})
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

async function syncPhoneToSN(instanceId: string, phoneId: string, e164: string, agentId: string, friendly: string | null) {
  try {
    const [instance, agent] = await Promise.all([
      db.instance.findUnique({ where: { id: instanceId }, select: { snInstanceUrl: true, snUsername: true, snPassword: true, snPasswordEncrypted: true } }),
      db.agent.findUnique({ where: { id: agentId }, select: { snAgentId: true } }),
    ])
    if (!instance || !agent?.snAgentId) return
    const basic = instanceBasicAuthValue(instance)
    await fetch(`${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/phone-numbers`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: e164, agent_id: agent.snAgentId, friendly_name: friendly, saas_id: phoneId }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch { /* non-fatal */ }
}
