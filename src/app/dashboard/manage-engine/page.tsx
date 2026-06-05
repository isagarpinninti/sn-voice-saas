'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Plus, ChevronRight, Loader2, Wrench } from 'lucide-react'

interface MEAgent {
  id: string
  name: string
  active: boolean
  meUrl: string
  llmModel: string
  token: string | null
  createdAt: string
}

export default function ManageEnginePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [agents, setAgents] = useState<MEAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', meUrl: '', apiKey: '' })

  useEffect(() => { fetchAgents() }, [])

  async function fetchAgents() {
    try {
      const res = await fetch('/api/me-agents')
      const d = await res.json()
      setAgents(d.agents || [])
    } catch { toast('Failed to load agents', 'error') }
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.meUrl.trim() || !form.apiKey.trim()) {
      toast('Name, ManageEngine URL, and API key are required', 'error'); return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/me-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { toast(data.error || 'Failed to create', 'error'); setCreating(false); return }
      toast('Agent created', 'success')
      router.push(`/dashboard/manage-engine/${data.id}`)
    } catch { toast('Network error', 'error'); setCreating(false) }
  }

  return (
    <div>
      <PageHeader
        title="ManageEngine Agents"
        description="Self-contained voice agents for ManageEngine ServiceDesk — create, update, and check tickets by voice. No ServiceNow required."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Agent
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : agents.length === 0 && !showCreate ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No ManageEngine agents yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create your first agent to start handling IT tickets by voice.</p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Create agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map(agent => (
            <Link key={agent.id} href={`/dashboard/manage-engine/${agent.id}`}>
              <div className="flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Wrench className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">{agent.name}</p>
                    <p className="text-[12px] text-muted-foreground truncate max-w-[300px]">{agent.meUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${agent.active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                    {agent.active ? 'Active' : 'Inactive'}
                  </span>
                  {agent.token && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">Token ready</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-[15px] font-semibold text-foreground mb-4">Create ManageEngine Agent</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Agent name</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. IT Helpdesk Bot" />
              </div>
              <div className="space-y-1.5">
                <Label>ManageEngine URL</Label>
                <Input value={form.meUrl} onChange={e => setForm(p => ({ ...p, meUrl: e.target.value }))} placeholder="https://helpdesk.company.com" />
                <p className="text-[10px] text-muted-foreground/70">Base URL of your ServiceDesk Plus instance.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Technician API Key</Label>
                <Input type="password" value={form.apiKey} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="Your technician_key" />
                <p className="text-[10px] text-muted-foreground/70">Found in ME Admin → API → Technician Key.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Plus className="w-3 h-3 mr-1.5" />}
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
