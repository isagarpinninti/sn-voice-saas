/**
 * Pipeline log store.
 * Writes to Postgres (PipelineLog) so logs survive restarts and are
 * visible across instances. In-memory ring buffer (last 200) for
 * immediate reads without a DB round-trip.
 */

import { db } from './db'

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  source: string
  tenantId?: string
  sessionId?: string
  message: string
  data?: any
}

const MAX_MEM = 200

// In-memory ring for fast /api/admin/logs reads
const globalStore = globalThis as unknown as { __zevoxLogs?: LogEntry[]; __zevoxCounter?: number }
if (!globalStore.__zevoxLogs) globalStore.__zevoxLogs = []
if (!globalStore.__zevoxCounter) globalStore.__zevoxCounter = 0

const memLogs = globalStore.__zevoxLogs

export function addLog(level: LogEntry['level'], source: string, message: string, extra?: { tenantId?: string; sessionId?: string; data?: any }) {
  globalStore.__zevoxCounter = (globalStore.__zevoxCounter || 0) + 1
  const entry: LogEntry = {
    id: `log_${globalStore.__zevoxCounter}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    tenantId: extra?.tenantId,
    sessionId: extra?.sessionId,
    data: extra?.data,
  }

  memLogs.unshift(entry)
  if (memLogs.length > MAX_MEM) memLogs.pop()

  // Persist to DB fire-and-forget — never block the hot voice path
  db.pipelineLog.create({
    data: {
      level,
      source,
      message,
      tenantId: extra?.tenantId ?? null,
      sessionId: extra?.sessionId ?? null,
      data: extra?.data ?? undefined,
    },
  }).catch(() => {})

  const prefix = `[${source.toUpperCase()}]`
  if (level === 'error') console.error(prefix, message, extra?.data || '')
  else if (level === 'warn') console.warn(prefix, message)
  else console.log(prefix, message)
}

export async function getLogs(options?: {
  level?: string
  source?: string
  tenantId?: string
  limit?: number
  since?: string
}): Promise<LogEntry[]> {
  const limit = options?.limit || 100

  try {
    const where: any = {}
    if (options?.level) where.level = options.level
    if (options?.source) where.source = options.source
    if (options?.tenantId) where.tenantId = options.tenantId
    if (options?.since) where.timestamp = { gt: new Date(options.since) }

    const rows = await db.pipelineLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp.toISOString(),
      level: r.level as LogEntry['level'],
      source: r.source,
      tenantId: r.tenantId ?? undefined,
      sessionId: r.sessionId ?? undefined,
      message: r.message,
      data: r.data ?? undefined,
    }))
  } catch {
    // DB unavailable — fall back to in-memory
    let filtered = memLogs
    if (options?.level) filtered = filtered.filter(l => l.level === options.level)
    if (options?.source) filtered = filtered.filter(l => l.source === options.source)
    if (options?.tenantId) filtered = filtered.filter(l => l.tenantId === options.tenantId)
    if (options?.since) {
      const sinceDate = new Date(options.since)
      filtered = filtered.filter(l => new Date(l.timestamp) > sinceDate)
    }
    return filtered.slice(0, limit)
  }
}

export async function getStats() {
  const now = new Date()
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)

  try {
    const [totalLogs, recentErrors, recentConnections, recentDisconnects, tenantRows] = await Promise.all([
      db.pipelineLog.count(),
      db.pipelineLog.count({ where: { level: 'error', timestamp: { gt: fiveMinAgo } } }),
      db.pipelineLog.count({ where: { message: { contains: 'Connected' }, timestamp: { gt: fiveMinAgo } } }),
      db.pipelineLog.count({ where: { message: { contains: 'Disconnected' }, timestamp: { gt: fiveMinAgo } } }),
      db.pipelineLog.findMany({ where: { tenantId: { not: null }, timestamp: { gt: fiveMinAgo } }, select: { tenantId: true }, distinct: ['tenantId'] }),
    ])
    return { totalLogs, recentErrors, recentConnections, recentDisconnects, uniqueTenants: tenantRows.length }
  } catch {
    const recentLogs = memLogs.filter(l => new Date(l.timestamp) > fiveMinAgo)
    return {
      totalLogs: memLogs.length,
      recentErrors: recentLogs.filter(l => l.level === 'error').length,
      recentConnections: recentLogs.filter(l => l.message.includes('Connected')).length,
      recentDisconnects: recentLogs.filter(l => l.message.includes('Disconnected')).length,
      uniqueTenants: [...new Set(recentLogs.filter(l => l.tenantId).map(l => l.tenantId))].length,
    }
  }
}
