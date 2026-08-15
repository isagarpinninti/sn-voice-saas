'use client'

import { useEffect, useState } from 'react'

// A faithful recreation of the actual embeddable widget (public/widget.js) —
// same orb gradient, ring, wave bars, and status copy, not a generic mockup.
// Keep any visual change here in sync with widget.js's #zv-orb-lg/#zv-ring/
// #zv-wave CSS, or this stops being true to the product.
const ACCENT = '#10b981' // widget.js's default widgetColor (--zvc)

const STATES = [
  { status: 'Listening…', sub: 'Talk to interrupt', ring: true, wave: true },
  { status: 'Thinking…', sub: '', ring: false, wave: false },
  { status: 'Speaking…', sub: 'Talk to interrupt', ring: true, wave: true },
] as const

export function HeroWaveform() {
  const [i, setI] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % STATES.length), 2600)
    return () => clearInterval(t)
  }, [])

  const s = STATES[i]

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <style>{`
        @keyframes zvhue{0%{filter:hue-rotate(0deg) blur(.4px) saturate(1.15)}50%{filter:hue-rotate(24deg) blur(.4px) saturate(1.3)}100%{filter:hue-rotate(0deg) blur(.4px) saturate(1.15)}}
        @keyframes zvglow{0%,100%{box-shadow:0 0 22px rgba(140,150,255,.35),0 4px 24px rgba(0,0,0,.5)}50%{box-shadow:0 0 40px rgba(140,150,255,.6),0 4px 24px rgba(0,0,0,.5)}}
        @keyframes zvring{0%,100%{transform:scale(1);opacity:.25}50%{transform:scale(1.07);opacity:.7}}
        @keyframes zvwave{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}
        .hero-orb{
          background:
            radial-gradient(circle at 34% 30%, rgba(255,255,255,.9) 0%, rgba(255,255,255,0) 26%),
            radial-gradient(circle at 68% 66%, #6b8cff 0%, transparent 55%),
            radial-gradient(circle at 30% 70%, #b088ff 0%, transparent 60%),
            radial-gradient(circle at 70% 30%, #6ee7f5 0%, transparent 60%),
            #0a0a0c;
          border-radius:50%;
          position:relative;
          overflow:hidden;
          animation:zvhue 6s ease-in-out infinite, zvglow 4s ease-in-out infinite;
          filter:blur(.4px) saturate(1.15)
        }
        .hero-orb::after{
          content:'';position:absolute;inset:0;border-radius:50%;
          background:radial-gradient(ellipse at 32% 24%, rgba(255,255,255,.55) 0%, rgba(255,255,255,.12) 22%, transparent 48%);
          mix-blend-mode:screen
        }
        .hero-ring{position:absolute;inset:-12px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);opacity:0;transition:opacity .3s}
        .hero-ring.on{opacity:1;animation:zvring 2s ease-in-out infinite}
        .hero-wave span{display:block;width:3.5px;border-radius:3px;background:${ACCENT};transform-origin:center;transform:scaleY(.2)}
        .hero-wave.on span{animation:zvwave 1.2s ease-in-out infinite}
      `}</style>

      {/* glow behind the card, matches widget.js's zvglow tone */}
      <div
        className="absolute inset-0 rounded-[2rem] opacity-50 blur-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 30% 40%, rgba(107,140,255,0.4), transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(176,136,255,0.3), transparent 60%)',
        }}
      />

      {/* the widget card itself — #0a0a0a, 28px radius, same as #zv-card */}
      <div
        className="relative flex flex-col items-center pb-4"
        style={{
          background: '#0a0a0a',
          borderRadius: '28px',
          boxShadow: '0 0 0 1px rgba(255,255,255,.08), 0 24px 64px -8px rgba(0,0,0,.6)',
        }}
      >
        <div className="flex items-center gap-2 pt-4">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping" style={{ background: ACCENT }} />
            <span className="relative rounded-full w-1.5 h-1.5" style={{ background: ACCENT }} />
          </span>
          <span className="text-[10px] text-[#8a8a8e] tracking-wide uppercase">Live agent</span>
        </div>

        {/* big orb + phone button, same layout as #zv-orb-wrap/#zv-phone-btn */}
        <div className="relative mt-7" style={{ width: 132, height: 132 }}>
          <div className="hero-orb" style={{ width: 132, height: 132 }} />
          <div className={`hero-ring ${s.ring ? 'on' : ''}`} />
          <div
            className="absolute flex items-center justify-center"
            style={{
              bottom: -16, left: '50%', transform: 'translateX(-50%)',
              width: 46, height: 46, borderRadius: '50%',
              background: ACCENT, border: '3px solid #0a0a0a',
              boxShadow: '0 4px 20px rgba(0,0,0,.4)',
            }}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="#fff"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.58 1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>
          </div>
        </div>

        {/* wave bars, same 7-bar pattern as #zv-wave */}
        <div className={`hero-wave flex items-center gap-[3.5px] mt-8 ${s.wave ? 'on' : ''}`} style={{ height: 32, opacity: s.wave ? 1 : 0, transition: 'opacity .3s' }}>
          {[10, 18, 26, 32, 26, 18, 10].map((h, idx) => (
            <span key={idx} style={{ height: h, animationDelay: `${-0.18 * (idx + 1)}s` }} />
          ))}
        </div>

        <div className="text-[15px] font-semibold text-white mt-2 tracking-tight">{s.status}</div>
        <div className="text-[12.5px] text-[#8a8a8e] mt-1 min-h-[18px]">{s.sub}</div>

        <div className="text-[10.5px] text-[#52525b] mt-3">Powered by ZeVox</div>
      </div>

      {/* channel pills — both real, shipped features, not "soon" */}
      <div className="relative mt-4 flex items-center justify-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/60 border border-border text-[11px] text-foreground">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
          Widget
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background/60 border border-border text-[11px] text-foreground">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
          Phone
        </div>
      </div>
    </div>
  )
}
