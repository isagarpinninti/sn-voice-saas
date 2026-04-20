export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { AuditFilters } from '@/components/admin/audit-filters'

const PAGE_SIZE = 50

type SearchParams = {
  action?: string
  tenantId?: string
  actorId?: string
  since?: string
  cursor?: string
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!isUserAdmin(session)) redirect('/dashboard')

  const sp = await searchParams

  const where: Record<string, unknown> = {}
  if (sp.action) where.action = { contains: sp.action, mode: 'insensitive' }
  if (sp.tenantId) where.tenantId = sp.tenantId
  if (sp.actorId) where.actorId = sp.actorId
  if (sp.since) {
    const d = new Date(sp.since)
    if (!isNaN(d.getTime())) where.createdAt = { gte: d }
  }

  const take = PAGE_SIZE + 1
  const events = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    ...(sp.cursor ? { cursor: { id: sp.cursor }, skip: 1 } : {}),
  })

  const hasMore = events.length > PAGE_SIZE
  const rows = hasMore ? events.slice(0, PAGE_SIZE) : events

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])]
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true, name: true },
      })
    : []
  const actorMap = new Map(actors.map((a) => [a.id, a]))

  const nextCursor = hasMore ? rows[rows.length - 1].id : null
  const nextHref = (() => {
    if (!nextCursor) return null
    const p = new URLSearchParams()
    if (sp.action) p.set('action', sp.action)
    if (sp.tenantId) p.set('tenantId', sp.tenantId)
    if (sp.actorId) p.set('actorId', sp.actorId)
    if (sp.since) p.set('since', sp.since)
    p.set('cursor', nextCursor)
    return `/admin/audit?${p.toString()}`
  })()

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Audit log"
        description="Every admin action, impersonation, billing event, and webhook. Filter, inspect, export."
      />

      <AuditFilters />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-muted-foreground">
              No audit events match these filters.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((e) => {
                const actor = e.actorId ? actorMap.get(e.actorId) : null
                return (
                  <div key={e.id} className="grid grid-cols-[130px_1fr_auto] gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors text-[12.5px]">
                    <span className="text-muted-foreground/80 tabular-nums font-mono text-[11.5px]">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-foreground">
                        <span className="font-mono text-primary">{e.action}</span>
                        {e.targetType && (
                          <span className="text-muted-foreground">
                            {' '}
                            on {e.targetType}
                            {e.targetId ? (
                              <code className="ml-1 text-[11px] text-muted-foreground/70">{e.targetId.slice(0, 14)}…</code>
                            ) : null}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <span className={
                            e.actorType === 'admin'
                              ? 'w-1.5 h-1.5 rounded-full bg-destructive'
                              : e.actorType === 'impersonator'
                              ? 'w-1.5 h-1.5 rounded-full bg-amber-400'
                              : 'w-1.5 h-1.5 rounded-full bg-emerald-400'
                          } />
                          {e.actorType}
                        </span>
                        {actor && <span>{actor.email || actor.name}</span>}
                        {e.tenantId && (
                          <Link
                            href={`/admin/tenants/${e.tenantId}`}
                            className="font-mono hover:text-foreground transition-colors"
                          >
                            tenant {e.tenantId.slice(0, 10)}…
                          </Link>
                        )}
                      </p>
                      {e.metadata != null && (
                        <pre className="text-[10.5px] text-muted-foreground/60 mt-1.5 bg-muted/20 px-2 py-1 rounded border border-border overflow-x-auto font-mono">
                          {JSON.stringify(e.metadata, null, 0)}
                        </pre>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest self-start">
                      {e.id.slice(0, 8)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mt-5 text-[12px] text-muted-foreground">
        <span>Showing {rows.length} event{rows.length === 1 ? '' : 's'}</span>
        {nextHref && (
          <Link
            href={nextHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-accent/40 transition-colors"
          >
            Next page →
          </Link>
        )}
      </div>
    </div>
  )
}
