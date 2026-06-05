'use client'

import { useState, useEffect, useRef } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Mic, Phone, Loader2 } from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'

interface Agent {
  id: string
  name: string
  snAgentId: string | null
  active: boolean
  token: string | null
}

export default function WidgetPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const formLoaded = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => {
        const list: Agent[] = (d.agents || []).filter((a: Agent) => a.active && a.token)
        setAgents(list)
        // Auto-activate first agent
        if (list.length > 0) activateAgent(list[0])
      })
      .finally(() => setLoading(false))
  }, [])

  function activateAgent(agent: Agent) {
    if (!agent.token || activeId === agent.id) return
    setActiveId(agent.id)

    // ── Form-mode widget (top-center bar, embedded in this page) ──
    // Loaded once — widget.js guards re-entry with window.__zv
    if (!formLoaded.current) {
      formLoaded.current = true
      ;(window as any).ZEVOX_TOKEN = agent.token
      ;(window as any).ZEVOX_MODE = 'form'
      const s = document.createElement('script')
      s.src = `${APP_URL}/widget.js`
      document.head.appendChild(s)
    }

    // ── Portal-mode widget (floating corner) inside an isolated iframe ──
    // The iframe runs in its own window context so window.__zv never clashes
    // with the form widget above. The iframe covers the bottom-right corner
    // only — the rest of the page remains fully interactive.
    const iframe = iframeRef.current
    if (!iframe) return
    const safeToken = agent.token.replace(/[^a-zA-Z0-9_\-]/g, '')
    const safeUrl   = APP_URL.replace(/['"<>]/g, '')
    const html =
      '<!DOCTYPE html><html>' +
      '<head><style>*{margin:0;padding:0}html,body{background:transparent;overflow:hidden}</style></head>' +
      '<body>' +
      `<script>window.ZEVOX_TOKEN="${safeToken}";window.ZEVOX_MODE="portal";<\/script>` +
      `<script src="${safeUrl}/widget.js"><\/script>` +
      '</body></html>'
    iframe.contentWindow?.document.open()
    iframe.contentWindow?.document.write(html)
    iframe.contentWindow?.document.close()
  }

  return (
    <div>
      <PageHeader
        title="Voice Agent Widget"
        description="Select an agent to launch both widgets — the embedded bar (top of page) and the floating corner widget — simultaneously."
      />

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading agents…
        </div>
      )}

      {!loading && agents.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Mic className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No active agents</p>
          <p className="text-xs text-muted-foreground">
            Go to <strong>Agents</strong>, open an agent and click <strong>Sync with SaaS</strong> to generate a token.
          </p>
        </div>
      )}

      {/* Agent cards */}
      <div className="grid gap-3">
        {agents.map(agent => {
          const isActive = activeId === agent.id
          return (
            <button
              key={agent.id}
              onClick={() => activateAgent(agent)}
              className={[
                'w-full text-left rounded-xl border px-5 py-4 flex items-center gap-4 transition-all duration-150',
                'hover:shadow-md hover:-translate-y-[1px]',
                isActive
                  ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'
                  : 'border-border bg-card hover:border-emerald-200',
              ].join(' ')}
            >
              {/* Orb */}
              <div
                className={[
                  'w-11 h-11 rounded-full shrink-0 flex items-center justify-center',
                  'bg-gradient-to-br from-emerald-400 to-gray-900',
                  isActive ? 'shadow-[0_0_0_3px_rgba(16,185,129,0.3),0_4px_18px_rgba(16,185,129,0.5)]' : 'shadow-[0_0_0_2px_rgba(16,185,129,0.15),0_4px_12px_rgba(16,185,129,0.3)]',
                ].join(' ')}
              >
                <Phone className="w-4 h-4 text-white" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-foreground truncate">{agent.name}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {agent.snAgentId ? `SN ID: ${agent.snAgentId.slice(0, 12)}…` : 'Not linked to ServiceNow'}
                </p>
              </div>

              {/* Status badge */}
              <span
                className={[
                  'shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full',
                  isActive
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {isActive ? 'Active' : 'Select'}
              </span>
            </button>
          )
        })}
      </div>

      {agents.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-muted/30 px-5 py-4 text-[12.5px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Form widget</span> — bar fixed at the top of the page; click it to start a call.
          <span className="mx-2 text-border">·</span>
          <span className="font-medium text-foreground">Portal widget</span> — floating orb in the bottom-right corner; always accessible.
        </div>
      )}

      {/* Portal-mode widget iframe — isolated JS context, covers bottom-right corner */}
      <iframe
        ref={iframeRef}
        allowTransparency={true}
        scrolling="no"
        src="about:blank"
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 420,
          height: 520,
          border: 'none',
          background: 'transparent',
          zIndex: 999990,
          pointerEvents: 'all',
        }}
      />
    </div>
  )
}
