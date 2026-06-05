export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

async function getTenantId(userId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId }, select: { id: true } })
  return tenant?.id ?? null
}

async function getOAuthToken(agent: any): Promise<string> {
  const domain = (agent.oauthDomain || 'accounts.zoho.com').replace(/^https?:\/\//, '')
  const res = await fetch(`https://${domain}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: agent.oauthClientId,
      client_secret: agent.oauthClientSecret,
      refresh_token: agent.oauthRefreshToken,
    }).toString(),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('OAuth token refresh failed: ' + (data.error || 'unknown'))
  return data.access_token
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = await getTenantId(session.user.id)
  const { id } = await params

  const agent = await db.manageEngineAgent.findFirst({ where: { id, tenantId: tenantId! } })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const base = agent.meUrl.replace(/\/$/, '')
  const start = Date.now()
  const usesOAuth = !!(agent.oauthRefreshToken && agent.oauthClientId && agent.oauthClientSecret)

  try {
    // Build auth headers
    let authHeaders: Record<string, string>
    if (usesOAuth) {
      try {
        const token = await getOAuthToken(agent)
        authHeaders = { Authorization: `Zoho-oauthtoken ${token}` }
      } catch (e: any) {
        return NextResponse.json({ success: false, error: 'OAuth token refresh failed: ' + e.message, latencyMs: Date.now() - start })
      }
    } else {
      authHeaders = { technician_key: agent.apiKey }
    }

    const res = await fetch(
      `${base}/api/v3/requests?input_data=${encodeURIComponent(JSON.stringify({ list_info: { row_count: 1 } }))}`,
      { headers: authHeaders, signal: AbortSignal.timeout(8000) }
    )
    const latencyMs = Date.now() - start
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ success: false, error: `Authentication failed — ${usesOAuth ? 'check OAuth credentials' : 'check Technician API key'}.`, latencyMs })
    }
    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ success: false, error: `SDP returned HTTP ${res.status}: ${body.substring(0, 100)}`, latencyMs })
    }
    const data = await res.json()
    const count = data.requests?.length ?? 0
    return NextResponse.json({
      success: true,
      message: `Connected via ${usesOAuth ? 'Zoho OAuth' : 'Technician Key'} — fetched ${count} ticket(s) in ${latencyMs}ms`,
      latencyMs,
      authMethod: usesOAuth ? 'oauth' : 'technician_key',
    })
  } catch (err: any) {
    const latencyMs = Date.now() - start
    const msg = err.name === 'TimeoutError'
      ? 'Connection timed out — check the SDP Cloud URL.'
      : `Connection failed: ${err.message}`
    return NextResponse.json({ success: false, error: msg, latencyMs })
  }
}
