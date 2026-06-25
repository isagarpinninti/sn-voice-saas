import { PLANS } from '@/lib/plans'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { HeroWaveform } from '@/components/landing/hero-visual'
import {
  Mic, Zap, Brain, ShieldCheck, Activity, Layers,
  Check, ArrowRight, Phone, Hash, PhoneIncoming, Radio,
} from 'lucide-react'

const FEATURES = [
  { Icon: Mic, title: 'Neural voice quality', desc: 'Deepgram Nova-3 STT and Aura TTS. Sub-second latency with natural turn-taking and barge-in.' },
  { Icon: Zap, title: 'Direct tool execution', desc: 'Tools run via GlideRecord on your instance. Check tickets, create incidents, approve requests — by voice.' },
  { Icon: Brain, title: 'Cross-session memory', desc: 'The agent remembers users across calls and picks up where the last conversation left off.' },
  { Icon: ShieldCheck, title: 'Enterprise security', desc: 'Data stays in your ServiceNow instance. PII masking, prompt-injection detection, configurable guardrails.' },
  { Icon: Activity, title: 'Streaming pipeline', desc: 'STT, LLM, and TTS stream in parallel. First words spoken before the response is fully generated.' },
  { Icon: Layers, title: 'Zero external portals', desc: 'Agent config, tools, analytics, conversations — everything managed from ServiceNow.' },
]

const STEPS = [
  { n: '01', t: 'Connect ServiceNow', d: 'Enter your instance URL and service account credentials. One-time setup.' },
  { n: '02', t: 'Configure your agent', d: 'Write the personality, add tools, set guardrails — all from your ServiceNow workspace.' },
  { n: '03', t: 'Add your LLM key', d: 'Paste your Groq (free) or OpenAI key in the ServiceNow LLM config. You control the model and cost.' },
  { n: '04', t: 'Embed or call', d: 'Drop the widget into any page — or, on Premium, point a real phone number at your agent.' },
]

const STATS = [
  { v: '<500ms', l: 'Voice latency' },
  { v: '50 min', l: 'Free to try' },
  { v: '100%', l: 'Managed in SN' },
  { v: '0', l: 'External portals' },
]

const PHONE_BULLETS = [
  { Icon: PhoneIncoming, t: 'Dedicated inbound number', d: 'We provision a real phone number. Callers dial in and speak directly to your agent — no widget, no app.' },
  { Icon: Hash, t: 'DTMF & menu routing', d: '“Press 1 for billing.” Touch-tones map to agent intents, so you can build voice IVRs that actually work.' },
  { Icon: Radio, t: 'Same agent, both channels', d: 'The widget and the phone line share one agent config, one knowledge base, one set of tools.' },
]

const FAQ = [
  {
    q: 'What\'s the difference between the widget and phone calls?',
    a: 'The widget is a browser-based mic: users click to talk. Phone calls let anyone dial a real number — no device pairing, no website visit, no app. Great for support lines, IT helpdesks, and after-hours intake.',
  },
  {
    q: 'Which plan includes phone calls?',
    a: 'Phone calls are a Premium feature. Premium gets a dedicated inbound number plus everything in Pro. Free and Pro are widget-only.',
  },
  {
    q: 'Do I bring my own LLM key?',
    a: 'Yes. Paste a Groq (free tier works) or OpenAI key into your ServiceNow LLM config. You own the cost and the model choice.',
  },
  {
    q: 'Is my data sent anywhere else?',
    a: 'Agent config, tools, and conversation state live on your ServiceNow instance. Only the audio stream touches our STT/TTS providers during a live call.',
  },
  {
    q: 'What happens when I hit my monthly minutes?',
    a: 'Pro and Premium have per-minute overage so you\'re never cut off mid-call. Need a custom volume plan? Talk to sales.',
  },
]

