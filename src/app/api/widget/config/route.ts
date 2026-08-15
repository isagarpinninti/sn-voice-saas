export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const agentId = url.searchParams.get('agent') // SaaS Agent.id (= saas_token stored on SN)

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400, headers: CORS_HEADERS })

  const apiToken = await db.apiToken.findUnique({
    where: { token },
    include: { instance: true, tenant: true },
  })

  if (!apiToken?.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403, headers: CORS_HEADERS })
  }

  // Resolve instance
  let instance = apiToken.instance
  if (!instance && apiToken.tenant) {
    instance = await db.instance.findFirst({
      where: { tenantId: apiToken.tenant.id, active: true },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!instance) {
    return NextResponse.json({ error: 'No instance configured' }, { status: 404, headers: CORS_HEADERS })
  }

  // Instance-level defaults
  const base = {
    color:        instance.widgetColor        || '#10b981',
    position:     instance.widgetPosition     || 'right',
    widgetMode:   'voice_only',
    autoOpen:     instance.widgetAutoOpen,
    greeting:     instance.widgetGreeting     || null,
    agentName:    instance.widgetAgentName    || null,
    showBranding:    instance.widgetShowBranding,
    logoUrl:         instance.widgetLogoUrl          || null,
    borderRadius:    instance.widgetBorderRadius     || 'full',
    launcherLabel:   instance.widgetLauncherLabel    || 'Start a call',
    launcherDark:    instance.widgetLauncherDark     ?? true,
  }

  // Per-agent override — look up by Agent.id (= saas_token stored on SN voice_agent)
  if (agentId) {
    const agent = await db.agent.findFirst({
      where: { id: agentId, tenantId: apiToken.tenantId },
    })
    if (agent) {
      return NextResponse.json(
        {
          color:        agent.widgetColor        || base.color,
          position:     agent.widgetPosition     || base.position,
          widgetMode:   agent.widgetMode         || 'voice_only',
          autoOpen:     agent.widgetAutoOpen     ?? base.autoOpen,
          greeting:     agent.widgetGreeting     || base.greeting,
          agentName:    agent.widgetTitle        || agent.name || base.agentName,
          showBranding:  agent.widgetShowBranding  ?? base.showBranding,
          logoUrl:       agent.widgetLogoUrl       || base.logoUrl,
          borderRadius:  agent.widgetBorderRadius  || base.borderRadius,
          launcherLabel: agent.widgetLauncherLabel || base.launcherLabel,
          launcherDark:  agent.widgetLauncherDark  ?? base.launcherDark,
          // VoiceConnect merge (M9): an agent only opts into the new
          // self-hosted WebRTC path once it's been migrated — llmModel being
          // set is that signal (it's only ever populated by the migration,
          // never by the legacy Deepgram/Groq pipeline). Every existing
          // tenant's agent has llmModel = null and keeps using the
          // legacy WS path untouched.
          engine:       agent.llmModel ? 'webrtc' : 'legacy',
          agentId:      agent.id,
        },
        { headers: CORS_HEADERS }
      )
    }
  }

  return NextResponse.json({ ...base, engine: 'legacy' }, { headers: CORS_HEADERS })
}
