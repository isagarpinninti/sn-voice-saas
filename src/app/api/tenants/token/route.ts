export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: { tokens: { where: { active: true }, take: 1 } },
  })

  if (!tenant || !tenant.tokens[0]) return NextResponse.json({ token: '' })
  return NextResponse.json({ token: tenant.tokens[0].token })
}
