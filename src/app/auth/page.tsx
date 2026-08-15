'use client'

import { signIn } from 'next-auth/react'
import { Zap, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react'

const HIGHLIGHTS = [
  {
    Icon: Zap,
    title: 'Sub-500ms latency',
    desc: 'Streaming STT, LLM, and TTS run in parallel. The agent starts speaking before it has finished thinking.',
  },
  {
    Icon: ShieldCheck,
    title: 'PII redacted before the LLM',
    desc: 'Every transcript is redacted before it reaches an LLM call — tools execute on ServiceNow, HaloITSM, or any REST API you connect.',
  },
  {
    Icon: Sparkles,
    title: '50 free minutes',
    desc: 'No credit card required. Connect a backend, embed the widget, take it for a spin.',
  },
]

export default function AuthPage() {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ── Left: branding panel ── */}
      <aside className="hidden lg:flex lg:w-[460px] border-r border-border flex-col justify-between p-10 bg-card/30">
        <div>
          <a href="/" className="inline-flex items-center gap-2 mb-16 group">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center transition-transform group-hover:scale-105">
              <svg className="w-4 h-4 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">ZeVox</span>
          </a>

          <p className="text-[10px] text-primary tracking-widest uppercase mb-3 font-medium">Voice AI for your stack</p>
          <h2 className="text-[28px] font-semibold tracking-[-0.03em] leading-[1.1] mb-4 text-foreground">
            Give your stack
            <br />
            a real voice.
          </h2>
          <p className="text-[13px] text-muted-foreground leading-relaxed max-w-[340px]">
            Human-quality voice agents that check tickets, create incidents, and resolve issues — on ServiceNow,
            HaloITSM, or any REST API you already run.
          </p>
        </div>

        <div>
          <div className="space-y-5 mb-10">
            {HIGHLIGHTS.map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md bg-muted/60 border border-border flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{title}</p>
                  <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-5 border-t border-border">
            <p className="text-[10px] text-muted-foreground/60">
              © {new Date().getFullYear()} ZeVox.
            </p>
          </div>
        </div>
      </aside>

      {/* ── Right: auth form ── */}
      <main className="flex-1 flex items-center justify-center px-6 relative">
        {/* Subtle radial behind the form */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px]"
            style={{
              background:
                'radial-gradient(ellipse 50% 50% at 50% 0%, rgba(16, 185, 129, 0.06), transparent 70%)',
            }}
          />
        </div>

        <div className="relative w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
            <span className="text-[14px] font-semibold text-foreground">ZeVox</span>
          </div>

          <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1.5 text-foreground">Welcome back</h1>
          <p className="text-[13px] text-muted-foreground mb-8">
            Sign in to your ZeVox workspace. New here? Signing in creates an account automatically.
          </p>

          <div className="space-y-2.5">
            {/* Google — kept white per Google brand requirements */}
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="w-full inline-flex items-center justify-center gap-2.5 h-10 px-4 rounded-md bg-white text-[#1a1a1a] font-medium text-[13px] hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => signIn('github', { callbackUrl: '/dashboard' })}
              className="w-full inline-flex items-center justify-center gap-2.5 h-10 px-4 rounded-md bg-card text-foreground font-medium text-[13px] border border-border hover:bg-accent/40 hover:border-border/80 transition-colors cursor-pointer"
            >
              <svg className="w-[16px] h-[16px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-7">
            <div className="flex-1 h-px bg-border" />
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
              No password to remember
            </p>
            <div className="flex-1 h-px bg-border" />
          </div>

          <p className="text-[11px] text-muted-foreground/70 text-center leading-relaxed">
            By continuing you agree to our{' '}
            <a href="/terms" className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors">
              Privacy Policy
            </a>
            .
          </p>

          <div className="text-center mt-8">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to home
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
