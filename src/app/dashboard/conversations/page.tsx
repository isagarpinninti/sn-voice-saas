'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { Avatar } from '@/components/ui/avatar'
import {
  MessageSquare, X, Loader2, User, Bot, Wrench,
  RefreshCw, Search, Clock, Hash,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type HistoryMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | { type: string; text?: string; tool_use_id?: string; name?: string; input?: unknown }[]
  tool_calls?: { id: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  name?: string
}

type ConversationRow = {
  id: string
  sessionId: string
  agentId: string
  agentName: string | null
  snUserId: string | null
  messageCount: number
  userMessageCount: number
  lastMessage: string | null
  lastMessageRole: string | null
  createdAt: string
  updatedAt: string
}

type ConversationDetail = {
  sessionId: string
  agentName: string | null
  snUserId: string | null
  history: HistoryMessage[]
  createdAt: string
  updatedAt: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(dt: string) {
  if (!dt) return '—'
  const diff = Date.now() - new Date(dt).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function msgText(content: HistoryMessage['content']): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(c => (typeof c === 'string' ? c : c.text || c.name || ''))
      .join(' ')
      .trim()
  }
  return ''
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AgentAvatar({ name }: { name: string | null }) {
  return <Avatar name={name} size={32} />
}

function MessageBubble({ msg, idx }: { msg: HistoryMessage; idx: number }) {
  const text = msgText(msg.content)
  if (!text && !msg.tool_calls?.length) return null

  const isUser = msg.role === 'user'
  const isAssistant = msg.role === 'assistant'
  const isTool = msg.role === 'tool'
  const isSystem = msg.role === 'system'

  if (isSystem) return null

  if (isTool) {
    return (
      <div key={idx} className="flex gap-2 items-start">
        <div className="w-5 h-5 rounded bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Wrench className="w-2.5 h-2.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-0.5">
            Tool result{msg.name ? ` · ${msg.name}` : ''}
          </p>
          <div className="bg-amber-500/8 border border-amber-500/15 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-amber-200/80 break-all leading-relaxed">
            {text.length > 300 ? text.slice(0, 300) + '…' : text}
          </div>
        </div>
      </div>
    )
  }

  if (msg.tool_calls?.length) {
    return (
      <div key={idx} className="flex gap-2 items-start">
        <div className="w-5 h-5 rounded bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Wrench className="w-2.5 h-2.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {msg.tool_calls.map((tc, ti) => (
            <div key={ti}>
              <p className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-0.5">
                Calling tool · {tc.function.name}
              </p>
              <div className="bg-amber-500/8 border border-amber-500/15 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-amber-200/80 break-all leading-relaxed">
                {(() => {
                  try {
                    const parsed = JSON.parse(tc.function.arguments)
                    return JSON.stringify(parsed, null, 2).slice(0, 300)
                  } catch {
                    return tc.function.arguments.slice(0, 300)
                  }
                })()}
              </div>
            </div>
          ))}
          {text && (
            <div className="bg-muted rounded-xl px-3 py-2 text-[12.5px] text-foreground leading-relaxed max-w-[88%] rounded-tl-sm">
              {text}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div key={idx} className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {isAssistant && (
        <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 mb-0.5">
          <Bot className="w-2.5 h-2.5 text-emerald-400" />
        </div>
      )}
      {isUser && (
        <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mb-0.5">
          <User className="w-2.5 h-2.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[82%] flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-3 py-2 rounded-2xl text-[12.5px] leading-relaxed break-words ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        }`}>
          {text}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const { toast } = useToast()

  const [sessions, setSessions]       = useState<ConversationRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor]   = useState<string | null>(null)
  const [hasMore, setHasMore]         = useState(false)
  const [search, setSearch]           = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [selected, setSelected]         = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedId, setSelectedId]     = useState<string | null>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const searchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  useEffect(() => { load(true) }, [debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(reset = false) {
    if (reset) { setLoading(true); setNextCursor(null) }
    else setLoadingMore(true)

    try {
      const params = new URLSearchParams({ limit: '25' })
      if (!reset && nextCursor) params.set('cursor', nextCursor)
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await fetch(`/api/conversations?${params}`)
      const d   = await res.json()
      if (d.error) { toast(d.error, 'error'); return }

      setSessions(prev => reset ? d.sessions : [...prev, ...d.sessions])
      setNextCursor(d.nextCursor)
      setHasMore(d.hasMore)
    } catch {
      toast('Failed to load conversations', 'error')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  async function openDetail(s: ConversationRow) {
    if (selectedId === s.sessionId) return
    setSelectedId(s.sessionId)
    setLoadingDetail(true)
    setSelected(null)
    try {
      const res = await fetch(`/api/conversations/${s.sessionId}`)
      const d   = await res.json()
      if (d.error) { toast(d.error, 'error'); setSelectedId(null); return }
      setSelected(d)
      setTimeout(() => transcriptRef.current?.scrollTo({ top: 0 }), 50)
    } catch {
      toast('Failed to load conversation', 'error')
      setSelectedId(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  const filteredSessions = sessions.filter(s => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      s.agentName?.toLowerCase().includes(q) ||
      s.snUserId?.toLowerCase().includes(q) ||
      s.lastMessage?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="animate-fade-up h-full">
      <PageHeader
        title="Conversations"
        description="Chat sessions from your widget — message history, agents, and users."
        actions={
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
        }
      />

      {/* Search bar */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by agent, user or message…"
          className="pl-9 h-9 text-[13px]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-[72px] rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : filteredSessions.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={debouncedSearch ? 'No matches' : 'No conversations yet'}
          description={
            debouncedSearch
              ? 'Try a different search term.'
              : 'Sessions appear here once users start chatting with your widget.'
          }
        />
      ) : (
        <div className="flex gap-5 items-start">
          {/* ── Session list ── */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {filteredSessions.map(s => {
              const isActive = selectedId === s.sessionId
              return (
                <button
                  key={s.id}
                  onClick={() => openDetail(s)}
                  className={`w-full text-left rounded-xl border transition-all px-4 py-3 flex gap-3 items-start group
                    ${isActive
                      ? 'border-primary/40 bg-primary/[0.04] shadow-sm'
                      : 'border-border bg-card hover:border-border/80 hover:bg-secondary/30'
                    }`}
                >
                  <AgentAvatar name={s.agentName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-foreground truncate">
                        {s.agentName || 'Unknown agent'}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{relativeTime(s.updatedAt)}</span>
                    </div>
                    <p className={`text-[12px] truncate mb-1 ${
                      s.lastMessage ? 'text-muted-foreground' : 'text-muted-foreground/40 italic'
                    }`}>
                      {s.lastMessage
                        ? (s.lastMessageRole === 'user' ? 'User: ' : 'Agent: ') + s.lastMessage
                        : 'No messages'}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
                      <span className="inline-flex items-center gap-1">
                        <Hash className="w-2.5 h-2.5" />
                        {s.userMessageCount} {s.userMessageCount === 1 ? 'message' : 'messages'}
                      </span>
                      {s.snUserId && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[120px]">
                          <User className="w-2.5 h-2.5 shrink-0" />
                          {s.snUserId}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}

            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={() => load(false)}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Load more
              </Button>
            )}
          </div>

          {/* ── Detail panel ── */}
          <div className={`w-[400px] shrink-0 transition-opacity ${selectedId ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <Card className="sticky top-4 overflow-hidden">
              {loadingDetail ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : selected && (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AgentAvatar name={selected.agentName} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">
                          {selected.agentName || 'Unknown agent'}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{new Date(selected.createdAt).toLocaleString(undefined, {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelected(null); setSelectedId(null) }}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Meta pills */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {(selected.history as HistoryMessage[]).filter(m => m.role === 'user').length} user msgs
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {(selected.history as HistoryMessage[]).filter(m => m.role === 'assistant').length} agent msgs
                    </Badge>
                    {selected.snUserId && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {selected.snUserId}
                      </Badge>
                    )}
                  </div>

                  {/* Transcript */}
                  <div
                    ref={transcriptRef}
                    className="max-h-[560px] overflow-y-auto px-4 py-4 space-y-3"
                  >
                    {(selected.history as HistoryMessage[]).length === 0 && (
                      <p className="text-[12px] text-muted-foreground text-center py-8">No messages in this session.</p>
                    )}
                    {(selected.history as HistoryMessage[]).map((msg, i) => (
                      <MessageBubble key={i} msg={msg} idx={i} />
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
