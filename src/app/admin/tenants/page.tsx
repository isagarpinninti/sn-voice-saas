'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { CheckCircle2, XCircle, Building2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import Link from 'next/link'

interface Tenant {
  id: string
  plan: string
  snInstanceUrl: string | null
  snUsername: string | null
  snAgentId: string | null
  snPassword: string | null
  company: string | null
  user: { id: string; name: string | null; email: string | null }
}

interface TestResult {
  step: string
  status: 'pass' | 'fail'
  detail: string
}

export default function TenantsPage() {
  const { toast } = useToast()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetch('/api/admin/tenants')
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants || []))
  }, [])

  async function impersonate(userId: string) {
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: userId }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast('Impersonation failed: ' + (err.error || res.status), 'error')
      return
    }
    window.location.href = '/dashboard'
  }

  async function testConnection(tenantId: string) {
    setSelected(tenantId)
    setTesting(true)
    setTestResults([])
    try {
      const res = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      setTestResults(data.results || [])
    } catch {
      setTestResults([{ step: 'Request', status: 'fail', detail: 'API error' }])
    }
    setTesting(false)
  }

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Inspect tenant configuration and test ServiceNow connections from the operator side."
      />

      {tenants.length === 0 ? (
        <EmptyState icon={Building2} title="No tenants" description="Tenants will appear here once users sign up." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Tenant list */}
          <div className="space-y-2 min-w-0">
            {tenants.map((t) => (
              <Card
                key={t.id}
                className={`cursor-pointer transition-colors ${
                  selected === t.id
                    ? 'border-primary/30 bg-primary/[0.03]'
                    : 'hover:border-border/80'
                }`}
                onClick={() => setSelected(t.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">
                        {t.user.name || 'Unknown'}{' '}
                        <span className="text-muted-foreground font-normal">{t.user.email}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge
                          variant={t.plan === 'PREMIUM' || t.plan === 'ENTERPRISE' ? 'default' : t.plan === 'PRO' || t.plan === 'PRO_VOICE' ? 'success' : 'secondary'}
                        >
                          {t.plan}
                        </Badge>
                        {t.snInstanceUrl ? (
                          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                            Not connected
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center px-3 h-8 rounded-md border border-border text-[12px] font-medium text-foreground hover:bg-accent/40 transition-colors"
                      >
                        Details
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          impersonate(t.user.id)
                        }}
                      >
                        Impersonate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          testConnection(t.id)
                        }}
                      >
                        Test
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Detail / Test results */}
          <div className="space-y-4">
            {selected && (() => {
              const t = tenants.find((tt) => tt.id === selected)
              if (!t) return null
              return (
                <>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium mb-3">
                        Configuration
                      </p>
                      <div className="space-y-2 text-[12px]">
                        <Row label="Tenant ID" value={t.id} mono />
                        <Row label="SN Instance" value={t.snInstanceUrl || 'Not set'} status={!!t.snInstanceUrl} />
                        <Row label="SN Username" value={t.snUsername || 'Not set'} status={!!t.snUsername} />
                        <Row label="SN Password" value={t.snPassword ? '●●●●●●●●' : 'Not set'} status={!!t.snPassword} />
                        <Row label="Agent ID" value={t.snAgentId || 'Not set'} status={!!t.snAgentId} mono />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium">
                          Connection test
                        </p>
                        <Button onClick={() => testConnection(t.id)} disabled={testing} size="sm" variant="outline">
                          {testing ? 'Testing...' : 'Run test'}
                        </Button>
                      </div>
                      {testResults.length > 0 ? (
                        <div className="rounded-lg border border-border bg-background overflow-hidden">
                          {testResults.map((r, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2.5 px-3 py-2.5 border-b border-border last:border-b-0"
                            >
                              {r.status === 'pass' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0">
                                <p className="text-[12px] font-medium text-foreground">{r.step}</p>
                                <p className="text-[11px] text-muted-foreground break-all">{r.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-muted-foreground">
                          Click &quot;Run test&quot; to check ServiceNow connectivity for this tenant.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              )
            })()}

            {!selected && (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    Select a tenant to view configuration and run a connection test.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, status, mono }: { label: string; value: string; status?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {status !== undefined && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status ? 'bg-emerald-400' : 'bg-destructive'}`} />
        )}
        <span
          className={`${mono ? 'font-mono text-[11px]' : ''} ${
            status === false ? 'text-destructive' : 'text-foreground'
          } truncate`}
        >
          {value}
        </span>
      </div>
    </div>
  )
}
