export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getLogs, getStats } from '@/lib/log-store'
import { isUserAdmin } from '@/lib/admin'

export async function GET(req: Request) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const url = new URL(req.url)
  const level = url.searchParams.get('level') || undefined
  const source = url.searchParams.get('source') || undefined
  const tenantId = url.searchParams.get('tenantId') || undefined
  const limit = parseInt(url.searchParams.get('limit') || '100')
  const since = url.searchParams.get('since') || undefined

  const [logs, stats] = await Promise.all([
    getLogs({ level, source, tenantId, limit, since }),
    getStats(),
  ])

  return NextResponse.json({ logs, stats })
}
