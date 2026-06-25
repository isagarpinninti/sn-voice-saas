'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { VOICES } from '@/lib/voices'
import { ArrowLeft, Trash2, AlertTriangle, X, Volume2, Loader2, Copy, Check, Phone, UserPlus, UserMinus, RefreshCw, Users } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'

interface AgentConfig {
  id: string
  name: string
  snAgentId: string | null
  active: boolean
  ttsVoice: string
  token: string | null
  callerGroupSysId: string | null
  callerGroupName: string | null
}

interface AvailablePhone {
  id: string
  e164: string
  friendly: string | null
  agent: { id: string; name: string } | null
}

interface CallerRecord {
  id: string
  phoneE164: string
  name: string | null
  email: string | null
  employeeId: string | null
  snUserSysId: string | null
  active: boolean
}

interface PhoneNumberInfo {
  id: string
  e164: string
  friendly: string | null
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()

  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [copied, setCopied] = useState(false)

  // Voice state
  const [currentVoice, setCurrentVoice] = useState('aura-asteria-en')
  const [savingVoice, setSavingVoice] = useState(false)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Phone + caller group state
  const [phoneNumber, setPhoneNumber] = useState<PhoneNumberInfo | null>(null)
  const [callers, setCallers] = useState<CallerRecord[]>([])
  const [callersLoading, setCallersLoading] = useState(true)
  const [newCallerPhone, setNewCallerPhone] = useState('')
  const [newCallerName, setNewCallerName] = useState('')
  const [newCallerSysId, setNewCallerSysId] = useState('')
  const [addingCaller, setAddingCaller] = useState(false)
  const [removingCaller, setRemovingCaller] = useState<string | null>(null)

  // Phone assignment state
  const [availablePhones, setAvailablePhones] = useState<AvailablePhone[]>([])
  const [phonesLoading, setPhonesLoading] = useState(true)
  const [selectedPhoneId, setSelectedPhoneId] = useState('')
  const [assigningPhone, setAssigningPhone] = useState(false)
  const [unassigningPhone, setUnassigningPhone] = useState(false)

  // Group sync state
  const [syncingGroup, setSyncingGroup] = useState(false)