export default function LandingPage() {
  return (
    <main className="flex flex-col overflow-x-hidden bg-background text-foreground">
      {/* ── Nav ── */}
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="max-w-[1140px] mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center glow-ring">
              <svg className="w-4 h-4 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.01em]">ZeVox</span>
            <span className="hidden sm:inline text-[10px] text-muted-foreground/60 ml-1 tracking-widest uppercase">by ZeTechno</span>
          </a>
          <div className="hidden md:flex items-center gap-7 text-[12.5px] text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#phone" className="hover:text-foreground transition-colors inline-flex items-center gap-1.5">
              Phone calls
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-indigo-400/25 bg-indigo-400/[0.08] text-indigo-300 tracking-wider uppercase font-medium">New</span>
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <a href="/docs" className="hover:text-foreground transition-colors">Docs</a>
          </div>
          <div className="flex items-center gap-2.5">
            <a href="/auth" className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">Log in</a>
            <a
              href="/auth"
              className="text-[12.5px] px-3.5 py-1.5 rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
            >
              Start free
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-28 px-6">
        <div className="absolute inset-0 mesh-bg pointer-events-none" />
        <div className="absolute inset-0 grid-overlay pointer-events-none" />

        <div className="relative max-w-[1140px] mx-auto grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="animate-fade-up">
            <a
              href="#phone"
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/40 text-[11px] text-muted-foreground hover:border-primary/40 hover:bg-card/80 transition-all mb-7 group"
            >
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold tracking-wider uppercase">New</span>
              Inbound phone calls on Premium
              <ArrowRight className="w-3 h-3 text-muted-foreground/70 group-hover:translate-x-0.5 group-hover:text-foreground transition-all" />
            </a>

            <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-semibold tracking-[-0.045em] leading-[1.02] mb-6">
              Voice AI for
              <br />
              <span className="text-gradient-brand">ServiceNow</span>
              <span className="text-foreground">, done right.</span>
            </h1>

            <p className="text-[17px] text-muted-foreground max-w-[540px] mb-9 leading-[1.6]">
              A neural-quality voice agent that checks tickets, creates records, and resolves issues —
              embedded as a widget or reached on a real phone number. Managed entirely from your ServiceNow instance.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 mb-14">
              <a
                href="/auth"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-foreground text-background text-[13.5px] font-medium hover:bg-foreground/90 transition-colors"
              >
                Start building free
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <a
                href="#phone"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md text-[13.5px] text-foreground border border-border hover:border-primary/40 hover:bg-accent/30 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-primary" />
                See phone calls on Premium
              </a>
            </div>

            <div className="inline-flex items-stretch divide-x divide-border border border-border rounded-xl bg-card/40 backdrop-blur">
              {STATS.map((s) => (
                <div key={s.l} className="px-5 py-3 text-left">
                  <div className="text-[17px] font-semibold tracking-tight text-foreground tabular-nums">{s.v}</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5 tracking-wide uppercase">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative animate-fade-up" style={{ animationDelay: '120ms' }}>
            <HeroWaveform />
          </div>
        </div>
      </section>

      {/* ── Logos / Social proof ── */}
      <section className="py-14 border-t border-border">
        <p className="text-center text-[10px] text-muted-foreground/60 tracking-[0.2em] uppercase mb-7">
          Trusted by teams running ServiceNow
        </p>
        <div className="flex items-center justify-center gap-10 opacity-30 flex-wrap">
          {['Enterprise', 'Acme Corp', 'TechFlow', 'CloudOps', 'InfraHQ'].map((name) => (
            <span key={name} className="text-[14px] font-semibold tracking-tight text-foreground">
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-28 px-6 border-t border-border">
        <div className="max-w-[1140px] mx-auto">
          <div className="max-w-[620px] mb-14">
            <p className="text-[10px] text-primary tracking-[0.2em] uppercase mb-3 font-medium">Capabilities</p>
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] leading-[1.1] mb-4">
              Built <span className="text-gradient-brand">for ServiceNow</span>.
              <br />
              Not bolted on.
            </h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Every feature designed for ServiceNow workflows — direct table access, not webhooks. Same agent on every channel.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map(({ Icon, title, desc }) => (
              <Card key={title} className="group hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5">
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-indigo-500/10 border border-primary/20 flex items-center justify-center mb-5 group-hover:border-primary/40 transition-colors">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-[15px] font-semibold mb-2 tracking-[-0.01em] text-foreground">{title}</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Phone Calls section (waitlist) ── */}
      <section id="phone" className="relative py-28 px-6 border-t border-border overflow-hidden">
        <div className="absolute inset-0 mesh-bg-soft pointer-events-none" />
        <div className="relative max-w-[1140px] mx-auto grid lg:grid-cols-[1fr_1fr] gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-indigo-400/25 bg-indigo-400/[0.06] text-[10px] text-indigo-300 tracking-[0.18em] uppercase mb-6 font-medium">
              <Phone className="w-3 h-3" />
              Included with Premium
            </div>

            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] leading-[1.1] mb-5">
              Your agent,
              <br />
              <span className="text-gradient-sunset">on the phone.</span>
            </h2>

            <p className="text-[15px] text-muted-foreground leading-relaxed mb-9 max-w-[500px]">
              Skip the widget. Premium customers get a dedicated inbound phone number that rings straight to your ServiceNow agent —
              the same agent, tools, and memory as the widget.
            </p>

            <div className="space-y-5 mb-10">
              {PHONE_BULLETS.map(({ Icon, t, d }) => (
                <div key={t} className="flex gap-4">
                  <div className="w-9 h-9 rounded-lg border border-indigo-400/20 bg-indigo-400/[0.06] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-indigo-300" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-foreground mb-0.5">{t}</p>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{d}</p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-widest mb-3 font-medium">Ready when you are</p>
              <a
                href="/auth"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-foreground text-background text-[13.5px] font-medium hover:bg-foreground/90 transition-colors"
              >
                Start with Premium
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
              <p className="text-[11px] text-muted-foreground/60 mt-3">
                Includes a dedicated inbound number, 2,000 minutes, and unlimited agents.
              </p>
            </div>
          </div>

          {/* Visual: phone mock */}
          <div className="relative hidden lg:block">
            <div
              className="absolute inset-0 blur-3xl opacity-70 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.4), transparent 60%)',
              }}
            />
            <div className="relative mx-auto w-[280px] aspect-[9/19] rounded-[2.25rem] border border-white/10 bg-gradient-to-b from-card/80 to-card/40 backdrop-blur-xl overflow-hidden glow-ring-violet">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-background rounded-b-2xl" />
              <div className="absolute inset-0 p-6 pt-14 flex flex-col">
                <p className="text-[10px] text-muted-foreground/70 uppercase tracking-widest mb-1">Incoming call</p>
                <p className="text-[22px] font-semibold tracking-tight text-foreground mb-1 tabular-nums">+1 (415) 555-0123</p>
                <p className="text-[12px] text-muted-foreground mb-auto">ZeVox Agent · Support</p>

                <div className="flex items-center justify-center gap-1 mb-6 h-12">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <span
                      key={i}
                      className="wave-bar w-[3px] rounded-full bg-indigo-300/80"
                      style={{
                        height: `${16 + Math.abs(Math.sin((i / 18) * Math.PI * 2)) * 30}px`,
                        animationDelay: `${(i * 90) % 900}ms`,
                      }}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-center gap-5">
                  <div className="w-12 h-12 rounded-full bg-destructive/80 flex items-center justify-center rotate-[135deg]">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center animate-pulse-ring">
                    <Phone className="w-5 h-5 text-primary-foreground" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-28 px-6 border-t border-border">
        <div className="max-w-[820px] mx-auto">
          <p className="text-[10px] text-primary tracking-[0.2em] uppercase mb-3 font-medium">Setup</p>
          <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] mb-12 leading-[1.1]">
            Five minutes to your first call
          </h2>

          <div className="space-y-0">
            {STEPS.map((s, idx) => (
              <div key={s.n} className="flex gap-6 py-7 border-b border-border last:border-b-0">
                <div className="shrink-0 flex flex-col items-center">
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-mono font-semibold',
                    'border border-primary/30 bg-primary/[0.06] text-primary',
                  )}>
                    {s.n}
                  </div>
                  {idx < STEPS.length - 1 && <div className="w-px flex-1 bg-border mt-2" />}
                </div>
                <div className="flex-1 pb-1">
                  <h3 className="text-[16px] font-semibold mb-1.5 tracking-[-0.01em] text-foreground">{s.t}</h3>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-28 px-6 border-t border-border">
        <div className="max-w-[1140px] mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] text-primary tracking-[0.2em] uppercase mb-3 font-medium">Pricing</p>
            <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] mb-4 leading-[1.1]">
              Start free. <span className="text-gradient-brand">Scale when ready.</span>
            </h2>
            <p className="text-[15px] text-muted-foreground max-w-[520px] mx-auto">
              Neural STT and TTS included on every plan. You bring your own LLM key.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-3 max-w-[960px] mx-auto">
            <PricingCard plan={PLANS.FREE} />
            <PricingCard plan={PLANS.PRO} highlighted />
            <PricingCard plan={PLANS.PREMIUM} accent="violet" />
          </div>

          <div className="mt-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              Need volume, dedicated infra, white-label, or custom SLAs?{' '}
              <a href="mailto:sales@zevox.com" className="text-foreground hover:text-primary transition-colors underline decoration-border underline-offset-4">
                Talk to sales
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-28 px-6 border-t border-border">
        <div className="max-w-[820px] mx-auto">
          <p className="text-[10px] text-primary tracking-[0.2em] uppercase mb-3 font-medium">FAQ</p>
          <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] mb-10 leading-[1.1]">
            Questions, answered.
          </h2>

          <div className="space-y-3">
            {FAQ.map(({ q, a }) => (
              <details
                key={q}
                className="group rounded-xl border border-border bg-card/30 hover:bg-card/50 transition-colors [&[open]]:bg-card/60 [&[open]]:border-primary/20"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 py-4 text-[14px] font-medium text-foreground">
                  {q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45 shrink-0 text-[18px] leading-none">+</span>
                </summary>
                <div className="px-5 pb-5 text-[13.5px] text-muted-foreground leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative py-28 px-6 border-t border-border overflow-hidden">
        <div className="absolute inset-0 mesh-bg pointer-events-none" />
        <div className="relative max-w-[640px] mx-auto text-center">
          <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] mb-4 leading-[1.1]">
            Give your ServiceNow <span className="text-gradient-brand">a voice.</span>
          </h2>
          <p className="text-[15px] text-muted-foreground mb-8">
            50 free minutes. No credit card. Five-minute setup.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="/auth"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-foreground text-background text-[13.5px] font-medium hover:bg-foreground/90 transition-colors"
            >
              Start building free
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="#phone"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md text-[13.5px] text-foreground border border-border hover:border-primary/40 hover:bg-accent/30 transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-primary" />
              Phone calls on Premium
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 border-t border-border">
        <div className="max-w-[1140px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              </svg>
            </div>
            <span className="text-[13px] font-medium text-foreground">ZeVox</span>
          </div>
          <div className="flex items-center gap-6 text-[11px] text-muted-foreground/70">
            <a href="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-muted-foreground transition-colors">Terms</a>
            <a href="/docs" className="hover:text-muted-foreground transition-colors">Documentation</a>
          </div>
          <p className="text-[11px] text-muted-foreground/60">
            © {new Date().getFullYear()} ZeVox — A <span className="text-muted-foreground">ZeTechno</span> Product
          </p>
        </div>
      </footer>
    </main>
  )
}

function PricingCard({
  plan,
  highlighted,
  accent,
}: {
  plan: (typeof PLANS)[keyof typeof PLANS]
  highlighted?: boolean
  accent?: 'violet'
}) {
  const isPopular = 'popular' in plan && plan.popular === true

  return (
    <Card
      className={cn(
        'relative flex flex-col h-full transition-all duration-300 hover:-translate-y-0.5',
        highlighted && 'border-primary/40 bg-primary/[0.04] glow-ring',
        accent === 'violet' && 'border-indigo-400/30 bg-indigo-400/[0.04]',
      )}
    >
      {isPopular && (
        <div className="absolute -top-2.5 left-4">
          <Badge variant="default">Most popular</Badge>
        </div>
      )}
      <CardContent className="p-6 flex flex-col h-full">
        <h3 className="text-[14px] font-semibold text-foreground mb-2">{plan.name}</h3>
        <div className="flex items-baseline gap-1 mb-1.5">
          <span className="text-[30px] font-semibold tracking-tight text-foreground tabular-nums">${plan.price}</span>
          {plan.price > 0 && <span className="text-[12px] text-muted-foreground">/mo</span>}
        </div>
        <p className="text-[11.5px] text-muted-foreground mb-6">
          {plan.minutesPerMonth.toLocaleString()} minutes{' '}
          {'oneTimeTrial' in plan && plan.oneTimeTrial ? 'total' : 'per month'}
        </p>

        <ul className="space-y-2.5 mb-6 flex-1">
          {plan.features.map((f: string) => (
            <li key={f} className="text-[12.5px] text-muted-foreground flex items-start gap-2">
              <Check className={cn(
                'w-3.5 h-3.5 shrink-0 mt-[2px]',
                accent === 'violet' ? 'text-indigo-400/80' : 'text-primary/80',
              )} />
              <span className="leading-snug">{f}</span>
            </li>
          ))}
        </ul>

        <a
          href="/auth"
          className={cn(
            buttonVariants({ variant: highlighted ? 'default' : 'outline', size: 'sm' }),
            'w-full',
          )}
        >
          {plan.cta}
        </a>
      </CardContent>
    </Card>
  )
}
