export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encrypt'

type RouteContext = { params: Promise<{ id: string }> }

async function getPhone(id: string, tenantId: string) {
  return db.phoneNumber.findFirst({ where: { id, tenantId } })
}

// PATCH — update agentId, friendly name, active status
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, twilioConnection: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const phone = await getPhone(id, tenant.id)
  if (!phone) return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (body.agentId !== undefined) {
    if (body.agentId) {
      const agent = await db.agent.findFirst({ where: { id: body.agentId, tenantId: tenant.id } })
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    data.agentId = body.agentId || null
  }
  if (typeof body.friendly === 'string') data.friendly = body.friendly || null
  if (typeof body.active === 'boolean') data.active = body.active

  const updated = await db.phoneNumber.update({ where: { id }, data })

  // Sync agent assignment to SN if instance is configured
  if (body.agentId !== undefined && phone.instanceId) {
    syncAssignmentToSN(phone.instanceId, phone.id, phone.e164, body.agentId || null, updated.friendly).catch(() => {})
  }

  return NextResponse.json({ success: true, phoneNumber: updated })
}

// DELETE — remove from our DB and optionally release from Twilio
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, twilioConnection: true },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const phone = await getPhone(id, tenant.id)
  if (!phone) return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })

  const url = new URL(req.url)
  const releaseTwilio = url.searchParams.get('release') === 'true'

  // Release from Twilio if requested and we have credentials + a SID
  if (releaseTwilio && tenant.twilioConnection?.verified && phone.providerExternalId) {
    try {
      const { accountSid, authToken } = {
        accountSid: tenant.twilioConnection.accountSid,
        authToken: decrypt(tenant.twilioConnection.authToken),
      }
      const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(phone.providerExternalId)}.json`,
        { method: 'DELETE', headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(10_000) },
      )
    } catch {
      // Non-fatal — still remove from our DB
    }
  }

  await db.phoneNumber.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

async function syncAssignmentToSN(instanceId: string, phoneId: string, e164: string, agentId: string | null, friendly: string | null) {
  const [instance, agent] = await Promise.all([
    db.instance.findUnique({ where: { id: instanceId }, select: { snInstanceUrl: true, snUsername: true, snPassword: true } }),
    agentId ? db.agent.findUnique({ where: { id: agentId }, select: { snAgentId: true } }) : Promise.resolve(null),
  ])
  if (!instance) return
  const basic = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')
  await fetch(`${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/phone-numbers`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: e164, agent_id: agent?.snAgentId || null, friendly_name: friendly, saas_id: phoneId }),
    signal: AbortSignal.timeout(8_000),
  })
}
