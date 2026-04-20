export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'

const MAX_ROWS = 5000

function csvCell(val: unknown): string {
  if (val == null) return ''
  const s = typeof val === 'string' ? val : JSON.stringify(val)
  const needsQuotes = /[",\n\r]/.test(s)
  const escaped = s.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return new Response('Forbidden', { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const where: Record<string, unknown> = {}
  const action = sp.get('action')
  const tenantId = sp.get('tenantId')
  const actorId = sp.get('actorId')
  const since = sp.get('since')
  if (action) where.action = { contains: action, mode: 'insensitive' }
  if (tenantId) where.tenantId = tenantId
  if (actorId) where.actorId = actorId
  if (since) {
    const d = new Date(since)
    if (!isNaN(d.getTime())) where.createdAt = { gte: d }
  }

  const events = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS,
  })

  const header = ['id', 'createdAt', 'action', 'actorType', 'actorId', 'tenantId', 'targetType', 'targetId', 'metadata'].join(',')
  const lines = events.map((e) =>
    [
      e.id,
      e.createdAt.toISOString(),
      e.action,
      e.actorType,
      e.actorId || '',
      e.tenantId || '',
      e.targetType || '',
      e.targetId || '',
      e.metadata != null ? JSON.stringify(e.metadata) : '',
    ]
      .map(csvCell)
      .join(','),
  )
  const body = [header, ...lines].join('\n')

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
