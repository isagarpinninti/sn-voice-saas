'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Plus, Plug, Trash2, ArrowRight } from 'lucide-react'

interface ConnectorSummary {
  id: string
  name: string
  platform: string
  baseUrl: string
  authType: string
  toolCount: number
}

const AUTH_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'api_key', label: 'API key (header)' },
  { value: 'basic_auth', label: 'Basic auth (username/password)' },
  { value: 'oauth2_client_credentials', label: 'OAuth2 client credentials' },
]

const EMPTY_FORM = {
  name: '',
  platform: '',
  baseUrl: '',
  authType: 'none',
  headerName: '',
  apiKey: '',
  username: '',
  password: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
}

export default function ConnectorsPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(true)
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  function load() {
    fetch('/api/connectors')
      .then((r) => r.json())
      .then((d) => setConnectors(d.connectors || []))
      .catch(() => toast('Failed to load connectors', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.platform || !form.baseUrl) {
      toast('Name, platform, and base URL are required', 'error')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        toast('Connector created', 'success')
        setShowCreate(false)
        setForm(EMPTY_FORM)
        load()
      } else {
        toast(data.error || 'Failed to create connector', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setCreating(false)
  }

  async function handleDelete(connectorId: string, name: string) {
    const ok = await confirm({
      title: `Delete ${name}?`,
      description: 'Its tools are deleted and every agent using it loses access. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setDeleting(connectorId)
    try {
      const res = await fetch(`/api/connectors/${connectorId}`, { method: 'DELETE' })
      if (res.ok) {
        toast('Connector deleted', 'success')
        setConnectors((prev) => prev.filter((c) => c.id !== connectorId))
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to delete', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setDeleting(null)
  }

  if (loading) return <p className="text-[13px] text-muted-foreground">Loading...</p>

  return (
    <div>
      <PageHeader
        title="Connectors"
        description="Give your agents tools against any backend — ServiceNow, HaloITSM, or any REST API you already run. Not just ServiceNow."
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />
            New connector
          </Button>
        }
      />

      {showCreate && (
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-5">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Halo ITSM" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label>Platform</Label>
                  <Input value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} placeholder="halo_itsm" />
                  <p className="text-[11px] text-muted-foreground">Free-form identifier — e.g. halo_itsm, servicenow.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://tenant.haloitsm.com" type="url" />
              </div>

              <div className="space-y-1.5">
                <Label>Authentication</Label>
                <Select value={form.authType} onChange={(e) => setForm((f) => ({ ...f, authType: e.target.value }))}>
                  {AUTH_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </div>

              {form.authType === 'api_key' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Header name</Label>
                    <Input value={form.headerName} onChange={(e) => setForm((f) => ({ ...f, headerName: e.target.value }))} placeholder="X-Api-Key" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>API key</Label>
                    <Input value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} type="password" />
                  </div>
                </div>
              )}

              {form.authType === 'basic_auth' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="svc_account" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password</Label>
                    <Input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="password" />
                  </div>
                </div>
              )}

              {form.authType === 'oauth2_client_credentials' && (
                <>
                  <div className="space-y-1.5">
                    <Label>Token URL</Label>
                    <Input value={form.tokenUrl} onChange={(e) => setForm((f) => ({ ...f, tokenUrl: e.target.value }))} placeholder="https://tenant.haloitsm.com/auth/token" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Client ID</Label>
                      <Input value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Client secret</Label>
                      <Input value={form.clientSecret} onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))} type="password" />
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={creating}>{creating ? 'Creating...' : 'Create connector'}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {connectors.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Plug className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-[13px] font-medium text-foreground">No connectors yet</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Connect ServiceNow, HaloITSM, or any REST API to give your agents tools to call.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" />
              Add your first connector
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connectors.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-5 flex items-center justify-between gap-4">
                <Link href={`/dashboard/connectors/${c.id}`} className="min-w-0 flex-1 group">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors">{c.name}</h3>
                    <Badge variant="outline">{c.platform}</Badge>
                  </div>
                  <p className="text-[12px] text-muted-foreground font-mono truncate">{c.baseUrl.replace(/^https?:\/\//, '')}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {c.toolCount} tool{c.toolCount !== 1 ? 's' : ''} · {AUTH_TYPES.find((t) => t.value === c.authType)?.label || c.authType}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/dashboard/connectors/${c.id}`}>
                    <Button size="sm" variant="outline">
                      Manage
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(c.id, c.name)}
                    disabled={deleting === c.id}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
