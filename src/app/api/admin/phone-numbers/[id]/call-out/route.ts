export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { addLog } from '@/lib/log-store'
import { getTelephonyProvider, type TelephonyProviderName } from '@/lib/telephony'

const E164_RE = /^\+[1-9]\d{6,14}$/
const VOICE_AGENT_PLANS = new Set(['PREMIUM', 'PRO_VOICE', 'ENTERPRISE'])

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const to = typeof body.to === 'string' ? body.to.trim() : ''
  const targetName = typeof body.targetName === 'string' ? body.targetName.trim() : ''
  const targetEmail = typeof body.targetEmail === 'string' ? body.targetEmail.trim() : ''
  const targetEmployeeId = typeof body.targetEmployeeId === 'string' ? body.targetEmployeeId.trim() : ''
  const targetSnUserSysId = typeof body.targetSnUserSysId === 'string' ? body.targetSnUserSysId.trim() : ''

  if (!E164_RE.test(to)) {
    return NextResponse.json({ error: '`to` must be E.164 (e.g. +14155550123)' }, { status: 400 })
  }

  const phone = await db.phoneNumber.findUnique({
    where: { id },
    include: { tenant: { select: { id: true, plan: true, plan_expires_at: true } } },
  })
  if (!phone || !phone.active) {
    return NextResponse.json({ error: 'Phone number not found or inactive' }, { status: 404 })
  }
  if (!VOICE_AGENT_PLANS.has(phone.tenant.plan)) {
    return NextResponse.json({ error: `Tenant plan ${phone.tenant.plan} cannot place outbound calls` }, { status: 400 })
  }
  if (phone.tenant.plan_expires_at && phone.tenant.plan_expires_at < new Date()) {
    return NextResponse.json({ error: 'Tenant subscription expired' }, { status: 400 })
  }

  const provider = getTelephonyProvider(phone.provider.toLowerCase() as TelephonyProviderName)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  if (!appUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not configured' }, { status: 500 })
  }
  const connectUrl = `${appUrl.replace(/\/$/, '')}/api/phone/outbound-connect/${encodeURIComponent(phone.id)}`

  const customParameters: Record<string, string> = { outboundTo: to }
  if (targetName) customParameters.callerName = targetName
  if (targetEmail) customParameters.callerEmail = targetEmail
  if (targetEmployeeId) customParameters.callerEmployeeId = targetEmployeeId
  if (targetSnUserSysId) customParameters.callerSnUserSysId = targetSnUserSysId

  try {
    const call = await provider.startOutboundCall({
      to,
      from: phone.e164,
      connectUrl,
      customParameters,
    })

    addLog('info', 'phone-outbound', `Outbound initiated ${phone.e164} → ${to} via ${provider.name} (${call.providerCallId})`, {
      tenantId: phone.tenantId,
      data: { phoneId: phone.id, to, providerCallId: call.providerCallId },
    })

    await logAudit({
      tenantId: phone.tenantId,
      actorId: session?.user?.id,
      actorType: 'admin',
      action: 'phone.call.outbound_initiated',
      targetType: 'PhoneNumber',
      targetId: phone.id,
      metadata: {
        from: phone.e164,
        to,
        provider: provider.name,
        providerCallId: call.providerCallId,
        targetName: targetName || null,
        targetSnUserSysId: targetSnUserSysId || null,
      },
    })

    return NextResponse.json({ call })
  } catch (err: any) {
    addLog('error', 'phone-outbound', `Outbound ${phone.e164} → ${to} failed: ${err.message}`, {
      tenantId: phone.tenantId,
    })
    return NextResponse.json({ error: err?.message || 'Outbound call failed' }, { status: 502 })
  }
}
