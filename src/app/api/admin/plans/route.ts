export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { invalidatePlansCache } from '@/lib/plans-db'
import { logAudit } from '@/lib/audit'

export async function GET() {
  const session = await auth()
  if (!isUserAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const plans = await db.planDefinition.findMany({ orderBy: { displayOrder: 'asc' } })
  return NextResponse.json({ plans })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!isUserAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const key = (body?.key || '').trim().toUpperCase()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const features = Array.isArray(body.features) ? body.features : []

  const data = {
    key,
    name: String(body.name || key),
    price: Number.isFinite(body.price) ? body.price : 0,
    minutesPerMonth: Number.isFinite(body.minutesPerMonth) ? body.minutesPerMonth : 0,
    concurrentLimit: Number.isFinite(body.concurrentLimit) ? body.concurrentLimit : 1,
    maxAgents: Number.isFinite(body.maxAgents) ? body.maxAgents : 1,
    maxInstances: Number.isFinite(body.maxInstances) ? body.maxInstances : 1,
    overageRate: body.overageRate == null ? null : Number(body.overageRate),
    oneTimeTrial: !!body.oneTimeTrial,
    features,
    cta: String(body.cta || 'Get started'),
    popular: !!body.popular,
    displayOrder: Number.isFinite(body.displayOrder) ? body.displayOrder : 100,
    active: body.active !== false,
  }

  const row = await db.planDefinition.upsert({
    where: { key },
    create: data,
    update: data,
  })

  invalidatePlansCache()

  const realUserId = (session!.user as any).realId || (session!.user as { id: string }).id
  await logAudit({
    actorId: realUserId,
    actorType: 'admin',
    action: 'plan.updated',
    targetType: 'PlanDefinition',
    targetId: row.id,
    metadata: { key: row.key, price: row.price, active: row.active },
  })

  return NextResponse.json({ plan: row })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!isUserAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const key = (url.searchParams.get('key') || '').trim().toUpperCase()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  await db.planDefinition.delete({ where: { key } }).catch(() => {})
  invalidatePlansCache()

  const realUserId = (session!.user as any).realId || (session!.user as { id: string }).id
  await logAudit({ actorId: realUserId, actorType: 'admin', action: 'plan.deleted', metadata: { key } })

  return NextResponse.json({ ok: true })
}
