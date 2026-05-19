export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Widget config endpoint.
 * Token resolves to Instance or Agent → instance-level widget config.
 * Agent tokens inherit their parent instance's widget settings.
 */

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

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400, headers: CORS_HEADERS })

  const apiToken = await db.apiToken.findUnique({
    where: { token },
    include: { instance: true, agent: { include: { instance: true } }, tenant: true },
  })

  if (!apiToken?.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403, headers: CORS_HEADERS })
  }

  // Resolution order: instance-token → agent-token (inherits instance config) → tenant-fallback
  let instance = apiToken.instance ?? apiToken.agent?.instance ?? null
  if (!instance && apiToken.tenant) {
    instance = await db.instance.findFirst({
      where: { tenantId: apiToken.tenant.id, active: true },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!instance) {
    return NextResponse.json({ error: 'No instance configured' }, { status: 404, headers: CORS_HEADERS })
  }

  return NextResponse.json(
    {
      color: instance.widgetColor || '#10b981',
      position: instance.widgetPosition || 'right',
      voiceOnly: instance.widgetVoiceOnly,
      autoOpen: instance.widgetAutoOpen,
      greeting: instance.widgetGreeting || null,
      agentName: instance.widgetAgentName || null,
      showBranding: instance.widgetShowBranding,
      logoUrl: instance.widgetLogoUrl || null,
      borderRadius: instance.widgetBorderRadius || 'full',
    },
    { headers: CORS_HEADERS }
  )
}
