export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { addLog } from '@/lib/log-store'
import { detectTelephonyProvider, type ProviderResponse } from '@/lib/telephony'

// Fetched by the telephony provider when an OUTBOUND call we initiated is
// answered. Returns the Connect/Stream TeXML that opens a Media Stream into
// our /phone WS handler — the same bridge used by inbound calls.
//
// Target context (name, SN user, E.164) arrives as URL query params (set when
// we initiated the call via provider.startOutboundCall → appendQuery).
//
// The phoneId in the path identifies which PhoneNumber row we called from —
// the WS handler uses it to resolve tenant/agent the same way inbound does.

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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ phoneId: string }> },
) {
  const { phoneId } = await ctx.params
  const raw = await req.text()
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>
  const headers = headersToRecord(req.headers)
  headers['x-raw-body'] = raw

  const provider = detectTelephonyProvider(headers)

  const publicUrl = headers['x-forwarded-proto']
    ? `${headers['x-forwarded-proto']}://${headers['x-forwarded-host'] || headers['host']}${req.nextUrl.pathname}${req.nextUrl.search}`
    : req.url

  const sig = provider.validateSignature({ url: publicUrl, headers, params })
  if (!sig.valid) {
    addLog('warn', 'phone-outbound', `Signature invalid (${provider.name}): ${sig.reason || 'unknown'}`)
    return new NextResponse('Forbidden', { status: 403 })
  }

  if (!phoneId) {
    return send(provider.buildHangupResponse('Invalid request.'))
  }

  const phone = await db.phoneNumber.findUnique({
    where: { id: phoneId },
    include: {
      tenant: { select: { id: true, plan: true, plan_expires_at: true } },
      agent: { select: { id: true, snAgentId: true } },
      instance: { select: { id: true, active: true, snInstanceUrl: true } },
    },
  })
  if (!phone || !phone.active) {
    addLog('warn', 'phone-outbound', `Unknown/inactive phoneId ${phoneId} — hangup`)
    return send(provider.buildHangupResponse('Outbound line not available.'))
  }
  if (!VOICE_AGENT_PLANS.has(phone.tenant.plan)) {
    addLog('warn', 'phone-outbound', `Plan gate — ${phone.tenant.plan}`, { tenantId: phone.tenantId })
    return send(provider.buildHangupResponse('Outbound calls not enabled for this plan.'))
  }
  if (!phone.instance?.active || !phone.instance?.snInstanceUrl) {
    addLog('warn', 'phone-outbound', 'No active SN instance', { tenantId: phone.tenantId })
    return send(provider.buildHangupResponse('ServiceNow instance not configured.'))
  }

  // Target context arrives as URL query (we set it when we initiated the call).
  const q = req.nextUrl.searchParams
  const targetName = q.get('callerName') || ''
  const targetEmail = q.get('callerEmail') || ''
  const targetEmployeeId = q.get('callerEmployeeId') || ''
  const targetSnUserSysId = q.get('callerSnUserSysId') || ''
  const outboundTo = q.get('outboundTo') || ''

  const host = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : headers['x-forwarded-host'] || headers['host']
  const streamUrl = `wss://${host}/phone?provider=${encodeURIComponent(provider.name)}`

  addLog('info', 'phone-outbound', `Outbound call answered: ${phone.e164} → ${outboundTo} (tenant ${phone.tenantId}) phoneId=${phone.id}`, {
    tenantId: phone.tenantId,
    data: { provider: provider.name, phoneId: phone.id, outboundTo, targetName },
  })

  const customParameters: Record<string, string> = { phoneId: phone.id }
  if (targetName) customParameters.callerName = targetName
  if (targetEmail) customParameters.callerEmail = targetEmail
  if (targetEmployeeId) customParameters.callerEmployeeId = targetEmployeeId
  if (targetSnUserSysId) customParameters.callerSnUserSysId = targetSnUserSysId

  return send(provider.buildStreamResponse({ wsUrl: streamUrl, customParameters }))
}
