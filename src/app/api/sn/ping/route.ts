export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateSnRequest } from '@/lib/sn-auth'

export async function GET(req: Request) {
  const auth = await authenticateSnRequest(req)
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'Invalid or missing API key' }, { status: 401 })
  }

  const tenant = await db.tenant.findUnique({
    where: { id: auth.tenantId },
    select: { id: true, company: true },
  })

  return NextResponse.json({
    ok: true,
    tenant: tenant ? { id: tenant.id, name: tenant.company || tenant.id } : null,
    instanceId: auth.instanceId,
    serverTime: new Date().toISOString(),
  })
}
