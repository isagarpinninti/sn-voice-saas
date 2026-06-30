'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

interface LogEntry {
  id: string
  timestamp: string
  level: string
  source: string
  tenantId?: string
  sessionId?: string
  message: string
  data?: unknown
}

interface LogStats {
  recentConnections?: number
  recentErrors?: number
  uniqueTenants?: number
  totalLogs?: number
}

interface TenantOption {
  id: string
  label: string
}

export default function LiveLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats>({})
  const [filter, setFilter] = useState({ level: '', source: '', tenantId: '' })
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load tenant list once for the filter dropdown
  useEffect(() => {
    fetch('/api/admin/tenants')
      .then((r) => r.json())
      .then((d) => {
        const opts: TenantOption[] = (d.tenants || []).map((t: { id: string; user: { name: string | null; email: string | null } }) => ({
          id: t.id,
          label: t.user?.name || t.user?.email || t.id.substring(0, 8),
        }))
        setTenants(opts)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchLogs()
    if (!autoRefresh) return
    const interval = setInterval(fetchLogs, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, filter])

  async function fetchLogs() {
    const params = new URLSearchParams()
    if (filter.level) params.set('level', filter.level)
    if (filter.source) params.set('source', filter.source)
    if (filter.tenantId) params.set('tenantId', filter.tenantId)
    params.set('limit', '200')
    try {
      const res = await fetch('/api/admin/logs?' + params.toString())
      if (!res.ok) {
        setError('Failed to load logs — ' + res.status)
        return
      }
      const d = await res.json()
      setLogs(d.logs || [])
      setStats(d.stats || {})
      setError(null)
    } catch {
      setError('Network error')
    }
  }

  // Color-coded levels and sources stay multi-color so admins can scan log streams visually
  const levelColors: Record<string, string> = {
    error: 'text-red-400 bg-red-500/10',
    warn: 'text-amber-400 bg-amber-500/10',
    info: 'text-emerald-400 bg-emerald-500/10',
    debug: 'text-muted-foreground bg-muted',
  }
  const sourceColors: Record<string, string> = {
    ws: 'text-blue-400',
    pipeline: 'text-purple-400',
    sn: 'text-amber-400',
    stt: 'text-cyan-400',
    tts: 'text-pink-400',
    llm: 'text-indigo-400',
    server: 'text-muted-foreground',
  }

  const selectClass =
    'text-[11px] bg-card border border-border rounded-md px-2 py-1.5 text-foreground outline-none focus:border-primary/50 transition-colors'

  return (
    <div>
      <PageHeader
        title="Live Logs"
        description="Real-time pipeline, ServiceNow, and gateway events. Filter by level or source. Auto-refreshes every 3 seconds."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? '● Live' : '○ Paused'}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Stats + filters */}
      <Card className="mb-4">
        <CardContent className="p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-5 text-[12px]">
            <span className="text-muted-foreground/60">Last 5 min:</span>
            <span className="text-emerald-400 tabular-nums">{stats.recentConnections || 0} conn</span>
            <span className="text-red-400 tabular-nums">{stats.recentErrors || 0} errors</span>
            <span className="text-foreground tabular-nums">{stats.uniqueTenants || 0} tenants</span>
            <span className="text-muted-foreground/60 tabular-nums">{stats.totalLogs || 0} total</span>
          </div>
          <div className="flex-1" />
          <select
            value={filter.level}
            onChange={(e) => setFilter((f) => ({ ...f, level: e.target.value }))}
            className={selectClass}
          >
            <option value="">All levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <select
            value={filter.source}
            onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value }))}
            className={selectClass}
          >
            <option value="">All sources</option>
            <option value="ws">WebSocket</option>
            <option value="pipeline">Pipeline</option>
            <option value="sn">ServiceNow</option>
            <option value="stt">STT</option>
            <option value="tts">TTS</option>
            <option value="llm">LLM</option>
            <option value="server">Server</option>
          </select>
          <select
            value={filter.tenantId}
            onChange={(e) => setFilter((f) => ({ ...f, tenantId: e.target.value }))}
            className={selectClass}
          >
            <option value="">All tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {filter.tenantId && (
            <button
              type="button"
              onClick={() => setFilter((f) => ({ ...f, tenantId: '' }))}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear tenant filter"
            >
              Clear
            </button>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/10 text-[12.5px] text-destructive">
          {error}
        </div>
      )}

      {/* Log stream */}
      <Card className="overflow-hidden">
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto font-mono text-[12px]">
          {logs.length === 0 && !error && (
            <div className="px-6 py-16 text-center text-muted-foreground">
              <p className="text-[14px] mb-1 text-foreground">No logs yet</p>
              <p className="text-[11px] mt-1">The server logs a startup entry on every restart.</p>
              <p className="text-[11px] mt-0.5">If you see nothing, try refreshing — the server may have just restarted.</p>
              <p className="text-[11px] mt-3 text-muted-foreground/60">Logs also appear when tenants open the voice widget or make API calls.</p>
            </div>
          )}
          {logs.map((log) => (
            <div
              key={log.id}
              className={`px-4 py-2 border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors ${log.level === 'error' ? 'bg-destructive/[0.03]' : ''}`}
              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
            >
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground/70 shrink-0 w-[75px] tabular-nums">
                  {new Date(log.timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span
                  className={`shrink-0 w-[50px] px-1.5 py-0.5 rounded text-[10px] text-center font-medium ${levelColors[log.level] || 'text-muted-foreground'}`}
                >
                  {log.level.toUpperCase()}
                </span>
                <span className={`shrink-0 w-[65px] ${sourceColors[log.source] || 'text-muted-foreground'}`}>
                  {log.source}
                </span>
                <span className="flex-1 text-foreground/90 break-all">{log.message}</span>
                {log.tenantId && (
                  <span className="text-muted-foreground/60 shrink-0">{log.tenantId.substring(0, 8)}</span>
                )}
              </div>
              {expanded === log.id && log.data ? (
                <pre className="mt-2 ml-[200px] p-3 rounded-md bg-background text-[11px] text-muted-foreground overflow-x-auto border border-border">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </Card>
    </div>
  )
}
