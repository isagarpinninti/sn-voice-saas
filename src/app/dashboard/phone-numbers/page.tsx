'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import {
  Phone, Bot, Edit2, Check, X, ExternalLink, Loader2,
  RefreshCw, Search, ShoppingCart, Download, Trash2,
  CheckCircle2, Circle, ChevronRight, AlertCircle, Link2,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ───────────────────────────────────────────────────────────────────

type Agent = { id: string; name: string; active: boolean }

type TwilioConn = {
  connected: boolean
  accountSid: string | null
  accountName: string | null
  planEligible: boolean
}

type OwnedNumber = {
  sid: string
  e164: string
  friendly: string
  capabilities: Record<string, boolean>
  voiceUrl: string | null
  imported: boolean
}

type SearchResult = {
  e164: string
  friendly: string
  region: string
  capabilities: Record<string, boolean>
}

type PhoneNumber = {
  id: string
  e164: string
  friendly: string | null
  provider: string
  active: boolean
  createdAt: string
  agent: { id: string; name: string } | null
  instance: { id: string; name: string; snInstanceUrl: string } | null
}

// ── Step tracker ─────────────────────────────────────────────────────────────

function StepBar({ step, connected, hasNumbers }: { step: number; connected: boolean; hasNumbers: boolean }) {
  const steps = [
    { n: 1, label: 'Connect Twilio', done: connected },
    { n: 2, label: 'Add numbers', done: hasNumbers },
    { n: 3, label: 'Assign to agents', done: false },
  ]
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1 last:flex-none">
          <button
            className={`flex items-center gap-2 text-[12.5px] font-medium transition-colors
              ${step === s.n ? 'text-foreground' : s.done ? 'text-emerald-400' : 'text-muted-foreground'}`}
          >
            {s.done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 text-[9px] font-bold
                ${step === s.n ? 'border-primary text-primary' : 'border-muted-foreground/40 text-muted-foreground/40'}`}>
                {s.n}
              </div>
            )}
            {s.label}
          </button>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-border mx-3" />}
        </div>
      ))}
    </div>
  )
}

// ── Step 1: Connect Twilio ───────────────────────────────────────────────────

function ConnectStep({ conn, onConnected }: { conn: TwilioConn | null; onConnected: () => void }) {
  const { toast } = useToast()
  const [sid, setSid]   = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  async function connect() {
    setSaving(true)
    try {
      const res = await fetch('/api/twilio/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountSid: sid, authToken: token }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      toast(`Connected to ${d.accountName || d.accountSid}`, 'success')
      setSid(''); setToken('')
      onConnected()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally { setSaving(false) }
  }

  async function disconnect() {
    setDisconnecting(true)
    await fetch('/api/twilio/connection', { method: 'DELETE' })
    toast('Disconnected', 'success')
    setDisconnecting(false)
    onConnected()
  }

  if (conn?.connected) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Twilio connected</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {conn.accountName && <span className="font-medium text-foreground">{conn.accountName}</span>}
                  {conn.accountName && ' · '}
                  <span className="font-mono text-[11px]">{conn.accountSid}</span>
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={disconnect} disabled={disconnecting} className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10">
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Instructions */}
      <Card className="bg-muted/30 border-border/60">
        <CardContent className="p-5 space-y-3">
          <p className="text-[13px] font-semibold text-foreground">How to find your Twilio credentials</p>
          <ol className="space-y-2 text-[12.5px] text-muted-foreground">
            <li className="flex gap-2.5">
              <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              Go to{' '}
              <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2 inline-flex items-center gap-1">
                console.twilio.com <ExternalLink className="w-2.5 h-2.5" />
              </a>{' '}
              and sign in (or create a free account).
            </li>
            <li className="flex gap-2.5">
              <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              On the dashboard homepage you&apos;ll see <strong className="text-foreground">Account SID</strong> and <strong className="text-foreground">Auth Token</strong> — click the copy icons.
            </li>
            <li className="flex gap-2.5">
              <span className="w-4 h-4 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              Paste them below. We verify and store them securely (AES-256 encrypted).
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Credentials form */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-wider">Account SID</label>
            <Input
              value={sid}
              onChange={e => setSid(e.target.value)}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="font-mono text-[12.5px]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11.5px] font-medium text-muted-foreground uppercase tracking-wider">Auth Token</label>
            <Input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Your Twilio auth token"
              className="font-mono text-[12.5px]"
            />
          </div>
          <Button
            onClick={connect}
            disabled={!sid || !token || saving}
            className="w-full"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {saving ? 'Verifying…' : 'Connect Twilio account'}
          </Button>
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Your token is encrypted at rest and never returned in API responses.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Step 2: Add numbers ──────────────────────────────────────────────────────

function AddNumbersStep({ agents, onAdded }: { agents: Agent[]; onAdded: () => void }) {
  const { toast } = useToast()
  const [tab, setTab]           = useState<'owned' | 'search'>('owned')
  const [owned, setOwned]       = useState<OwnedNumber[]>([])
  const [loadingOwned, setLoadingOwned] = useState(true)
  const [searchQ, setSearchQ]   = useState({ country: 'US', areaCode: '', contains: '' })
  const [results, setResults]   = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [acting, setActing]     = useState<string | null>(null)

  const loadOwned = useCallback(async () => {
    setLoadingOwned(true)
    try {
      const res = await fetch('/api/twilio/numbers')
      const d   = await res.json()
      if (d.error) { toast(d.error, 'error'); return }
      setOwned(d.numbers || [])
    } finally { setLoadingOwned(false) }
  }, [toast])

  useEffect(() => { loadOwned() }, [loadOwned])

  async function importNumber(n: OwnedNumber) {
    setActing(n.sid)
    try {
      const res = await fetch('/api/twilio/numbers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: n.sid, e164: n.e164, friendly: n.friendly }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Import failed')
      toast(`${n.e164} imported and webhook configured`, 'success')
      await loadOwned()
      onAdded()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setActing(null) }
  }

  async function searchNumbers() {
    setSearching(true)
    try {
      const params = new URLSearchParams({ country: searchQ.country })
      if (searchQ.areaCode) params.set('areaCode', searchQ.areaCode)
      if (searchQ.contains)  params.set('contains', searchQ.contains)
      const res = await fetch(`/api/twilio/numbers/search?${params}`)
      const d   = await res.json()
      if (!res.ok) throw new Error(d.error || 'Search failed')
      setResults(d.numbers || [])
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSearching(false) }
  }

  async function buyNumber(n: SearchResult) {
    setActing(n.e164)
    try {
      const res = await fetch('/api/twilio/numbers/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ e164: n.e164, friendly: n.friendly }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Purchase failed')
      toast(`${n.e164} purchased and configured`, 'success')
      setResults(prev => prev.filter(r => r.e164 !== n.e164))
      await loadOwned()
      onAdded()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setActing(null) }
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
        {(['owned', 'search'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-[12.5px] font-medium transition-all
              ${tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'owned' ? 'Your Twilio numbers' : 'Buy a new number'}
          </button>
        ))}
      </div>

      {tab === 'owned' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-muted-foreground">Numbers in your Twilio account. Click Import to add them here and configure webhooks automatically.</p>
            <Button size="sm" variant="outline" onClick={loadOwned} disabled={loadingOwned} className="shrink-0">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOwned ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loadingOwned ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-secondary/40 animate-pulse" />)}
            </div>
          ) : owned.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <Phone className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-[12.5px] text-muted-foreground">No numbers in your Twilio account yet.</p>
                <p className="text-[11.5px] text-muted-foreground/60 mt-1">Switch to &quot;Buy a new number&quot; to purchase one.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {owned.map(n => (
                <Card key={n.sid} className={n.imported ? 'opacity-60' : ''}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[13px] font-semibold text-foreground">{n.e164}</span>
                        {n.imported && <Badge variant="success" className="text-[10px]">Imported</Badge>}
                        {n.capabilities?.voice && <Badge variant="outline" className="text-[10px]">Voice</Badge>}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground">{n.friendly}</p>
                      {n.voiceUrl && !n.voiceUrl.includes('/api/phone/incoming') && (
                        <p className="text-[11px] text-amber-400 mt-0.5">⚠ Webhook points elsewhere — import will overwrite it</p>
                      )}
                    </div>
                    {!n.imported && (
                      <Button
                        size="sm"
                        onClick={() => importNumber(n)}
                        disabled={acting === n.sid}
                        className="shrink-0"
                      >
                        {acting === n.sid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Import
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-[12.5px] text-muted-foreground">Search for available numbers in your Twilio account&apos;s country. The number will be purchased from Twilio and billed to your Twilio account.</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Country</label>
                  <select
                    value={searchQ.country}
                    onChange={e => setSearchQ(q => ({ ...q, country: e.target.value }))}
                    className="w-full h-9 text-[12.5px] rounded-md border border-input bg-background px-2 outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="US">US</option>
                    <option value="GB">UK</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="IN">India</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Area code</label>
                  <Input value={searchQ.areaCode} onChange={e => setSearchQ(q => ({ ...q, areaCode: e.target.value }))} placeholder="415" className="h-9 text-[12.5px]" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Contains digits</label>
                  <Input value={searchQ.contains} onChange={e => setSearchQ(q => ({ ...q, contains: e.target.value }))} placeholder="555" className="h-9 text-[12.5px]" />
                </div>
              </div>
              <Button onClick={searchNumbers} disabled={searching} className="w-full">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {searching ? 'Searching…' : 'Search available numbers'}
              </Button>
            </CardContent>
          </Card>

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map(n => (
                <Card key={n.e164}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-[13px] font-semibold text-foreground">{n.e164}</span>
                        {n.capabilities?.voice && <Badge variant="outline" className="text-[10px]">Voice</Badge>}
                        {n.capabilities?.SMS && <Badge variant="outline" className="text-[10px]">SMS</Badge>}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground">{n.friendly} · {n.region}</p>
                    </div>
                    <Button size="sm" onClick={() => buyNumber(n)} disabled={acting === n.e164} className="shrink-0">
                      {acting === n.e164 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                      Buy
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 3: Manage (assign + active toggle + delete) ─────────────────────────

function ManageStep({ numbers, agents, onRefresh, onAddNumber }: { numbers: PhoneNumber[]; agents: Agent[]; onRefresh: () => void; onAddNumber: () => void }) {
  const { toast } = useToast()
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editFriendly, setEditFriendly] = useState('')
  const [editAgentId, setEditAgentId]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)

  function startEdit(p: PhoneNumber) {
    setEditingId(p.id)
    setEditFriendly(p.friendly || '')
    setEditAgentId(p.agent?.id || '')
  }

  async function saveEdit(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendly: editFriendly, agentId: editAgentId || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Save failed')
      toast('Saved', 'success')
      setEditingId(null)
      onRefresh()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function toggleActive(p: PhoneNumber) {
    const res = await fetch(`/api/phone-numbers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    if (res.ok) { toast(p.active ? 'Deactivated' : 'Activated', 'success'); onRefresh() }
    else toast('Failed', 'error')
  }

  async function deleteNumber(p: PhoneNumber, releaseTwilio: boolean) {
    setDeleting(p.id)
    try {
      const res = await fetch(`/api/phone-numbers/${p.id}?release=${releaseTwilio}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed') }
      toast(releaseTwilio ? `${p.e164} released from Twilio` : `${p.e164} removed`, 'success')
      onRefresh()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setDeleting(null) }
  }

  if (numbers.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState icon={Phone} title="No numbers added yet" description="Import or buy a number to get started." />
        <Button onClick={onAddNumber} className="mx-auto flex">
          <Phone className="w-4 h-4" /> Add phone number
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end mb-2">
        <Button size="sm" onClick={onAddNumber}>
          <Phone className="w-3.5 h-3.5" /> Add phone number
        </Button>
      </div>
      {numbers.map(p => (
        <Card key={p.id} className={!p.active ? 'opacity-60' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg border border-primary/20 bg-primary/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {editingId === p.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Friendly name</p>
                        <Input value={editFriendly} onChange={e => setEditFriendly(e.target.value)} placeholder="e.g. IT Helpdesk" className="h-8 text-[12px]" autoFocus />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Agent</p>
                        <select
                          value={editAgentId}
                          onChange={e => setEditAgentId(e.target.value)}
                          className="w-full h-8 text-[12px] rounded-md border border-input bg-background px-2 outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">— No agent assigned —</option>
                          {agents.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(p.id)} disabled={saving} className="h-7 text-[11px]">
                        <Check className="w-3 h-3" /> {saving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={saving} className="h-7 text-[11px]">
                        <X className="w-3 h-3" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[13px] font-semibold text-foreground">{p.e164}</span>
                        {p.friendly && <span className="text-[12px] text-muted-foreground">· {p.friendly}</span>}
                        <Badge variant={p.active ? 'success' : 'outline'} className="text-[10px]">{p.active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground mt-0.5 flex-wrap">
                        {p.agent ? (
                          <span className="inline-flex items-center gap-1">
                            <Bot className="w-3 h-3" /> {p.agent.name}
                          </span>
                        ) : (
                          <span className="text-amber-500 inline-flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No agent assigned
                          </span>
                        )}
                        {p.instance && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                            <Link2 className="w-3 h-3" />
                            {p.instance.snInstanceUrl?.replace('https://', '')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {editingId !== p.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(p)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${p.active ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'}`}
                    title={p.active ? 'Deactivate' : 'Activate'}
                  >
                    {p.active ? <Circle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      const release = confirm(`Also release ${p.e164} from your Twilio account? (This cannot be undone — you will stop being charged for it.)`)
                      deleteNumber(p, release)
                    }}
                    disabled={deleting === p.id}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-destructive/60 hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Remove"
                  >
                    {deleting === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed bg-muted/20 mt-2">
        <CardContent className="p-4">
          <p className="text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Tip:</span> You can also assign numbers directly from the{' '}
            <Link href="/dashboard/agents" className="text-primary underline underline-offset-2">agent settings page</Link>.
            The phone number section there shows all numbers assigned to that agent.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PhoneNumbersPage() {
  const { toast } = useToast()
  const [conn, setConn]         = useState<TwilioConn | null>(null)
  const [numbers, setNumbers]   = useState<PhoneNumber[]>([])
  const [agents, setAgents]     = useState<Agent[]>([])
  const [loading, setLoading]   = useState(true)
  const [step, setStep]         = useState(1)

  const load = useCallback(async () => {
    try {
      const [cRes, pRes, aRes] = await Promise.all([
        fetch('/api/twilio/connection'),
        fetch('/api/phone-numbers'),
        fetch('/api/agents'),
      ])
      const [cD, pD, aD] = await Promise.all([cRes.json(), pRes.json(), aRes.json()])
      setConn(cD)
      setNumbers(pD.phoneNumbers || [])
      setAgents(Array.isArray(aD.agents) ? aD.agents : [])

      // Auto-advance step
      if (!cD.connected) setStep(1)
      else if (!(pD.phoneNumbers?.length)) setStep(2)
      else setStep(3)
    } catch { toast('Failed to load', 'error') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Phone Numbers" description="Connect your Twilio account and manage voice numbers." />
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-secondary/40 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (conn && !conn.planEligible) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Phone Numbers" description="Connect your Twilio account and manage voice numbers." />
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-6 flex items-start gap-4">
            <Phone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">Premium plan required</p>
              <p className="text-[12.5px] text-muted-foreground mt-1">
                Phone numbers require a Premium plan.{' '}
                <Link href="/dashboard/billing" className="text-foreground underline underline-offset-2">Upgrade to unlock</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-up max-w-2xl">
      <PageHeader
        title="Phone Numbers"
        description="Connect your Twilio account to add voice numbers to your agents."
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        }
      />

      <StepBar step={step} connected={!!conn?.connected} hasNumbers={numbers.length > 0} />

      {/* Step nav buttons */}
      <div className="flex gap-1 mb-6">
        {[
          { n: 1, label: 'Connect' },
          { n: 2, label: 'Add numbers', disabled: !conn?.connected },
          { n: 3, label: 'Manage', disabled: !conn?.connected || numbers.length === 0 },
        ].map(s => (
          <button
            key={s.n}
            onClick={() => !s.disabled && setStep(s.n)}
            disabled={s.disabled}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5
              ${step === s.n ? 'bg-primary text-primary-foreground' : s.disabled ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
          >
            {s.label}
            {s.n < 3 && !s.disabled && <ChevronRight className="w-3 h-3 opacity-50" />}
          </button>
        ))}
      </div>

      {step === 1 && (
        <ConnectStep conn={conn} onConnected={() => { load(); setStep(conn?.connected ? 1 : 2) }} />
      )}
      {step === 2 && conn?.connected && (
        <AddNumbersStep agents={agents} onAdded={() => { load(); setStep(3) }} />
      )}
      {step === 3 && conn?.connected && (
        <ManageStep numbers={numbers} agents={agents} onRefresh={load} onAddNumber={() => setStep(2)} />
      )}
    </div>
  )
}
