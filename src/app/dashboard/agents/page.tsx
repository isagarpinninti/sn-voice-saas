'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { Bot, Plus, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'

interface Agent {
  id: string
  name: string
  snAgentId: string | null
  active: boolean
  createdAt: string
  token: string | null
  widgetMode: string
}

interface AgentsResponse {
  plan: string
  maxAgents: number
  agentCount: number
  agents: Agent[]
}

export default function AgentsListPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [data, setData] = useState<AgentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', snAgentId: '' })
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchAgents()
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      // Sync all instances
      const instRes = await fetch('/api/instances').then(r => r.json())
      const instances: { id: string }[] = instRes.instances || []
      let totalSynced = 0
      for (const inst of instances) {
        const res = await fetch(`/api/instances/${inst.id}/sync`, { method: 'POST' })
        const d = await res.json()
        totalSynced += d.synced || 0
      }
      toast(totalSynced > 0 ? `Synced ${totalSynced} agent(s) from ServiceNow` : 'Already up to date', 'success')
      await fetchAgents()
    } catch {
      toast('Sync failed', 'error')
    }
    setSyncing(false)
  }

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents')
      const d = await res.json()
      setData(d)
    } catch {
      toast('Failed to load agents', 'error')
    }
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast('Name is required', 'error')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (res.ok) {
        toast('Agent created', 'success')
        router.push(`/dashboard/agents/${d.id}`)
      } else {
        toast(d.error || 'Failed to create agent', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setCreating(false)
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Agents" description="Each agent is a ServiceNow Voice Agent. The orchestrator picks the best one for each conversation." />
        <p className="text-[13px] text-muted-foreground">Loading agents...</p>
      </div>
    )
  }

  const atLimit = data && data.maxAgents !== -1 && data.agentCount >= data.maxAgents
  const limitLabel =
    data && data.maxAgents === -1
      ? `${data.agentCount} agents · Unlimited`
      : data
      ? `${data.agentCount} of ${data.maxAgents} agents`
      : ''

  return (
    <div>
      <PageHeader
        title="Agents"
        description="Each agent maps to a ServiceNow Voice Agent. Sync to pull the latest agents from your ServiceNow instance."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? 'Syncing...' : 'Sync from SN'}
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              disabled={!!atLimit}
              title={atLimit ? `Limit reached on your current plan` : undefined}
            >
              <Plus className="w-3.5 h-3.5" />
              New agent
            </Button>
          </div>
        }
      />

      {/* Plan / count badge */}
      {data && (
        <div className="mb-6 inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-card text-[11px] text-muted-foreground">
          <Bot className="w-3 h-3" />
          {limitLabel}
          {atLimit && (
            <Link href="/dashboard/billing" className="text-primary hover:text-primary/80 ml-1 transition-colors">
              · Upgrade
            </Link>
          )}
        </div>
      )}

      {/* Create agent inline form */}
      {showCreate && (
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-5">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Agent name</Label>
                <Input
                  id="agent-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. IT Support Bot"
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground/70">For your reference only — not shown to users.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sn-agent-id">ServiceNow Voice Agent sys_id</Label>
                <Input
                  id="sn-agent-id"
                  value={form.snAgentId}
                  readOnly
                  placeholder="Auto-synced from ServiceNow"
                  className="font-mono text-[12px] bg-muted/50 cursor-not-allowed"
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Read-only — populated automatically by SaaS sync from ServiceNow.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? 'Creating...' : 'Create agent'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Agents grid */}
      {data && data.agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="Create your first agent or configure SaaS sync in ServiceNow to auto-create agents."
          action={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              Create your first agent
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.agents.map((a) => (
            <Link key={a.id} href={`/dashboard/agents/${a.id}`} className="block group">
              <Card className="h-full hover:border-border/80 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[14px] font-semibold text-foreground truncate">{a.name}</p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground transition-colors shrink-0" />
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate mb-2">
                        {a.snAgentId ? `sys_id: ${a.snAgentId.substring(0, 16)}...` : 'No SN agent linked'}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${a.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted/60 text-muted-foreground'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${a.active ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
                          {a.active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                          {a.widgetMode === 'voice_only' ? '🎙 Voice' : a.widgetMode === 'chat_only' ? '💬 Chat' : '🎙+💬 Both'}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 ml-auto">
                          {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
