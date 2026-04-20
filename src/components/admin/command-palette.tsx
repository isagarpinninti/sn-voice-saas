'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, User, Bot, Link2, ArrowRight, Search, CornerDownLeft } from 'lucide-react'

type Result = {
  type: 'tenant' | 'user' | 'agent' | 'instance' | 'action'
  id: string
  label: string
  sub?: string
  href: string
}

const TYPE_ICON: Record<Result['type'], React.ComponentType<{ className?: string }>> = {
  tenant: Building2,
  user: User,
  agent: Bot,
  instance: Link2,
  action: ArrowRight,
}

const TYPE_LABEL: Record<Result['type'], string> = {
  tenant: 'Tenant',
  user: 'User',
  agent: 'Agent',
  instance: 'Instance',
  action: 'Navigate',
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [highlight, setHighlight] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setResults([])
      setHighlight(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, {
          signal: ctrl.signal,
        })
        const data = await res.json()
        setResults(Array.isArray(data.results) ? data.results : [])
        setHighlight(0)
      } catch {
        /* aborted */
      } finally {
        setLoading(false)
      }
    }, 140)
    return () => {
      ctrl.abort()
      clearTimeout(t)
    }
  }, [q, open])

  const go = useCallback(
    (r: Result) => {
      setOpen(false)
      router.push(r.href)
    },
    [router],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, Math.max(0, results.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[highlight]
      if (r) go(r)
    }
  }

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        className="hidden md:inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-background/60 hover:bg-accent/40 text-[11px] text-muted-foreground transition-colors"
      >
        <Search className="w-3 h-3" />
        <span>Search</span>
        <kbd className="ml-1 px-1 rounded border border-border bg-muted/40 text-[9px] font-mono text-muted-foreground/80">⌘K</kbd>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[620px] rounded-xl border border-border bg-popover shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tenants, users, agents — or jump to a page…"
            aria-label="Search"
            className="flex-1 bg-transparent outline-none text-[14px] text-foreground placeholder:text-muted-foreground/60"
          />
          {loading && <span className="text-[10px] text-muted-foreground/70">searching…</span>}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-border bg-muted/40 text-[10px] font-mono text-muted-foreground/80">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
          {q.length < 2 ? (
            <div className="px-5 py-8 text-center text-[12.5px] text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-5 py-8 text-center text-[12.5px] text-muted-foreground">
              No results for <span className="text-foreground font-medium">“{q}”</span>.
            </div>
          ) : (
            <div className="py-1">
              {results.map((r, idx) => {
                const Icon = TYPE_ICON[r.type]
                const active = idx === highlight
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => go(r)}
                    className={
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ' +
                      (active ? 'bg-accent/60' : 'hover:bg-accent/30')
                    }
                  >
                    <div
                      className={
                        'w-7 h-7 rounded-md border flex items-center justify-center shrink-0 ' +
                        (active ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/40')
                      }
                    >
                      <Icon className={'w-3.5 h-3.5 ' + (active ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{r.label}</p>
                      {r.sub && <p className="text-[11px] text-muted-foreground truncate">{r.sub}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest hidden sm:inline">
                      {TYPE_LABEL[r.type]}
                    </span>
                    {active && <CornerDownLeft className="w-3 h-3 text-muted-foreground" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-muted-foreground/70 bg-card/30">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded border border-border bg-background font-mono">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded border border-border bg-background font-mono">↵</kbd> open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded border border-border bg-background font-mono">Esc</kbd> close
            </span>
          </div>
          <span>ZeVox Admin</span>
        </div>
      </div>
    </div>
  )
}
