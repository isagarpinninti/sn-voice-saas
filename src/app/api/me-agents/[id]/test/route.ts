export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

async function getTenantId(userId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId }, select: { id: true } })
  return tenant?.id ?? null
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

  try {
    const res = await fetch(
      `${base}/api/v3/requests?input_data=${encodeURIComponent(JSON.stringify({ list_info: { row_count: 1 } }))}`,
      { headers: { technician_key: agent.apiKey }, signal: AbortSignal.timeout(8000) }
    )
    const latencyMs = Date.now() - start
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ success: false, error: 'Authentication failed — check your Technician API key.', latencyMs })
    }
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `ManageEngine returned HTTP ${res.status}`, latencyMs })
    }
    const data = await res.json()
    const count = data.requests?.length ?? 0
    return NextResponse.json({ success: true, message: `Connected — fetched ${count} recent ticket(s) in ${latencyMs}ms`, latencyMs })
  } catch (err: any) {
    const latencyMs = Date.now() - start
    const msg = err.name === 'TimeoutError'
      ? 'Connection timed out — check the ManageEngine URL and network access.'
      : `Connection failed: ${err.message}`
    return NextResponse.json({ success: false, error: msg, latencyMs })
  }
}
