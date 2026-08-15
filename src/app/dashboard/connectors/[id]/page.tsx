'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react'

interface Tool {
  id: string
  name: string
  description: string
  method: string
  pathTemplate: string
  timeoutMs: number
  enabled: boolean
}

interface ConnectorDetail {
  id: string
  name: string
  platform: string
  baseUrl: string
  authType: string
  tools: Tool[]
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const EMPTY_TOOL_FORM = {
  name: '',
  description: '',
  method: 'POST',
  pathTemplate: '',
  params: '[]',
  bodyTemplate: '',
  successPath: '',
  template: '',
  errorTemplate: '',
  timeoutMs: 8000,
}

export default function ConnectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [connector, setConnector] = useState<ConnectorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddTool, setShowAddTool] = useState(false)
  const [addingTool, setAddingTool] = useState(false)
  const [toolForm, setToolForm] = useState(EMPTY_TOOL_FORM)
  const [togglingTool, setTogglingTool] = useState<string | null>(null)
  const [deletingTool, setDeletingTool] = useState<string | null>(null)

  function load() {
    fetch(`/api/connectors/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { toast(d.error, 'error'); router.push('/dashboard/connectors'); return }
        setConnector(d)
      })
      .catch(() => toast('Failed to load connector', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddTool(e: React.FormEvent) {
    e.preventDefault()
    if (!toolForm.name || !toolForm.description || !toolForm.pathTemplate || !toolForm.successPath || !toolForm.template || !toolForm.errorTemplate) {
      toast('Name, description, path template, and all response fields are required', 'error')
      return
    }
    setAddingTool(true)
    try {
      const res = await fetch(`/api/connectors/${id}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolForm),
      })
      const data = await res.json()
      if (res.ok) {
        toast('Tool added', 'success')
        setShowAddTool(false)
        setToolForm(EMPTY_TOOL_FORM)
        load()
      } else {
        toast(data.error || 'Failed to add tool', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setAddingTool(false)
  }

  async function toggleTool(toolId: string, enabled: boolean) {
    setTogglingTool(toolId)
    try {
      const res = await fetch(`/api/connectors/${id}/tools/${toolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) {
        setConnector((prev) => prev ? { ...prev, tools: prev.tools.map((t) => t.id === toolId ? { ...t, enabled } : t) } : prev)
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to update tool', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setTogglingTool(null)
  }

  async function deleteTool(toolId: string, name: string) {
    const ok = await confirm({
      title: `Delete tool ${name}?`,
      description: 'Agents using this connector immediately lose access to this tool.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeletingTool(toolId)
    try {
      const res = await fetch(`/api/connectors/${id}/tools/${toolId}`, { method: 'DELETE' })
      if (res.ok) {
        toast('Tool deleted', 'success')
        setConnector((prev) => prev ? { ...prev, tools: prev.tools.filter((t) => t.id !== toolId) } : prev)
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to delete', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setDeletingTool(null)
  }

  if (loading) return <p className="text-[13px] text-muted-foreground">Loading...</p>
  if (!connector) return null

  return (
    <div>
      <Link href="/dashboard/connectors" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="w-3.5 h-3.5" />
        Connectors
      </Link>

      <PageHeader
        title={connector.name}
        description={connector.baseUrl}
        actions={<Badge variant="outline">{connector.platform}</Badge>}
      />

      <Section
        title="Tools"
        description="Each tool is one callable action the agent's LLM can invoke — validated against the same schema the voice engine's executor consumes."
        count={connector.tools.length}
        actions={
          <Button size="sm" variant="outline" onClick={() => setShowAddTool((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />
            Add tool
          </Button>
        }
      >
        {showAddTool && (
          <Card className="mb-4 border-primary/20">
            <CardContent className="p-5">
              <form onSubmit={handleAddTool} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={toolForm.name} onChange={(e) => setToolForm((f) => ({ ...f, name: e.target.value }))} placeholder="halo_create_ticket" autoFocus />
                  <p className="text-[11px] text-muted-foreground">snake_case — this is the LLM function name.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={toolForm.description} onChange={(e) => setToolForm((f) => ({ ...f, description: e.target.value }))} placeholder="Create a new support ticket." rows={2} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={toolForm.method} onChange={(e) => setToolForm((f) => ({ ...f, method: e.target.value }))}>
                      {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Timeout (ms)</Label>
                    <Input type="number" value={toolForm.timeoutMs} onChange={(e) => setToolForm((f) => ({ ...f, timeoutMs: Number(e.target.value) }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Path template</Label>
                  <Input value={toolForm.pathTemplate} onChange={(e) => setToolForm((f) => ({ ...f, pathTemplate: e.target.value }))} placeholder="/api/Tickets/{ticket_id}" className="font-mono text-[12px]" />
                </div>

                <div className="space-y-1.5">
                  <Label>Params (JSON)</Label>
                  <Textarea
                    value={toolForm.params}
                    onChange={(e) => setToolForm((f) => ({ ...f, params: e.target.value }))}
                    rows={4}
                    className="font-mono text-[11px]"
                  />
                  <p className="text-[11px] text-muted-foreground">Array of {'{name, location, type, required}'}. location: path | query | body | header.</p>
                </div>

                <div className="space-y-1.5">
                  <Label>Static body fields (JSON, optional)</Label>
                  <Textarea value={toolForm.bodyTemplate} onChange={(e) => setToolForm((f) => ({ ...f, bodyTemplate: e.target.value }))} placeholder='{ "tickettype_id": 1 }' rows={2} className="font-mono text-[11px]" />
                </div>

                <div className="space-y-1.5">
                  <Label>Success path (JMESPath)</Label>
                  <Input value={toolForm.successPath} onChange={(e) => setToolForm((f) => ({ ...f, successPath: e.target.value }))} placeholder="result.number" className="font-mono text-[12px]" />
                </div>
                <div className="space-y-1.5">
                  <Label>Success message template</Label>
                  <Input value={toolForm.template} onChange={(e) => setToolForm((f) => ({ ...f, template: e.target.value }))} placeholder="Ticket #{result} created." />
                </div>
                <div className="space-y-1.5">
                  <Label>Error message template</Label>
                  <Input value={toolForm.errorTemplate} onChange={(e) => setToolForm((f) => ({ ...f, errorTemplate: e.target.value }))} placeholder="Sorry, that failed ({status})." />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={addingTool}>{addingTool ? 'Adding...' : 'Add tool'}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowAddTool(false)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {connector.tools.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-[13px] text-muted-foreground">No tools yet. Add one so agents on this connector have something to call.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {connector.tools.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-mono font-medium text-foreground">{t.name}</span>
                      <Badge variant="outline" className="text-[10px]">{t.method}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>
                    <p className="text-[10.5px] text-muted-foreground/70 font-mono mt-0.5">{t.pathTemplate}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={t.enabled}
                      disabled={togglingTool === t.id}
                      onCheckedChange={(checked) => toggleTool(t.id, checked)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteTool(t.id, t.name)}
                      disabled={deletingTool === t.id}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    >
                      {deletingTool === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
