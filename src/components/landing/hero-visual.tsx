'use client'

import { Phone, Mic } from 'lucide-react'

const BAR_COUNT = 28

export function HeroWaveform() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] aspect-[16/9]">
      {/* glowing orb behind */}
      <div
        className="absolute inset-0 rounded-[2rem] opacity-60 blur-3xl pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 30% 40%, rgba(99,102,241,0.45), transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(139,92,246,0.35), transparent 60%)',
        }}
      />

      {/* glass card */}
      <div className="relative h-full w-full rounded-[1.75rem] border border-white/[0.08] bg-card/40 backdrop-blur-xl overflow-hidden">
        {/* top row — agent badge */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-background/60">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-primary opacity-75 animate-ping" />
              <span className="relative rounded-full w-1.5 h-1.5 bg-primary" />
            </span>
            <span className="text-[10px] text-muted-foreground tracking-wide uppercase">Live agent</span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70 tabular-nums">
            <span className="w-1 h-1 rounded-full bg-primary" />
            00:42
          </div>
        </div>

        {/* center — waveform */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-[3px] h-20">
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
              <span
                key={i}
                className="wave-bar w-[3px] rounded-full bg-gradient-to-t from-[#6366f1]/40 via-[#6366f1] to-[#818cf8]"
                style={{
                  height: `${20 + Math.abs(Math.sin((i / BAR_COUNT) * Math.PI * 2)) * 60}px`,
                  animationDelay: `${(i * 70) % 900}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* bottom row — channels */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-background/60 border border-border text-[11px] text-foreground">
            <Mic className="w-3 h-3 text-primary" />
            Widget
          </div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-indigo-400/20 bg-indigo-400/[0.06] text-[11px] text-indigo-300">
            <Phone className="w-3 h-3" />
            Phone · soon
          </div>
        </div>
      </div>
    </div>
  )
}
