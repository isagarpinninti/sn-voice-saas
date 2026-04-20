/**
 * In-memory log store for admin monitoring
 * Stores last 500 log entries with timestamps
 * Accessible via /api/admin/logs
 */

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  source: string  // 'ws' | 'pipeline' | 'sn' | 'stt' | 'tts' | 'llm' | 'server'
  tenantId?: string
  sessionId?: string
  message: string
  data?: any
}

const MAX_LOGS = 500

// Use globalThis so logs persist across module reloads and are shared between server.ts and API routes
const globalStore = globalThis as unknown as { __zevoxLogs?: LogEntry[]; __zevoxCounter?: number }
if (!globalStore.__zevoxLogs) globalStore.__zevoxLogs = []
if (!globalStore.__zevoxCounter) globalStore.__zevoxCounter = 0

const logs = globalStore.__zevoxLogs
let counter = globalStore.__zevoxCounter

export function addLog(level: LogEntry['level'], source: string, message: string, extra?: { tenantId?: string; sessionId?: string; data?: any }) {
  globalStore.__zevoxCounter = (globalStore.__zevoxCounter || 0) + 1
  counter = globalStore.__zevoxCounter
  const entry: LogEntry = {
    id: `log_${counter}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    tenantId: extra?.tenantId,
    sessionId: extra?.sessionId,
    data: extra?.data,
  }

  logs.unshift(entry) // Newest first
  if (logs.length > MAX_LOGS) logs.pop()

  // Also log to console
  const prefix = `[${source.toUpperCase()}]`
  if (level === 'error') console.error(prefix, message, extra?.data || '')
  else if (level === 'warn') console.warn(prefix, message)
  else console.log(prefix, message)
}

export function getLogs(options?: { level?: string; source?: string; tenantId?: string; limit?: number; since?: string }): LogEntry[] {
  let filtered = logs

  if (options?.level) filtered = filtered.filter(l => l.level === options.level)
  if (options?.source) filtered = filtered.filter(l => l.source === options.source)
  if (options?.tenantId) filtered = filtered.filter(l => l.tenantId === options.tenantId)
  if (options?.since) {
    const sinceDate = new Date(options.since)
    filtered = filtered.filter(l => new Date(l.timestamp) > sinceDate)
  }

  return filtered.slice(0, options?.limit || 100)
}

export function getStats() {
  const now = new Date()
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)
  const recentLogs = logs.filter(l => new Date(l.timestamp) > fiveMinAgo)

  return {
    totalLogs: logs.length,
    recentErrors: recentLogs.filter(l => l.level === 'error').length,
    recentConnections: recentLogs.filter(l => l.message.includes('Connected')).length,
    recentDisconnects: recentLogs.filter(l => l.message.includes('Disconnected')).length,
    uniqueTenants: [...new Set(recentLogs.filter(l => l.tenantId).map(l => l.tenantId))].length,
  }
}
