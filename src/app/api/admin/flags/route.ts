export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { listFlags, setFlag } from '@/lib/flags'

export async function GET() {
  const session = await auth()
  if (!isUserAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const flags = await listFlags()
  return NextResponse.json({ flags })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!isUserAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const key = (body?.key || '').trim()
  const tenantId = body?.tenantId || null
  const enabled = !!body?.enabled
  const rolloutPct = Number.isFinite(body?.rolloutPct) ? Math.max(0, Math.min(100, body.rolloutPct)) : 0
  const description = body?.description

  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const realUserId = (session!.user as any).realId || (session!.user as { id: string }).id
  const row = await setFlag({ key, tenantId, enabled, rolloutPct, description, actorId: realUserId })
  return NextResponse.json({ flag: row })
}
