'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'

interface AgentConfig {
  agentName: string | null
  color: string
  position: string
  logoUrl: string | null
  showBranding: boolean
  borderRadius: string
}

function VoicePage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [tokenInput, setTokenInput] = useState('')
  const [activeToken, setActiveToken] = useState<string | null>(null)
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  const formLoaded = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Auto-load if ?token= is in the URL
  useEffect(() => {
    const urlToken = searchParams.get('token')
    if (urlToken) {
      setTokenInput(urlToken)
      handleLaunch(urlToken)
    }
  }, [])

  async function handleLaunch(token?: string) {
    const tk = (token ?? tokenInput).trim()
    if (!tk) { setError('Please enter your API token.'); return }

    setValidating(true)
    setError('')

    try {
      const res = await fetch(`/api/widget/config?token=${encodeURIComponent(tk)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Invalid token. Check it and try again.')
        setValidating(false)
        return
      }
      setConfig(data as AgentConfig)
      setActiveToken(tk)
      // Update URL so it can be bookmarked / shared
      router.replace(`/voice?token=${encodeURIComponent(tk)}`)
      loadWidgets(tk)
    } catch {
      setError('Could not reach the server. Please try again.')
    }
    setValidating(false)
  }

  function loadWidgets(token: string) {
    // ── Form-mode widget (top-center bar) — injected once into the page ──
    if (!formLoaded.current) {
      formLoaded.current = true
      ;(window as any).ZEVOX_TOKEN = token
      ;(window as any).ZEVOX_MODE = 'form'
      const s = document.createElement('script')
      s.src = `${APP_URL}/widget.js`
      document.head.appendChild(s)
    }

    // ── Portal-mode widget (floating corner) — isolated iframe context ──
    // The iframe has its own window so window.__zv never conflicts with #1.
    const iframe = iframeRef.current
    if (!iframe) return
    const safeToken = token.replace(/[^a-zA-Z0-9_\-]/g, '')
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

  function handleReset() {
    setActiveToken(null)
    setConfig(null)
    setError('')
    setTokenInput('')
    formLoaded.current = false
    // Clear portal iframe
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.document.open()
      iframeRef.current.contentWindow?.document.write('<html><body></body></html>')
      iframeRef.current.contentWindow?.document.close()
    }
    // Remove form widget script/DOM
    const zvEl = document.getElementById('zv')
    if (zvEl) zvEl.remove()
    ;(window as any).__zv = false
    router.replace('/voice')
  }

  const accentColor = config?.color || '#10b981'

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Top bar ── */}
      <header style={{ borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>ZeVox</span>
          {config?.agentName && (
            <>
              <span style={{ color: '#d1d5db', margin: '0 2px' }}>/</span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{config.agentName}</span>
            </>
          )}
        </div>
        {activeToken && (
          <button
            onClick={handleReset}
            style={{ fontSize: 12, color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 12px', background: '#fff', cursor: 'pointer' }}
          >
            Try different token
          </button>
        )}
      </header>

      {/* ── Token entry screen ── */}
      {!activeToken && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)', padding: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '40px 44px', width: '100%', maxWidth: 460, boxShadow: '0 4px 32px rgba(0,0,0,0.07)' }}>

            {/* Icon */}
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${accentColor}, ${accentColor} 40%, #0d1117 100%)`, margin: '0 auto 20px', boxShadow: `0 0 0 3px ${accentColor}22, 0 6px 20px ${accentColor}55` }} />

            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', textAlign: 'center', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Launch Voice Agent
            </h1>
            <p style={{ fontSize: 13.5, color: '#6b7280', textAlign: 'center', margin: '0 0 28px', lineHeight: 1.6 }}>
              Enter your ZeVox API token to launch the voice agent widget for your ServiceNow instance.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                API Token
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={e => { setTokenInput(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleLaunch()}
                placeholder="sk_live_…"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 14px',
                  fontSize: 13, fontFamily: 'monospace',
                  border: `1px solid ${error ? '#fca5a5' : '#e5e7eb'}`,
                  borderRadius: 10, outline: 'none',
                  background: error ? '#fff5f5' : '#fff',
                  color: '#111827',
                }}
              />
              {error && (
                <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{error}</p>
              )}
            </div>

            <button
              onClick={() => handleLaunch()}
              disabled={validating}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10, border: 'none',
                background: validating ? '#d1d5db' : '#0d1117',
                color: '#fff', fontSize: 14, fontWeight: 600, cursor: validating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {validating ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Validating…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Launch Widget
                </>
              )}
            </button>

            <p style={{ fontSize: 11.5, color: '#9ca3af', textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
              Find your token in the ZeVox Dashboard under <strong style={{ color: '#6b7280' }}>Agents → Token</strong>.
              <br />You can also bookmark this page with your token as a URL parameter.
            </p>
          </div>
        </div>
      )}

      {/* ── Widget active screen ── */}
      {activeToken && config && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)', padding: 24, textAlign: 'center' }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%', marginBottom: 20,
              background: `radial-gradient(circle at 35% 30%, ${accentColor}, ${accentColor} 40%, #0d1117 100%)`,
              boxShadow: `0 0 0 4px ${accentColor}22, 0 8px 28px ${accentColor}55`,
              animation: 'breathe 2.4s ease-in-out infinite',
            }}
          />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            {config.agentName || 'Voice Agent'} is ready
          </h2>
          <p style={{ fontSize: 13.5, color: '#6b7280', maxWidth: 400, lineHeight: 1.6, margin: '0 0 32px' }}>
            The embedded widget bar has loaded at the top of this page.
            The floating widget is in the bottom-right corner.
            Click either one to start a voice call.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 18px', fontSize: 12.5, color: '#374151', display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
              Form widget — top of page
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 18px', fontSize: 12.5, color: '#374151', display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
              Portal widget — bottom right
            </div>
          </div>

          {/* Shareable URL hint */}
          <div style={{ marginTop: 36, background: '#f3f4f6', borderRadius: 10, padding: '12px 18px', maxWidth: 500, width: '100%', textAlign: 'left' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Shareable link</p>
            <code style={{ fontSize: 11.5, color: '#374151', wordBreak: 'break-all' }}>
              {typeof window !== 'undefined' ? window.location.href : ''}
            </code>
          </div>
        </div>
      )}

      {/* Portal-mode widget iframe — full bottom-right corner, isolated JS context */}
      <iframe
        ref={iframeRef}
        allowTransparency={true}
        scrolling="no"
        src="about:blank"
        style={{
          position: 'fixed', bottom: 0, right: 0,
          width: 420, height: 520,
          border: 'none', background: 'transparent',
          zIndex: 999990, pointerEvents: activeToken ? 'all' : 'none',
        }}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes breathe {
          0%,100% { box-shadow: 0 0 0 4px ${accentColor}22, 0 8px 28px ${accentColor}55 }
          50%      { box-shadow: 0 0 0 8px ${accentColor}33, 0 12px 36px ${accentColor}80 }
        }
      `}</style>
    </div>
  )
}

export default function VoicePageWrapper() {
  return (
    <Suspense>
      <VoicePage />
    </Suspense>
  )
}
