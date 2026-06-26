/**
 * GET /api/conversations?limit=20&offset=0
 * Fetches paginated conversation sessions from SN via the admin dashboard API.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const instance = await db.instance.findFirst({
    where: { tenantId: tenant.id, active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!instance) return NextResponse.json({ sessions: [], total: 0 })

  const url = new URL(req.url)
  const limit  = Math.min(50, parseInt(url.searchParams.get('limit')  || '20'))
  const offset = Math.max(0,  parseInt(url.searchParams.get('offset') || '0'))

  const authHeader = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')

  try {
    const res = await fetch(
      `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/admin/sessions?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Basic ${authHeader}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) return NextResponse.json({ sessions: [], total: 0, error: `SN returned ${res.status}` })
    const data = await res.json()
    const result = data.result ?? data
    return NextResponse.json({ sessions: result.sessions ?? result ?? [], total: result.total ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ sessions: [], total: 0, error: e.message })
  }
}
