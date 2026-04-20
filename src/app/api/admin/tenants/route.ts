export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isUserAdmin } from '@/lib/admin'

export async function GET() {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const tenants = await db.tenant.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      instances: {
        where: { active: true },
        select: { id: true, snInstanceUrl: true, snUsername: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Flatten the first active instance onto the tenant payload so the admin
  // UI can show connection status without having to walk instances[].
  const payload = tenants.map(t => ({
    ...t,
    snInstanceUrl: t.instances[0]?.snInstanceUrl ?? null,
    snUsername: t.instances[0]?.snUsername ?? null,
  }))

  return NextResponse.json({ tenants: payload })
}
