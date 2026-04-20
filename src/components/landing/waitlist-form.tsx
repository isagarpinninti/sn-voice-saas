'use client'

import { useState, FormEvent } from 'react'
import { ArrowRight, Check } from 'lucide-react'

type Props = {
  feature?: string
  source?: string
  placeholder?: string
  cta?: string
  variant?: 'inline' | 'stacked'
}

export function WaitlistForm({
  feature = 'phone_calls',
  source = 'landing',
  placeholder = 'you@company.com',
  cta = 'Join waitlist',
  variant = 'inline',
}: Props) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (state === 'submitting') return
    setState('submitting')
    setMessage(null)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, feature, source }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setState('error')
        setMessage(typeof data?.error === 'string' ? data.error : 'Something went wrong. Try again.')
        return
      }
      setState('success')
    } catch {
      setState('error')
      setMessage('Network error. Try again.')
    }
  }

  if (state === 'success') {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/[0.06] text-[13px] text-primary animate-fade-up">
        <Check className="w-4 h-4" />
        You&apos;re on the list — we&apos;ll email you when phone calls go live.
      </div>
    )
  }

  const isStacked = variant === 'stacked'

  return (
    <form
      onSubmit={onSubmit}
      className={
        isStacked
          ? 'flex flex-col gap-2 max-w-[360px]'
          : 'flex flex-col sm:flex-row items-stretch gap-2 max-w-[440px]'
      }
    >
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={placeholder}
        aria-label="Email address"
        className="flex-1 min-w-0 px-3.5 py-2.5 rounded-md bg-card/60 border border-border text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
      />
      <button
        type="submit"
        disabled={state === 'submitting'}
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-md bg-foreground text-background text-[13px] font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        {state === 'submitting' ? 'Joining…' : cta}
        {state !== 'submitting' && <ArrowRight className="w-3.5 h-3.5" />}
      </button>
      {state === 'error' && message && (
        <p className="text-[11px] text-destructive w-full">{message}</p>
      )}
    </form>
  )
}
