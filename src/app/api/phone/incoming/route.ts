export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { addLog } from '@/lib/log-store'
import { logAudit } from '@/lib/audit'
import { detectTelephonyProvider, type ProviderResponse } from '@/lib/telephony'

// PREMIUM is the active phone-eligible tier; PRO_VOICE/ENTERPRISE remain for
// legacy tenants who haven't migrated.
const VOICE_AGENT_PLANS = new Set(['PREMIUM', 'PRO_VOICE', 'ENTERPRISE'])

function send(res: ProviderResponse, status = 200) {
  return new NextResponse(res.body, {
    status,
    headers: { 'Content-Type': res.contentType },
  })
}

function headersToRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  h.forEach((v, k) => { out[k.toLowerCase()] = v })
  return out
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>
  const headers = headersToRecord(req.headers)

  // Telnyx signs over `<timestamp>|<raw_body>` — stash the raw body so the
  // provider's validateSignature can reach it without reading the stream twice.
  headers['x-raw-body'] = raw

  const provider = detectTelephonyProvider(headers)

  // Reconstruct the public URL the provider actually hit (needed for Twilio
  // signature verification behind a reverse proxy — `req.url` reflects the
  // internal URL).
  const publicUrl = headers['x-forwarded-proto']
    ? `${headers['x-forwarded-proto']}://${headers['x-forwarded-host'] || headers['host']}${req.nextUrl.pathname}${req.nextUrl.search}`
    : req.url

  const sig = provider.validateSignature({ url: publicUrl, headers, params })
  if (!sig.valid) {
    addLog('warn', 'phone', `Signature invalid (${provider.name}) — rejecting: ${sig.reason || 'unknown'}`, {
      data: { url: publicUrl, from: params.From },
    })
    if (sig.reason?.includes('AUTH_TOKEN')) {
      return send(provider.buildHangupResponse('Service unavailable.'))
    }
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { to, from, providerCallId: callSid } = provider.parseInboundCall(params)

  if (!to) {
    addLog('warn', 'phone', 'Incoming call without To — rejecting')
    return send(provider.buildHangupResponse('Invalid request.'))
  }

  // Route: To (E.164) → PhoneNumber → tenant + agent + instance
  const phone = await db.phoneNumber.findUnique({
    where: { e164: to },
    include: {
      tenant: { select: { id: true, plan: true, plan_expires_at: true, company: true } },
      agent: { select: { id: true, snAgentId: true, name: true, active: true } },
      instance: { select: { id: true, snInstanceUrl: true, active: true } },
    },
  })

  if (!phone || !phone.active) {
    addLog('warn', 'phone', `Call to unknown/inactive number ${to} from ${from} — hangup`)
    return send(provider.buildHangupResponse("Sorry, this number isn't in service. Goodbye."))
  }

  // Plan gate — only phone-eligible plans can receive calls
  if (!VOICE_AGENT_PLANS.has(phone.tenant.plan)) {
    addLog('warn', 'phone', `Call rejected — tenant not on a phone-eligible plan (plan=${phone.tenant.plan})`, {
      tenantId: phone.tenantId,
    })
    await logAudit({
      tenantId: phone.tenantId,
      actorType: 'system',
      action: 'phone.call.rejected',
      targetType: 'PhoneNumber',
      targetId: phone.id,
      metadata: { reason: 'plan_not_phone_eligible', plan: phone.tenant.plan, from, to, callSid },
    })
    return send(provider.buildHangupResponse('Voice agent access is not enabled for this number.'))
  }

  // Allowlist gate — per-phone-number (per-agent) first, tenant-wide as fallback.
  // Phase 1: check if this specific phone number has a caller group configured.
  const phoneCallerCount = await db.allowedCaller.count({
    where: { phoneNumberId: phone.id, active: true },
  })
  // Phase 2: if no phone-scoped callers, fall back to legacy tenant-wide list.
  const tenantCallerCount = phoneCallerCount === 0
    ? await db.allowedCaller.count({ where: { tenantId: phone.tenantId, phoneNumberId: null, active: true } })
    : 0

  const effectiveCount = phoneCallerCount > 0 ? phoneCallerCount : tenantCallerCount
  const effectiveWhere = phoneCallerCount > 0
    ? { phoneNumberId: phone.id, active: true, phoneE164: from }
    : { tenantId: phone.tenantId, phoneNumberId: null as null, active: true, phoneE164: from }

  let matchedCaller: { name: string | null; email: string | null; employeeId: string | null; snUserSysId: string | null } | null = null
  if (effectiveCount > 0) {
    matchedCaller = await db.allowedCaller.findFirst({
      where: effectiveWhere,
      select: { name: true, email: true, employeeId: true, snUserSysId: true },
    })
    if (!matchedCaller) {
      const scope = phoneCallerCount > 0 ? 'phone-number caller group' : 'tenant allowlist'
      addLog('warn', 'phone', `Call rejected — caller ${from} not in ${scope}`, {
        tenantId: phone.tenantId,
      })
      await logAudit({
        tenantId: phone.tenantId,
        actorType: 'system',
        action: 'phone.call.rejected',
        targetType: 'PhoneNumber',
        targetId: phone.id,
        metadata: { reason: 'caller_not_authorized', scope, from, to, callSid },
      })
      return send(provider.buildHangupResponse('Sorry, you are not authorized to use this line. Goodbye.'))
    }
  }

  if (phone.tenant.plan_expires_at && phone.tenant.plan_expires_at < new Date()) {
    addLog('warn', 'phone', 'Call rejected — subscription expired', { tenantId: phone.tenantId })
    return send(provider.buildHangupResponse('Your subscription has expired. Please renew and try again.'))
  }

  if (!phone.instance?.active || !phone.instance?.snInstanceUrl) {
    addLog('warn', 'phone', 'Call rejected — no active ServiceNow instance', { tenantId: phone.tenantId })
    return send(provider.buildHangupResponse('Your ServiceNow instance is not configured. Please contact support.'))
  }

  // Build wss:// URL for the Media Stream bridge. Provider name rides as a
  // query param so the WS handler can pick the right parser before the first
  // frame arrives (providers don't all share the same start-event shape).
  const host = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : headers['x-forwarded-host'] || headers['host']
  const streamUrl = `wss://${host}/phone?provider=${encodeURIComponent(provider.name)}`

  addLog('info', 'phone', `Incoming call ${callSid} via ${provider.name} → ${to} (tenant ${phone.tenantId}) streamUrl=${streamUrl} phoneId=${phone.id}`, {
    tenantId: phone.tenantId,
    data: { provider: provider.name, from, agentId: phone.agentId, streamUrl, phoneId: phone.id },
  })

  await logAudit({
    tenantId: phone.tenantId,
    actorType: 'system',
    action: 'phone.call.accepted',
    targetType: 'PhoneNumber',
    targetId: phone.id,
    metadata: {
      from, to, callSid, agentId: phone.agentId, instanceId: phone.instanceId,
      callerName: matchedCaller?.name || null,
      callerEmployeeId: matchedCaller?.employeeId || null,
      allowlistMode: effectiveCount > 0 ? (phoneCallerCount > 0 ? 'phone-scoped' : 'tenant-wide') : 'open',
    },
  })

  // Custom parameters ride inside the provider's stream-response envelope and
  // arrive at the WS handler on the `start` event. Caller fields are only set
  // when allowlist is enforced and matched; anonymous calls get just phoneId.
  const customParameters: Record<string, string> = { phoneId: phone.id }
  if (matchedCaller?.name) customParameters.callerName = matchedCaller.name
  if (matchedCaller?.email) customParameters.callerEmail = matchedCaller.email
  if (matchedCaller?.employeeId) customParameters.callerEmployeeId = matchedCaller.employeeId
  if (matchedCaller?.snUserSysId) customParameters.callerSnUserSysId = matchedCaller.snUserSysId

  return send(provider.buildStreamResponse({ wsUrl: streamUrl, customParameters }))
}
