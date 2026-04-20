import { addLog } from './log-store'
import { logAudit } from './audit'

export type AlertSeverity = 'info' | 'warn' | 'error' | 'critical'

export interface Alert {
  tenantId?: string | null
  severity: AlertSeverity
  kind: string
  message: string
  data?: Record<string, unknown>
}

/**
 * Notify the admins of something worth attention (quota near limit, session
 * errors, SN circuit open, etc.). Pluggable sinks below — currently writes to
 * the in-memory log store AND the persistent audit log so nothing is lost on
 * restart. Wire up email/Slack/webhooks here when ready.
 */
export async function notifyAdmins(alert: Alert): Promise<void> {
  const level = alert.severity === 'critical' || alert.severity === 'error' ? 'error'
    : alert.severity === 'warn' ? 'warn'
    : 'info'

  addLog(level, 'alert', '[' + alert.kind + '] ' + alert.message, {
    tenantId: alert.tenantId ?? undefined,
    data: alert.data,
  })

  await logAudit({
    tenantId: alert.tenantId,
    actorType: 'system',
    action: 'alert.' + alert.kind,
    metadata: { severity: alert.severity, message: alert.message, ...(alert.data || {}) },
  })

  // TODO: wire email/Slack transport via env-gated sinks
  // if (process.env.ALERT_WEBHOOK_URL) await fetch(...)
}
