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
import { VOICES, findVoice } from '@/lib/voices'
import { ArrowLeft, Trash2, AlertTriangle, X, Volume2, Loader2 } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'

interface AgentConfig {
  id: string
  name: string
  snAgentId: string | null
  active: boolean
  token: string | null
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

  // Voice state
  const [currentVoice, setCurrentVoice] = useState('aura-asteria-en')
  const [savingVoice, setSavingVoice] = useState(false)
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
      })
      .catch(() => toast('Failed to load agent', 'error'))
      .finally(() => setLoading(false))

    // Load current voice from SN
    fetch(`/api/agents/${id}/voice`)
      .then(r => r.json())
      .then(d => { if (d.voice) setCurrentVoice(d.voice) })
      .catch(() => {})
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
        toast('Voice updated on ServiceNow', 'success')
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
