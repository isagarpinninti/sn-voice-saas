import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { db } from '@/lib/db'
import { isRateLimited } from '@/lib/request-rate-limit'
import { generateIceServers } from '@/lib/turn-credentials'

export const dynamic = 'force-dynamic'

const TICKET_TTL_SECONDS = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

/**
 * Mints a short-lived call ticket for the new self-hosted voice-engine path
 * (VoiceConnect merge, Phase 1 — see M6 of the merge plan). Reuses ApiToken
 * as the auth gate, the same lookup /api/widget/config already does — this
 * route is additive, the legacy WS widget path is untouched.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (isRateLimited(`session-token:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: CORS_HEADERS })
  }

  const body = await request.json().catch(() => null)
  const token = body?.token
  const requestedAgentId = body?.agent_id
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400, headers: CORS_HEADERS })
  }

  const apiToken = await db.apiToken.findUnique({ where: { token } })
  if (!apiToken?.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403, headers: CORS_HEADERS })
  }

  // Resolution order mirrors /api/widget/config: token-bound agent first,
  // then an explicitly requested agent (scoped to the token's own tenant —
  // never let one tenant's token mint a ticket for another tenant's agent),
  // then the tenant's oldest active agent as a last resort.
  let agentId = apiToken.agentId
  if (!agentId && typeof requestedAgentId === 'string') {
    const agent = await db.agent.findFirst({
      where: { id: requestedAgentId, tenantId: apiToken.tenantId, active: true },
    })
    agentId = agent?.id ?? null
  }
  if (!agentId) {
    const agent = await db.agent.findFirst({
      where: { tenantId: apiToken.tenantId, active: true },
      orderBy: { createdAt: 'asc' },
    })
    agentId = agent?.id ?? null
  }
  if (!agentId) {
    return NextResponse.json({ error: 'No agent configured' }, { status: 404, headers: CORS_HEADERS })
  }

  const signingKey = process.env.VOICE_SESSION_SIGNING_KEY
  const voiceEngineBaseUrl = process.env.VOICE_ENGINE_BASE_URL
  if (!signingKey || !voiceEngineBaseUrl) {
    return NextResponse.json({ error: 'Voice engine not configured' }, { status: 503, headers: CORS_HEADERS })
  }

  const callSessionId = randomUUID()
  const ticket = await new SignJWT({
    agent_id: agentId,
    tenant_id: apiToken.tenantId,
    call_session_id: callSessionId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(signingKey))

  await db.apiToken.update({ where: { token }, data: { lastUsed: new Date() } })

  return NextResponse.json(
    {
      ticket,
      call_session_id: callSessionId,
      expires_in: TICKET_TTL_SECONDS,
      voice_engine_base_url: voiceEngineBaseUrl,
      ice_servers: await generateIceServers(),
    },
    { headers: CORS_HEADERS },
  )
}
