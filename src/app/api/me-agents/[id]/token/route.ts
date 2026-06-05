export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import crypto from 'crypto'

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

  const token = 'me_' + crypto.randomBytes(24).toString('hex')
  const updated = await db.manageEngineAgent.update({ where: { id }, data: { token } })
  return NextResponse.json({ token: updated.token })
}
