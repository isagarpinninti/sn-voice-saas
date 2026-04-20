'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Search, Download, X } from 'lucide-react'

export function AuditFilters() {
  const router = useRouter()
  const sp = useSearchParams()
  const [pending, start] = useTransition()

  const [action, setAction] = useState(sp.get('action') || '')
  const [tenantId, setTenantId] = useState(sp.get('tenantId') || '')
  const [actorId, setActorId] = useState(sp.get('actorId') || '')
  const [since, setSince] = useState(sp.get('since') || '')

  const apply = (e: FormEvent) => {
    e.preventDefault()
    const p = new URLSearchParams()
    if (action.trim()) p.set('action', action.trim())
    if (tenantId.trim()) p.set('tenantId', tenantId.trim())
    if (actorId.trim()) p.set('actorId', actorId.trim())
    if (since.trim()) p.set('since', since.trim())
    start(() => router.push(`/admin/audit${p.toString() ? `?${p.toString()}` : ''}`))
  }

  const clear = () => {
    setAction('')
    setTenantId('')
    setActorId('')
    setSince('')
    start(() => router.push('/admin/audit'))
  }

  const hasFilters = action || tenantId || actorId || since

  const exportUrl = (() => {
    const p = new URLSearchParams()
    if (action.trim()) p.set('action', action.trim())
    if (tenantId.trim()) p.set('tenantId', tenantId.trim())
    if (actorId.trim()) p.set('actorId', actorId.trim())
    if (since.trim()) p.set('since', since.trim())
    return `/api/admin/audit/export${p.toString() ? `?${p.toString()}` : ''}`
  })()

  return (
    <form onSubmit={apply} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-6">
      <div>
        <Label htmlFor="action">Action</Label>
        <Input
          id="action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="tenant.update"
        />
      </div>
      <div>
        <Label htmlFor="tenantId">Tenant ID</Label>
        <Input
          id="tenantId"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          placeholder="cmn..."
        />
      </div>
      <div>
        <Label htmlFor="actorId">Actor ID</Label>
        <Input
          id="actorId"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          placeholder="cmn..."
        />
      </div>
      <div>
        <Label htmlFor="since">Since</Label>
        <Input
          id="since"
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} size="sm">
          <Search className="w-3.5 h-3.5 mr-1.5" />
          {pending ? 'Filtering…' : 'Filter'}
        </Button>
        {hasFilters && (
          <Button type="button" onClick={clear} size="sm" variant="outline">
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
        <a
          href={exportUrl}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-foreground hover:bg-accent/40 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </a>
      </div>
    </form>
  )
}
