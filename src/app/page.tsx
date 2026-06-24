'use client'

import { useState } from 'react'
import { PLANS } from '@/lib/plans'
import { cn } from '@/lib/utils'

/* ─── tiny primitives ─────────────────────────────────────────────────────── */

function Check({ dim }: { dim?: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={dim ? '#444' : '#6366f1'} strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      className={dim ? 'opacity-40' : ''}
    >
      <polyline points="20,6 9,17 4,12" />
    </svg>
  )
}

function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/* ─── NAV ─────────────────────────────────────────────────────────────────── */

function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/8"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
    >
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 group">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: '#6366f1', boxShadow: '0 0 14px rgba(99,102,241,0.5)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
            </svg>
          </div>
          <div>
            <span className="text-[14px] font-semibold" style={{ color: '#ededed' }}>ZeVox</span>
            <span className="text-[11px] ml-1.5" style={{ color: '#666' }}>by ZeTechno</span>
          </div>
        </a>

        {/* Desktop links */}
        <nav className="hidden md:flex items-center gap-0.5">
          {[
            { label: 'Features', href: '#features' },
            { label: 'Phone calls', href: '#phone', badge: 'New' },
            { label: 'Pricing', href: '#pricing' },
            { label: 'FAQ', href: '#faq' },
            { label: 'Docs', href: '/docs' },
          ].map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-all"
              style={{ color: '#666' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#a1a1a1'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#666'; (e.currentTarget as HTMLElement).style.background = '' }}
            >
              {l.label}
              {l.badge && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', borderColor: 'rgba(99,102,241,0.25)' }}>
                  {l.badge}
                </span>
              )}
            </a>
          ))}
        </nav>

        {/* Auth CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <a href="/auth" className="px-3 py-1.5 text-[13px] font-medium transition-colors" style={{ color: '#666' }}>
            Log in
          </a>
          <a
            href="/auth"
            className="px-3.5 py-1.5 rounded-lg text-white text-[13px] font-medium transition-colors"
            style={{ background: '#6366f1', boxShadow: '0 0 14px rgba(99,102,241,0.35)' }}
          >
            Start free
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="md:hidden w-8 h-8 flex items-center justify-center"
          style={{ color: '#a1a1a1' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen
              ? <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>
              : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/8 px-5 py-4 space-y-1" style={{ background: '#0a0a0a' }}>
          {['Features', 'Phone calls', 'Pricing', 'FAQ', 'Docs'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(' ', '-')}`}
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-[14px] transition-colors"
              style={{ color: '#a1a1a1' }}
            >
              {l}
            </a>
          ))}
          <div className="pt-3 flex gap-2">
            <a href="/auth" className="flex-1 py-2 text-center rounded-lg text-[13px]" style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1a1' }}>Log in</a>
            <a href="/auth" className="flex-1 py-2 text-center rounded-lg text-[13px] font-medium text-white" style={{ background: '#6366f1' }}>Start free</a>
          </div>
        </div>
      )}
    </header>
  )
}

/* ─── HERO ────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="pt-32 pb-20 px-5 text-center relative overflow-hidden" style={{ background: '#000' }}>
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-30 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.5) 0%, transparent 70%)' }} />

      <div className="relative max-w-4xl mx-auto">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full border border-white/10 bg-white/4 text-[12px]" style={{ color: '#666' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Now with inbound phone calls on Premium
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight mb-5" style={{ color: '#ededed' }}>
          Voice AI for ServiceNow,{' '}
          <span style={{
            background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            done right
          </span>
        </h1>

        <p className="text-[17px] leading-relaxed max-w-2xl mx-auto mb-8" style={{ color: '#a1a1a1' }}>
          A neural-quality voice agent that checks tickets, creates records, and resolves issues —
          embedded as a widget or reached on a real phone number. Managed entirely from your ServiceNow instance.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <a
            href="/auth"
            className="px-6 py-3 rounded-xl text-white text-[15px] font-semibold transition-all"
            style={{ background: '#6366f1', boxShadow: '0 0 24px rgba(99,102,241,0.45)' }}
          >
            Start building free
          </a>
          <a
            href="#phone"
            className="px-6 py-3 rounded-xl border border-white/10 text-[15px] font-semibold transition-all flex items-center gap-2"
            style={{ color: '#a1a1a1' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 3h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            See phone calls on Premium
          </a>
        </div>

        {/* Stat chips */}
        <div className="flex flex-wrap justify-center gap-3 mb-14">
          {[
            { val: '<500ms', label: 'Voice latency' },
            { val: '50 min', label: 'Free to try' },
            { val: '100%', label: 'Managed in SN' },
            { val: '0', label: 'External portals' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/8 bg-white/3">
              <span className="text-[14px] font-bold" style={{ color: '#ededed' }}>{s.val}</span>
              <span className="text-[12px]" style={{ color: '#666' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Comparison table */}
        <div className="max-w-xl mx-auto rounded-2xl overflow-hidden text-left" style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#0a0a0a' }}>
          <div className="grid grid-cols-4 text-[11px] font-semibold uppercase tracking-widest border-b border-white/8 px-5 py-3" style={{ color: '#666' }}>
            <span>Capability</span>
            <span className="text-center">Live agent</span>
            <span className="text-center">Widget</span>
            <span className="text-center">Phone</span>
          </div>
          {[
            ['Available 24 / 7', false, true, true],
            ['No hold time', false, true, true],
            ['Checks & updates tickets', false, true, true],
            ['Natural voice conversation', false, true, true],
            ['No app or widget needed', true, false, true],
            ['Inbound phone number', false, false, true],
          ].map(([label, live, widget, phone]) => (
            <div key={String(label)} className="grid grid-cols-4 items-center px-5 py-3 border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
              <span className="text-[13px]" style={{ color: '#a1a1a1' }}>{String(label)}</span>
              <span className="flex justify-center">{live ? <Check /> : <Cross />}</span>
              <span className="flex justify-center">{widget ? <Check /> : <Cross />}</span>
              <span className="flex justify-center">{phone ? <Check /> : <Check dim />}</span>
            </div>
          ))}
          <div className="px-5 py-2.5 border-t border-white/6" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <span className="text-[10px]" style={{ color: '#666' }}>† Phone channel available on Premium plan</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── SOCIAL PROOF ────────────────────────────────────────────────────────── */

function SocialProof() {
  return (
    <section className="py-10 border-y border-white/6" style={{ background: '#000' }}>
      <div className="max-w-5xl mx-auto px-5">
        <p className="text-center text-[12px] font-semibold uppercase tracking-widest mb-7" style={{ color: '#444' }}>
          Trusted by teams running ServiceNow
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 opacity-40">
          {['Acme Corp', 'TechFlow', 'CloudOps', 'InfraHQ', 'Nexus IT'].map((name) => (
            <span key={name} className="text-[15px] font-semibold tracking-tight" style={{ color: '#a1a1a1' }}>{name}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── CAPABILITIES ────────────────────────────────────────────────────────── */

const CAPS = [
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12" /></svg>,
    color: '#818cf8', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)',
    title: 'Neural voice quality',
    desc: 'Deepgram Nova-3 STT and Aura TTS. Sub-500ms latency with natural turn-taking and barge-in detection.',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="16,18 22,12 16,6" /><polyline points="8,6 2,12 8,18" /></svg>,
    color: '#c084fc', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)',
    title: 'Direct tool execution',
    desc: 'Tools run via GlideRecord on your instance. Check tickets, create incidents, approve requests — by voice.',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" /></svg>,
    color: '#4ade80', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)',
    title: 'Cross-session memory',
    desc: 'The agent remembers users across calls and picks up where the last conversation left off.',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
    color: '#fbbf24', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)',
    title: 'Enterprise security',
    desc: 'Data stays in your ServiceNow instance. PII masking, prompt-injection detection, configurable guardrails.',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
    color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.2)',
    title: 'Streaming pipeline',
    desc: 'STT, LLM, and TTS stream in parallel. First words spoken before the response is fully generated.',
  },
  {
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
    color: '#fb7185', bg: 'rgba(251,113,133,0.1)', border: 'rgba(251,113,133,0.2)',
    title: 'Zero external portals',
    desc: 'Agent config, tools, analytics, conversations — everything managed from ServiceNow.',
  },
]

function Capabilities() {
  return (
    <section id="features" className="py-20 px-5" style={{ background: '#000' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Capabilities</p>
          <h2 className="text-3xl font-bold tracking-tight mb-3" style={{ color: '#ededed' }}>Built for ServiceNow. Not bolted on.</h2>
          <p className="text-[15px] max-w-xl mx-auto" style={{ color: '#666' }}>
            Every feature is designed around how ServiceNow actually works — from GlideRecord to the Service Portal widget API.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CAPS.map((cap) => (
            <div
              key={cap.title}
              className="rounded-xl p-5 transition-all duration-200 group"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#0a0a0a' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLElement).style.background = '#111' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.background = '#0a0a0a' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                style={{ background: cap.bg, color: cap.color, border: `1px solid ${cap.border}` }}
              >
                {cap.icon}
              </div>
              <h3 className="text-[14px] font-semibold mb-1.5" style={{ color: '#ededed' }}>{cap.title}</h3>
              <p className="text-[13px] leading-relaxed" style={{ color: '#666' }}>{cap.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── PHONE SECTION ───────────────────────────────────────────────────────── */

function PhoneSection() {
  return (
    <section id="phone" className="py-20 px-5 border-y border-white/7" style={{ background: '#000' }}>
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full border text-[12px] font-semibold" style={{ borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.08)', color: '#818cf8' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Premium feature
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-4" style={{ color: '#ededed' }}>
              A real phone number for your ServiceNow instance
            </h2>
            <p className="text-[15px] leading-relaxed mb-6" style={{ color: '#666' }}>
              Give employees a number to call — no app, no widget, no login. The same intelligent agent
              handles the call with full ticket access and DTMF menu routing.
            </p>
            <ul className="space-y-3">
              {[
                'Dedicated inbound phone number per instance',
                'DTMF routing for department selection',
                'Same agent context as the web widget',
                'Call recordings with automatic transcription',
                'Works on any phone — mobile or desk',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px]" style={{ color: '#a1a1a1' }}>
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="/auth"
              className="inline-flex mt-7 px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold transition-all"
              style={{ background: '#6366f1', boxShadow: '0 0 18px rgba(99,102,241,0.35)' }}
            >
              Get Premium
            </a>
          </div>

          {/* Chat mockup */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl opacity-20 blur-2xl pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.8) 0%, transparent 70%)' }} />
              <div className="relative rounded-2xl p-6 w-72 shadow-2xl" style={{ border: '1px solid rgba(255,255,255,0.10)', background: '#111' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10.1a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: '#ededed' }}>Inbound call</div>
                    <div className="text-[11px]" style={{ color: '#666' }}>+1 (555) 123-4567</div>
                  </div>
                  <div className="ml-auto">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { role: 'agent', text: "ZeVox here. How can I help you today?" },
                    { role: 'user', text: "My laptop won't connect to VPN since the update." },
                    { role: 'agent', text: "I found INC0045821 open for similar issues. Let me check the latest update..." },
                  ].map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 rounded-xl text-[12px] leading-relaxed ${
                        m.role === 'user'
                          ? 'text-white rounded-br-sm'
                          : 'rounded-bl-sm'
                      }`}
                        style={m.role === 'user'
                          ? { background: '#6366f1' }
                          : { background: '#1a1a1a', color: '#a1a1a1', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-white/6 text-[10px] flex items-center gap-1.5" style={{ color: '#444' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
                  </svg>
                  Streaming · ZeVox Voice Engine · &lt;480ms latency
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── SETUP STEPS ─────────────────────────────────────────────────────────── */

const STEPS = [
  { n: '01', title: 'Connect ServiceNow', desc: 'Enter your instance URL and service account credentials. One-time setup.' },
  { n: '02', title: 'Configure your agent', desc: 'Write the personality, add tools, set guardrails — all from your ServiceNow workspace.' },
  { n: '03', title: 'Add your LLM key', desc: 'Paste your Groq (free) or OpenAI key in the ServiceNow LLM config. You control the model and cost.' },
  { n: '04', title: 'Embed or call', desc: 'Drop the widget into any page — or, on Premium, point a real phone number at your agent.' },
]

function SetupSection() {
  return (
    <section id="setup" className="py-20 px-5" style={{ background: '#000' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Setup</p>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: '#ededed' }}>Five minutes to your first call</h2>
          <p className="text-[15px] mt-3 max-w-xl mx-auto" style={{ color: '#666' }}>
            No custom servers. No extra infrastructure. ZeVox runs inside ServiceNow and your existing cloud.
          </p>
        </div>

        <div className="relative">
          <div className="hidden md:block absolute top-8 left-[calc(12.5%-1px)] right-[calc(12.5%-1px)] h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.10), transparent)' }} />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="relative text-center md:text-left">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto md:mx-0 mb-4" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-[18px] font-bold" style={{ color: '#6366f1' }}>{s.n}</span>
                </div>
                <h3 className="text-[14px] font-semibold mb-2" style={{ color: '#ededed' }}>{s.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#666' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── PRICING ─────────────────────────────────────────────────────────────── */

function Pricing() {
  const [annual, setAnnual] = useState(false)

  const plans = [
    {
      name: PLANS.FREE.name,
      price: '$0',
      period: '',
      tagline: '50 minutes to explore.',
      features: PLANS.FREE.features,
      cta: PLANS.FREE.cta,
      highlight: false,
    },
    {
      name: PLANS.PRO.name,
      price: annual ? `$${Math.round(PLANS.PRO.price * 0.8)}` : `$${PLANS.PRO.price}`,
      period: '/month',
      tagline: 'For teams in production.',
      features: PLANS.PRO.features,
      cta: PLANS.PRO.cta,
      highlight: true,
      badge: 'Most popular',
    },
    {
      name: PLANS.PREMIUM.name,
      price: annual ? `$${Math.round(PLANS.PREMIUM.price * 0.8)}` : `$${PLANS.PREMIUM.price}`,
      period: '/month',
      tagline: 'Unlimited scale + phone.',
      features: PLANS.PREMIUM.features,
      cta: PLANS.PREMIUM.cta,
      highlight: false,
    },
  ]

  return (
    <section id="pricing" className="py-20 px-5" style={{ background: '#000' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>Pricing</p>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: '#ededed' }}>Simple, usage-based pricing</h2>
          <p className="text-[15px] mt-3 mb-6" style={{ color: '#666' }}>Start free. Scale as you grow. Cancel anytime.</p>

          {/* Monthly / Annual toggle */}
          <div className="inline-flex items-center rounded-lg p-0.5" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setAnnual(false)}
              className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all"
              style={{ background: !annual ? 'rgba(255,255,255,0.08)' : '', color: !annual ? '#ededed' : '#666' }}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all flex items-center gap-1.5"
              style={{ background: annual ? 'rgba(255,255,255,0.08)' : '', color: annual ? '#ededed' : '#666' }}
            >
              Annual
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="rounded-2xl p-6 flex flex-col gap-5 relative"
              style={{
                border: plan.highlight ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: plan.highlight ? 'rgba(99,102,241,0.05)' : '#0a0a0a',
                boxShadow: plan.highlight ? '0 0 0 1px rgba(99,102,241,0.15)' : '',
              }}
            >
              {plan.highlight && (
                <div className="absolute -top-px left-6 right-6 h-px" style={{ background: 'linear-gradient(to right, transparent, #6366f1, transparent)' }} />
              )}
              {plan.badge && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-white px-3 py-0.5 rounded-full" style={{ background: '#6366f1' }}>
                  {plan.badge}
                </span>
              )}

              <div>
                <div className="text-[13px] font-semibold mb-1" style={{ color: '#666' }}>{plan.name}</div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[32px] font-bold tracking-tight" style={{ color: '#ededed' }}>{plan.price}</span>
                  {plan.period && <span className="text-[14px]" style={{ color: '#666' }}>{plan.period}</span>}
                </div>
                <div className="text-[13px]" style={{ color: '#666' }}>{plan.tagline}</div>
              </div>

              <ul className="space-y-2.5 flex-1">
                {plan.features.map((f: string) => (
                  <li key={f} className="flex items-start gap-2 text-[13px]" style={{ color: '#a1a1a1' }}>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="/auth"
                className="block text-center py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                style={plan.highlight
                  ? { background: '#6366f1', color: '#fff', boxShadow: '0 0 18px rgba(99,102,241,0.3)' }
                  : { border: '1px solid rgba(255,255,255,0.10)', color: '#a1a1a1' }
                }
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-[12px] mt-6" style={{ color: '#666' }}>
          Need volume, dedicated infra, white-label, or custom SLAs?{' '}
          <a href="mailto:sales@zevox.com" className="transition-colors" style={{ color: '#818cf8' }}>Talk to sales →</a>
        </p>
      </div>
    </section>
  )
}

/* ─── FAQ ─────────────────────────────────────────────────────────────────── */

const FAQ_ITEMS = [
  {
    q: "What's the difference between the widget and phone calls?",
    a: "The widget is a browser-based mic: users click to talk. Phone calls (Premium) let anyone dial a real number — no device pairing, no website visit. Great for support lines, IT helpdesks, and after-hours intake.",
  },
  {
    q: "Which plan includes phone calls?",
    a: "Phone calls are a Premium feature. Premium gets a dedicated inbound number plus everything in Pro. Free and Pro are widget-only.",
  },
  {
    q: "Do I bring my own LLM key?",
    a: "Yes. Paste a Groq (free tier works) or OpenAI key into your ServiceNow LLM config. You own the cost and the model choice.",
  },
  {
    q: "Is my data sent anywhere else?",
    a: "Agent config, tools, and conversation state live on your ServiceNow instance. Only the audio stream touches our STT/TTS providers during a live call.",
  },
  {
    q: "What happens when I hit my monthly minutes?",
    a: "Pro and Premium have per-minute overage so you're never cut off mid-call. You can set a hard cap in your dashboard to prevent overages — sessions will gracefully end when the cap is hit.",
  },
  {
    q: "Can I self-host ZeVox?",
    a: "The ServiceNow scoped app runs entirely inside your instance. The voice pipeline runs on ZeVox infrastructure. Enterprise customers can request a dedicated deployment — contact us.",
  },
]

function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="py-20 px-5 border-t border-white/7" style={{ background: '#000' }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#6366f1' }}>FAQ</p>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: '#ededed' }}>Common questions</h2>
        </div>
        <div className="space-y-1">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-white/3"
              >
                <span className="text-[14px] font-medium pr-4" style={{ color: '#ededed' }}>{item.q}</span>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className={`shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}
                  style={{ color: '#666' }}
                >
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </button>
              {open === i && (
                <div className="px-5 pb-4 border-t border-white/6 bg-white/2">
                  <p className="pt-3 text-[13px] leading-relaxed" style={{ color: '#666' }}>{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── CTA BANNER ──────────────────────────────────────────────────────────── */

function CTABanner() {
  return (
    <section className="py-20 px-5" style={{ background: '#000' }}>
      <div className="max-w-3xl mx-auto text-center">
        <div className="relative rounded-2xl p-10 overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.05)' }}>
          <div className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.6) 0%, transparent 65%)' }} />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight mb-3" style={{ color: '#ededed' }}>
              Give your ServiceNow a voice.
            </h2>
            <p className="text-[15px] mb-7 max-w-lg mx-auto" style={{ color: '#666' }}>
              50 free minutes. No credit card. Full access to the widget, dashboard, and agent configuration.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <a
                href="/auth"
                className="px-6 py-3 rounded-xl text-white text-[14px] font-semibold transition-all"
                style={{ background: '#6366f1', boxShadow: '0 0 24px rgba(99,102,241,0.45)' }}
              >
                Start building free
              </a>
              <a
                href="mailto:hello@zetechno.io"
                className="px-6 py-3 rounded-xl border border-white/10 text-[14px] font-semibold transition-all"
                style={{ color: '#a1a1a1' }}
              >
                Talk to sales
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── FOOTER ──────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-white/7 py-8 px-5" style={{ background: '#000' }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: '#6366f1' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="white">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
            </svg>
          </div>
          <span className="text-[13px]" style={{ color: '#444' }}>© {new Date().getFullYear()} ZeVox — A ZeTechno Product</span>
        </div>
        <div className="flex items-center gap-5">
          {[
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
            { label: 'Documentation', href: '/docs' },
            { label: 'Dashboard', href: '/dashboard' },
          ].map((l) => (
            <a key={l.label} href={l.href} className="text-[13px] transition-colors" style={{ color: '#444' }}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}

/* ─── PAGE ────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div style={{ background: '#000', minHeight: '100vh' }}>
      <Nav />
      <main>
        <Hero />
        <SocialProof />
        <Capabilities />
        <PhoneSection />
        <SetupSection />
        <Pricing />
        <FAQ />
        <CTABanner />
      </main>
      <Footer />
    </div>
  )
}
