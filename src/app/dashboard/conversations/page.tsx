'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { MessageSquare, ChevronRight, X, Loader2, User, Bot, Wrench, RefreshCw } from 'lucide-react'

interface Session {
  sys_id: string
  agent: string
  channel: string
  status: string
  started_at: string
  ended_at: string
  messages: number
  tokens: number
  escalated: boolean
}

interface LogEntry {
  sequence: number
  message_type: string
  message: string
  tool: string
  tool_input: string
  tool_output: string
  token_count: number
  timestamp: string
}

interface SessionDetail {
  sys_id: string
  agent: string
  channel: string
  status: string
  started_at: string
  ended_at: string
  summary: string
  escalated: boolean
  logs: LogEntry[]
}

function statusBadge(status: string) {
  if (status === 'completed') return <Badge variant="success" dot>Completed</Badge>
  if (status === 'active')    return <Badge variant="default" dot>Active</Badge>
  if (status === 'expired')   return <Badge variant="secondary" dot>Expired</Badge>
  return <Badge variant="secondary">{status}</Badge>
}

function channelIcon(channel: string) {
  if (channel === 'phone') return '📞'
  if (channel === 'chat')  return '💬'
  return '🔊'
}

function relativeTime(dt: string) {
  if (!dt) return '—'
  const diff = Date.now() - new Date(dt).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function duration(start: string, end: string) {
  if (!start || !end) return '—'
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function msgIcon(type: string) {
  if (type === 'user')        return <User className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
  if (type === 'agent')       return <Bot className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
  if (type === 'tool_call' || type === 'tool_result') return <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
  return <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
}

export default function ConversationsPage() {
  const { toast } = useToast()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<SessionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const LIMIT = 20

  useEffect(() => { loadSessions(0, true) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSessions(off: number, reset = false) {
    if (reset) setLoading(true); else setRefreshing(true)
    try {
      const res = await fetch(`/api/conversations?limit=${LIMIT}&offset=${off}`)
      const d = await res.json()
      if (d.error && !d.sessions?.length) {
        toast(d.error || 'Failed to load conversations', 'error')
      }
      const rows: Session[] = d.sessions || []
      setSessions(prev => reset ? rows : [...prev, ...rows])
      setHasMore(rows.length === LIMIT)
      setOffset(off + rows.length)
    } catch {
      toast('Failed to load conversations', 'error')
    }
    setLoading(false)
    setRefreshing(false)
  }

  async function openDetail(sysId: string) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/conversations/${sysId}`)
      const d = await res.json()
      if (d.error) { toast(d.error, 'error'); setLoadingDetail(false); return }
      setSelected(d)
    } catch { toast('Failed to load session', 'error') }
    setLoadingDetail(false)
  }

  if (loading) return (
    <div>
      <PageHeader title="Conversations" description="All voice and chat sessions from your ServiceNow instance." />
      <p className="text-[13px] text-muted-foreground">Loading conversations...</p>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Conversations"
        description="All voice and chat sessions from your ServiceNow instance."
        actions={
          <Button size="sm" variant="outline" onClick={() => loadSessions(0, true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
        }
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Sessions appear here once users start interacting with your voice or chat widget."
        />
      ) : (
        <div className="flex gap-6">
          {/* Session list */}
          <div className="flex-1 min-w-0 space-y-2">
            {sessions.map(s => (
              <Card
                key={s.sys_id}
                className={`cursor-pointer transition-colors hover:border-border/80 ${selected?.sys_id === s.sys_id ? 'border-primary/40 bg-primary/[0.02]' : ''}`}
                onClick={() => openDetail(s.sys_id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-lg shrink-0 mt-0.5">{channelIcon(s.channel)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[13px] font-semibold text-foreground truncate">{s.agent || 'Unknown agent'}</span>
                        {statusBadge(s.status)}
                        {s.escalated && <Badge variant="destructive">Escalated</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span>{relativeTime(s.started_at)}</span>
                        <span>·</span>
                        <span>{duration(s.started_at, s.ended_at)}</span>
                        <span>·</span>
                        <span>{s.messages} messages</span>
                        {s.tokens > 0 && <><span>·</span><span>{s.tokens.toLocaleString()} tokens</span></>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))}

            {hasMore && (
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => loadSessions(offset)} disabled={refreshing}>
                {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                Load more
              </Button>
            )}
          </div>

          {/* Detail panel */}
          {(selected || loadingDetail) && (
            <div className="w-[420px] shrink-0">
              <Card className="sticky top-0">
                <CardContent className="p-0">
                  {loadingDetail ? (
                    <div className="flex items-center justify-center h-48">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : selected && (
                    <>
                      {/* Detail header */}
                      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-[13px] font-semibold text-foreground">{selected.agent}</span>
                            {statusBadge(selected.status)}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(selected.started_at).toLocaleString()} · {duration(selected.started_at, selected.ended_at)}
                          </p>
                        </div>
                        <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Summary */}
                      {selected.summary && (
                        <div className="px-4 py-3 border-b border-border bg-muted/30">
                          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium mb-1">Summary</p>
                          <p className="text-[12.5px] text-foreground leading-relaxed">{selected.summary}</p>
                        </div>
                      )}

                      {/* Transcript */}
                      <div className="max-h-[520px] overflow-y-auto px-4 py-3 space-y-3">
                        {selected.logs.length === 0 && (
                          <p className="text-[12px] text-muted-foreground text-center py-6">No transcript available.</p>
                        )}
                        {selected.logs.map((log, i) => {
                          const isUser   = log.message_type === 'user'
                          const isAgent  = log.message_type === 'agent'
                          const isTool   = log.message_type === 'tool_call' || log.message_type === 'tool_result'
                          const isSystem = log.message_type === 'system'
                          if (isSystem) return null
                          return (
                            <div key={i} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                              <div className="shrink-0 mt-0.5">{msgIcon(log.message_type)}</div>
                              <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                                {isTool && (
                                  <p className="text-[9px] text-amber-400/70 uppercase tracking-wider font-medium px-1">
                                    {log.message_type === 'tool_call' ? `Tool: ${log.tool || 'unknown'}` : 'Tool result'}
                                  </p>
                                )}
                                <div className={`px-3 py-2 rounded-xl text-[12px] leading-relaxed break-words ${
                                  isUser  ? 'bg-primary text-primary-foreground rounded-tr-sm' :
                                  isAgent ? 'bg-muted text-foreground rounded-tl-sm' :
                                  'bg-amber-500/10 text-amber-200 rounded-md font-mono text-[11px]'
                                }`}>
                                  {isTool ? (log.message || log.tool_input || log.tool_output || '—') : (log.message || '—')}
                                </div>
                                <p className="text-[10px] text-muted-foreground/50 px-1">
                                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