  useEffect(() => {
    fetch(`/api/agents/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          toast(d.error, 'error')
          router.push('/dashboard/agents')
          return
        }
        setAgent(d)
        if (d.ttsVoice) setCurrentVoice(d.ttsVoice)
      })
      .catch(() => toast('Failed to load agent', 'error'))
      .finally(() => setLoading(false))

    fetch(`/api/agents/${id}/callers`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setCallers(d.callers || [])
        setPhoneNumber(d.phoneNumber || null)
      })
      .catch(() => {})
      .finally(() => setCallersLoading(false))

    fetch('/api/phone-numbers', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setAvailablePhones(d.phoneNumbers || []))
      .catch(() => {})
      .finally(() => setPhonesLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    return () => { if (audioRef.current) audioRef.current.pause() }
  }, [])

  function update<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) {
    setAgent((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave() {
    if (!agent) return
    setSaving(true)
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      })
      if (res.ok) {
        const fresh = await fetch(`/api/agents/${id}`, { cache: 'no-store' }).then((r) => r.json())
        if (!fresh.error) setAgent(fresh)
        toast('Agent saved', 'success')
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to save', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setSaving(false)
  }

  async function handleSelectVoice(voiceId: string) {
    setCurrentVoice(voiceId)
    setSavingVoice(true)
    try {
      const res = await fetch(`/api/agents/${id}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceId }),
      })
      const data = await res.json()
      if (res.ok) {
        toast(data.snWarning || 'Voice updated', 'success')
      } else {
        toast(data.error || 'Failed to update voice', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setSavingVoice(false)
  }

  async function handlePreview(voiceId: string, sampleText: string) {
    // Stop current playback
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playingVoice === voiceId) { setPlayingVoice(null); return }

    setLoadingVoice(voiceId)
    try {
      const res = await fetch(`${APP_URL}/api/voice/preview?voice=${voiceId}&text=${encodeURIComponent(sampleText)}`)
      if (!res.ok) { setLoadingVoice(null); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url) }
      audio.oncanplay = () => { setLoadingVoice(null); setPlayingVoice(voiceId); audio.play() }
      audio.onerror = () => { setLoadingVoice(null); setPlayingVoice(null) }
    } catch {
      setLoadingVoice(null)
    }
  }

  function copySnippet() {
    if (!agent?.token) return
    const snippet = `<script>window.ZEVOX_TOKEN = "${agent.token}";</script>\n<script src="${APP_URL}/widget.js"></script>`
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast('Agent deleted', 'success')
        router.push('/dashboard/agents')
      } else {
        toast('Failed to delete agent', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setDeleting(false)
  }

  async function handleAddCaller() {
    if (!newCallerPhone.trim()) return
    setAddingCaller(true)
    try {
      const res = await fetch(`/api/agents/${id}/callers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneE164: newCallerPhone.trim(),
          name: newCallerName.trim() || null,
          snUserSysId: newCallerSysId.trim() || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCallers((prev) => [...prev, data.caller])
        setNewCallerPhone('')
        setNewCallerName('')
        setNewCallerSysId('')
        toast('Caller added to group', 'success')
      } else {
        toast(data.error || 'Failed to add caller', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setAddingCaller(false)
  }

  async function handleRemoveCaller(callerId: string) {
    setRemovingCaller(callerId)
    try {
      const res = await fetch(`/api/agents/${id}/callers/${callerId}`, { method: 'DELETE' })
      if (res.ok) {
        setCallers((prev) => prev.filter((c) => c.id !== callerId))
        toast('Caller removed', 'success')
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to remove caller', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setRemovingCaller(null)
  }

  async function handleAssignPhone() {
    if (!selectedPhoneId) return
    setAssigningPhone(true)
    try {
      const res = await fetch(`/api/agents/${id}/phone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: selectedPhoneId }),
      })
      if (res.ok) {
        const phone = availablePhones.find((p) => p.id === selectedPhoneId)
        if (phone) setPhoneNumber({ id: phone.id, e164: phone.e164, friendly: phone.friendly })
        setAvailablePhones((prev) => prev.map((p) => ({
          ...p,
          agent: p.id === selectedPhoneId ? { id, name: agent?.name || '' } : (p.agent?.id === id ? null : p.agent),
        })))
        setSelectedPhoneId('')
        toast('Phone number assigned', 'success')
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to assign phone', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setAssigningPhone(false)
  }

  async function handleUnassignPhone() {
    setUnassigningPhone(true)
    try {
      const res = await fetch(`/api/agents/${id}/phone`, { method: 'DELETE' })
      if (res.ok) {
        setPhoneNumber(null)
        setCallers([])
        toast('Phone number unassigned', 'success')
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to unassign phone', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setUnassigningPhone(false)
  }

  async function handleSyncGroup() {
    setSyncingGroup(true)
    try {
      const res = await fetch(`/api/agents/${id}/sync-group`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast(`Synced: ${data.added} added, ${data.updated} updated, ${data.deactivated} deactivated`, 'success')
        // Refresh caller list
        const fresh = await fetch(`/api/agents/${id}/callers`, { cache: 'no-store' }).then((r) => r.json())
        setCallers(fresh.callers || [])
      } else {
        toast(data.error || 'Group sync failed', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setSyncingGroup(false)
  }

  if (loading || !agent) {
    return <p className="text-[13px] text-muted-foreground">Loading agent...</p>
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/agents" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3 h-3" />
          All Agents
        </Link>
      </div>

      <PageHeader
        title={agent.name}
        description="Agent settings — maps to a ServiceNow Voice Agent record."
        actions={
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        }
      />

      <div className="max-w-3xl space-y-10">
        {/* Identity */}
        <Section title="Identity" description="Name and ServiceNow link for this agent.">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Name</Label>
                <Input
                  id="agent-name"
                  value={agent.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. IT Support Bot"
                />
                <p className="text-[10px] text-muted-foreground/70">For your reference only.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sn-id">ServiceNow Voice Agent sys_id</Label>
                <Input
                  id="sn-id"
                  value={agent.snAgentId || ''}
                  readOnly
                  placeholder="Auto-filled by SaaS sync"
                  className="font-mono text-[12px] bg-muted/50 cursor-not-allowed"
                />
                <p className="text-[10px] text-muted-foreground/70">Read-only — synced from ServiceNow.</p>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="active" className="cursor-pointer">Active</Label>
                <input
                  id="active"
                  type="checkbox"
                  checked={agent.active}
                  onChange={(e) => update('active', e.target.checked)}
                  className="accent-primary"
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Inactive agents are excluded from the orchestrator.
                </p>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Embed snippet */}
        {agent.token && (
          <Section title="Embed snippet" description="Paste into any SN UI Page, Workspace widget, or web page to load this specific agent.">
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-2">
                  <pre className="flex-1 px-3 py-2.5 rounded-md bg-background border border-border text-[11px] text-foreground/80 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
{`<script>window.ZEVOX_TOKEN = "${agent.token}";</script>
<script src="${APP_URL}/widget.js"></script>`}
                  </pre>
                  <Button type="button" variant="outline" size="sm" className="shrink-0 mt-0.5" onClick={copySnippet}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  This token is scoped to <strong>{agent.name}</strong> — calls from this snippet always route to this agent, bypassing the orchestrator.
                </p>
              </CardContent>
            </Card>
          </Section>
        )}

        {/* Voice Selection */}
        <Section title="Voice" description="Pick the voice this agent speaks with. Saved directly to ServiceNow. Click to preview.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VOICES.map((v) => {
              const isSelected = currentVoice === v.id
              const isPlaying = playingVoice === v.id
              const isLoading = loadingVoice === v.id
              return (
                <div
                  key={v.id}
                  onClick={() => handleSelectVoice(v.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectVoice(v.id) } }}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  className={`cursor-pointer text-left p-3 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? 'border-primary/60 bg-primary/[0.04] ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{v.name}</span>
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {savingVoice && isSelected && (
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePreview(v.id, v.sampleText) }}
                      className={`p-1 rounded-md transition-colors ${isPlaying ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                      title="Preview voice"
                    >
                      {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${v.gender === 'female' ? 'bg-pink-500/10 text-pink-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {v.gender === 'female' ? 'F' : 'M'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">{v.accent}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{v.description}</p>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Phone Number */}
        <Section title="Phone Number" description="Twilio/Telnyx number assigned to this agent for inbound phone calls.">
          <Card>
            <CardContent className="p-5 space-y-4">
              {callersLoading || phonesLoading ? (
                <p className="text-[13px] text-muted-foreground">Loading...</p>
              ) : phoneNumber ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-foreground font-mono">{phoneNumber.e164}</p>
                      {phoneNumber.friendly && (
                        <p className="text-[11px] text-muted-foreground">{phoneNumber.friendly}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUnassignPhone}
                    disabled={unassigningPhone}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                  >
                    {unassigningPhone ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <X className="w-3 h-3 mr-1.5" />}
                    Unassign
                  </Button>
                </div>
              ) : availablePhones.length === 0 ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Phone className="w-4 h-4 shrink-0" />
                  <p className="text-[13px]">No phone numbers provisioned. Contact your admin to provision one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] text-muted-foreground">Select a phone number to assign to this agent.</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedPhoneId}
                      onChange={(e) => setSelectedPhoneId(e.target.value)}
                      className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">— Select a number —</option>
                      {availablePhones.map((p) => (
                        <option key={p.id} value={p.id} disabled={!!p.agent && p.agent.id !== id}>
                          {p.e164}{p.friendly ? ` (${p.friendly})` : ''}{p.agent && p.agent.id !== id ? ` — used by ${p.agent.name}` : ''}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={handleAssignPhone}
                      disabled={assigningPhone || !selectedPhoneId}
                    >
                      {assigningPhone ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Phone className="w-3 h-3 mr-1.5" />}
                      Assign
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Section>

        {/* Caller Group */}
        <Section
          title="Caller Group"
          description={phoneNumber
            ? 'Only callers in this list can reach this agent by phone. Empty = open access. You can sync from the ServiceNow group set on this agent.'
            : 'Assign a phone number first to configure a caller group.'}
        >
          {callersLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading...</p>
          ) : !phoneNumber ? (
            <Card className="border-dashed">
              <CardContent className="p-5 text-center text-[13px] text-muted-foreground">
                No phone number assigned — caller group unavailable.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-5 space-y-4">
                {/* ServiceNow group sync */}
                {agent.callerGroupSysId && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-foreground truncate">
                          {agent.callerGroupName || 'SN Group'}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{agent.callerGroupSysId}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSyncGroup}
                      disabled={syncingGroup || !phoneNumber}
                      className="shrink-0 ml-3"
                    >
                      {syncingGroup ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                      Sync group
                    </Button>
                  </div>
                )}

                {/* Existing callers */}
                {callers.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground italic">
                    No callers yet — all inbound calls are allowed (open access).
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {callers.map((c) => (
                      <div key={c.id} className="flex items-center justify-between py-2.5 gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground font-mono truncate">{c.phoneE164}</p>
                          {(c.name || c.snUserSysId) && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {c.name}{c.name && c.snUserSysId ? ' · ' : ''}{c.snUserSysId ? <span className="font-mono">{c.snUserSysId}</span> : null}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!c.active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">inactive</span>
                          )}
                          <button
                            onClick={() => handleRemoveCaller(c.id)}
                            disabled={removingCaller === c.id}
                            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Remove caller"
                          >
                            {removingCaller === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new caller */}
                <div className="pt-2 border-t border-border space-y-3">
                  <p className="text-[12px] font-medium text-foreground">Add caller</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Phone (E.164) *</Label>
                      <Input
                        value={newCallerPhone}
                        onChange={(e) => setNewCallerPhone(e.target.value)}
                        placeholder="+14155550123"
                        className="font-mono text-[12px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Name (optional)</Label>
                      <Input
                        value={newCallerName}
                        onChange={(e) => setNewCallerName(e.target.value)}
                        placeholder="Jane Doe"
                        className="text-[12px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">SN sys_id (optional)</Label>
                      <Input
                        value={newCallerSysId}
                        onChange={(e) => setNewCallerSysId(e.target.value)}
                        placeholder="32-char sys_user sys_id"
                        className="font-mono text-[11px]"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddCaller}
                    disabled={addingCaller || !newCallerPhone.trim()}
                  >
                    {addingCaller ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <UserPlus className="w-3 h-3 mr-1.5" />}
                    Add to group
                  </Button>
                  <p className="text-[10px] text-muted-foreground/70">
                    When the caller group has entries, only listed numbers can connect. The SN sys_id enables tool impersonation (the agent acts as that user in ServiceNow).
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </Section>

        {/* Delete */}
        <Section title="Danger zone" description="Permanently remove this agent.">
          <Card className="border-destructive/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Delete agent</p>
                  <p className="text-[11px] text-muted-foreground">
                    This permanently removes the agent and its API tokens. The ServiceNow record is not affected.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Trash2 className="w-3 h-3" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">Delete &ldquo;{agent.name}&rdquo;?</h3>
                <p className="text-[12px] text-muted-foreground mt-1">
                  This will permanently delete the agent and its API tokens. The ServiceNow Voice Agent record will not be deleted.
                </p>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="text-muted-foreground hover:text-foreground ml-auto shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete agent'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
