/**
 * GET /api/conversations/[id]
 * Returns full session detail + transcript logs from SN.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const instance = await db.instance.findFirst({
    where: { tenantId: tenant.id, active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!instance) return NextResponse.json({ error: 'No instance configured' }, { status: 404 })

  const { id } = await ctx.params
  const authHeader = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')

  try {
    const res = await fetch(
      `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/admin/sessions/${id}`,
      { headers: { Authorization: `Basic ${authHeader}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) return NextResponse.json({ error: `SN returned ${res.status}` }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data.result ?? data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
