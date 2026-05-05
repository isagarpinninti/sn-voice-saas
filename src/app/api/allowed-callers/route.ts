export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { normalizeCreateInput } from '@/lib/allowed-callers'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const callers = await db.allowedCaller.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ active: 'desc' }, { name: 'asc' }, { phoneE164: 'asc' }],
  })

  return NextResponse.json({ callers })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = normalizeCreateInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const created = await db.allowedCaller.create({
      data: { ...parsed, tenantId: tenant.id },
    })
    await logAudit({
      tenantId: tenant.id,
      actorId: session.user.id,
      actorType: 'user',
      action: 'allowlist.caller.added',
      targetType: 'AllowedCaller',
      targetId: created.id,
      metadata: { phoneE164: created.phoneE164, name: created.name },
    })
    return NextResponse.json({ caller: created })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: `${parsed.phoneE164} is already on this tenant's allowlist` }, { status: 409 })
    }
    return NextResponse.json({ error: err?.message || 'Create failed' }, { status: 500 })
  }
}
