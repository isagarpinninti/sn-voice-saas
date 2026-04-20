export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { addLog } from '@/lib/log-store'
import { logAudit } from '@/lib/audit'

const twilio = require('twilio')

const VOICE_AGENT_PLANS = new Set(['PRO_VOICE', 'ENTERPRISE'])
const HANGUP_TWIML = (message: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Matthew">${escapeXml(message)}</Say><Hangup/></Response>`

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)
}

function twimlResponse(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>

  // Signature validation — prevents anyone from spoofing Twilio webhooks to drain quota.
  // Skip when TWILIO_SIGNATURE_VALIDATION is not 'true' (dev / initial testing).
  const shouldValidate = process.env.TWILIO_SIGNATURE_VALIDATION === 'true'
  if (shouldValidate) {
    const sig = req.headers.get('x-twilio-signature') || ''
    const token = process.env.TWILIO_AUTH_TOKEN || ''
    if (!token) {
      addLog('error', 'phone', 'TWILIO_AUTH_TOKEN missing but validation enabled — rejecting call')
      return twimlResponse(HANGUP_TWIML('Service unavailable.'))
    }
    const url = req.headers.get('x-forwarded-proto')
      ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('x-forwarded-host') || req.headers.get('host')}${req.nextUrl.pathname}${req.nextUrl.search}`
      : req.url
    const valid = twilio.validateRequest(token, sig, url, params)
    if (!valid) {
      addLog('warn', 'phone', 'Twilio signature invalid — rejecting', { data: { url, from: params.From } })
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const to = (params.To || '').trim()
  const from = (params.From || '').trim()
  const callSid = (params.CallSid || '').trim()

  if (!to) {
    addLog('warn', 'phone', 'Incoming call without To — rejecting')
    return twimlResponse(HANGUP_TWIML('Invalid request.'))
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
    return twimlResponse(HANGUP_TWIML("Sorry, this number isn't in service. Goodbye."))
  }

  // Plan gate — only PRO_VOICE and ENTERPRISE can receive calls
  if (!VOICE_AGENT_PLANS.has(phone.tenant.plan)) {
    addLog('warn', 'phone', `Call rejected — tenant not on Pro Voice (plan=${phone.tenant.plan})`, {
      tenantId: phone.tenantId,
    })
    await logAudit({
      tenantId: phone.tenantId,
      actorType: 'system',
      action: 'phone.call.rejected',
      targetType: 'PhoneNumber',
      targetId: phone.id,
      metadata: { reason: 'plan_not_pro_voice', plan: phone.tenant.plan, from, to, callSid },
    })
    return twimlResponse(HANGUP_TWIML('Voice agent access is not enabled for this number.'))
  }

  if (phone.tenant.plan_expires_at && phone.tenant.plan_expires_at < new Date()) {
    addLog('warn', 'phone', 'Call rejected — subscription expired', { tenantId: phone.tenantId })
    return twimlResponse(HANGUP_TWIML('Your subscription has expired. Please renew and try again.'))
  }

  if (!phone.instance?.active || !phone.instance?.snInstanceUrl) {
    addLog('warn', 'phone', 'Call rejected — no active ServiceNow instance', { tenantId: phone.tenantId })
    return twimlResponse(HANGUP_TWIML('Your ServiceNow instance is not configured. Please contact support.'))
  }

  // Build wss:// URL for Media Streams
  const host = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : req.headers.get('x-forwarded-host') || req.headers.get('host')
  const streamUrl = `wss://${host}/phone?phoneId=${encodeURIComponent(phone.id)}`

  addLog('info', 'phone', `Incoming call ${callSid} → ${to} (tenant ${phone.tenantId})`, {
    tenantId: phone.tenantId,
    data: { from, agentId: phone.agentId },
  })

  await logAudit({
    tenantId: phone.tenantId,
    actorType: 'system',
    action: 'phone.call.accepted',
    targetType: 'PhoneNumber',
    targetId: phone.id,
    metadata: { from, to, callSid, agentId: phone.agentId, instanceId: phone.instanceId },
  })

  // Twilio's Connect/Stream TwiML. The <Stream> opens a bidirectional WebSocket
  // to the given URL. Our server handles it in /phone and bridges to VoicePipeline.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}" />
  </Connect>
</Response>`

  return twimlResponse(twiml)
}
