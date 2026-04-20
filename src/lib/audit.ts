import { db } from './db'
import { addLog } from './log-store'

export type AuditActorType = 'user' | 'admin' | 'system' | 'impersonator' | 'webhook'

export interface AuditEvent {
  tenantId?: string | null
  actorId?: string | null
  actorType?: AuditActorType
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}

/**
 * Append a row to the audit log. Never throws — audit failures should not
 * break the user's action.
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: event.tenantId ?? null,
        actorId: event.actorId ?? null,
        actorType: event.actorType ?? 'user',
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        metadata: (event.metadata as object) ?? undefined,
      },
    })
  } catch (err: any) {
    addLog('error', 'audit', 'Audit write failed: ' + err.message, {
      tenantId: event.tenantId ?? undefined,
      data: { action: event.action, targetType: event.targetType },
    })
  }
}

/**
 * Query audit events (admin-only callers should gate this).
 */
export async function listAuditEvents(filter: {
  tenantId?: string
  actorId?: string
  action?: string
  since?: Date
  limit?: number
}) {
  return db.auditLog.findMany({
    where: {
      tenantId: filter.tenantId,
      actorId: filter.actorId,
      action: filter.action,
      createdAt: filter.since ? { gte: filter.since } : undefined,
    },
    orderBy: { createdAt: 'desc' },
    take: filter.limit ?? 100,
  })
}
