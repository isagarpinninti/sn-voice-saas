'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'

type Check = {
  name: string
  category: 'storage' | 'voice' | 'llm' | 'billing' | 'auth' | 'telephony'
  status: 'ok' | 'warn' | 'error'
  latencyMs?: number
  detail: string
}

type HealthResponse = {
  overall: 'ok' | 'warn' | 'error'
  checkedAt: string
  checks: Check[]
}

const CATEGORY_LABEL: Record<Check['category'], string> = {
  storage: 'Storage',
  voice: 'Voice providers',
  telephony: 'Telephony',
  llm: 'LLM providers',
  billing: 'Billing',
  auth: 'Auth',
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' })
      if (!res.ok) {
        setErr('Health check endpoint returned ' + res.status)
        return
      }
      setData((await res.json()) as HealthResponse)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  const grouped = data?.checks.reduce((acc, c) => {
    ;(acc[c.category] ||= []).push(c)
    return acc
  }, {} as Record<Check['category'], Check[]>)

  const overall = data?.overall
  const overallText =
    overall === 'ok'
      ? 'All systems operational'
      : overall === 'warn'
      ? 'Degraded — one or more warnings'
      : overall === 'error'
      ? 'Outage — one or more systems down'
      : 'Checking…'

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="System health"
        description="Live status of databases, voice providers, and billing webhooks. Auto-refreshes every 30 seconds."
        actions={
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-foreground hover:bg-accent/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {/* Overall banner */}
      <div
        className={`mb-8 flex items-center gap-3 px-5 py-4 rounded-xl border ${
          overall === 'ok'
            ? 'border-emerald-500/20 bg-emerald-500/[0.05]'
            : overall === 'warn'
            ? 'border-amber-500/25 bg-amber-500/[0.06]'
            : overall === 'error'
            ? 'border-destructive/25 bg-destructive/[0.06]'
            : 'border-border bg-card/40'
        }`}
      >
        {overall === 'ok' ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        ) : overall === 'warn' ? (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        ) : overall === 'error' ? (
          <XCircle className="w-5 h-5 text-destructive shrink-0" />
        ) : (
          <RefreshCw className="w-5 h-5 text-muted-foreground shrink-0 animate-spin" />
        )}
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">{overallText}</p>
          {data && (
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Last checked {new Date(data.checkedAt).toLocaleTimeString()}
            </p>
          )}
          {err && <p className="text-[11px] text-destructive">{err}</p>}
        </div>
      </div>

      {grouped && (
        <div className="space-y-5">
          {(Object.keys(CATEGORY_LABEL) as Check['category'][]).map((cat) => {
            const items = grouped[cat]
            if (!items?.length) return null
            return (
              <div key={cat}>
                <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium mb-2 px-1">
                  {CATEGORY_LABEL[cat]}
                </p>
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {items.map((c) => (
                        <div key={c.name} className="flex items-center justify-between gap-4 px-5 py-3.5">
                          <div className="flex items-center gap-3 min-w-0">
                            {c.status === 'ok' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : c.status === 'warn' ? (
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-destructive shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-foreground truncate">{c.name}</p>
                              <p className="text-[11.5px] text-muted-foreground truncate">{c.detail}</p>
                            </div>
                          </div>
                          {typeof c.latencyMs === 'number' && (
                            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                              {c.latencyMs}ms
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
