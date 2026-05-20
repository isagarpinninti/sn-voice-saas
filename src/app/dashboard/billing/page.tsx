'use client'

import { useState, useEffect } from 'react'
import { PLANS, PlanKey } from '@/lib/plans'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { Check } from 'lucide-react'

export default function BillingPage() {
  const { toast } = useToast()
  const [currentPlan, setCurrentPlan] = useState<string>('FREE')
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => { if (d.plan) setCurrentPlan(d.plan) })
      .catch(() => {})
  }, [])

  async function handleUpgrade(planKey: string) {
    setLoading(planKey)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      })
      const data = await res.json()
      if (data.message) {
        toast(data.message, 'success')
        setCurrentPlan(planKey)
      } else if (data.error) {
        toast(data.error, 'error')
      }
    } catch { toast('Failed to update plan', 'error') }
    finally { setLoading(null) }
  }

  const current = PLANS[currentPlan as PlanKey] || PLANS.FREE

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Choose the plan that fits your needs. Changes apply immediately."
      />

      {/* Current plan banner */}
      <Card className="mb-10 border-primary/20 bg-gradient-to-br from-primary/[0.05] to-transparent">
        <CardContent className="p-6 flex items-center justify-between gap-6">
          <div>
            <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium mb-1">Current plan</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[24px] font-semibold tracking-tight text-foreground">{current.name}</h2>
              <Badge variant={currentPlan === 'FREE' ? 'secondary' : 'success'}>Active</Badge>
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">
              {current.minutesPerMonth.toLocaleString()} minutes
              {currentPlan === 'FREE' ? ' (one-time trial)' : ' per month'}
            </p>
          </div>
          <a href="/dashboard/usage" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            View usage
          </a>
        </CardContent>
      </Card>

      {/* Plans grid */}
      <Section title="Plans" description="Switch or upgrade. Changes apply immediately.">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(PLANS).map(([key, plan]) => {
            const isCurrent = key === currentPlan
            const isPopular = 'popular' in plan && plan.popular
            return (
              <Card
                key={key}
                className={
                  isCurrent
                    ? 'border-primary/30 bg-primary/[0.03]'
                    : isPopular
                    ? 'border-primary/15'
                    : ''
                }
              >
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[13px] font-semibold text-foreground">{plan.name}</h3>
                    {isCurrent && <Badge variant="default">Current</Badge>}
                    {!isCurrent && isPopular && <Badge variant="default">Popular</Badge>}
                  </div>
                  <p className="text-[24px] font-semibold tracking-tight text-foreground mb-1 tabular-nums">
                    ${plan.price}
                    <span className="text-[11px] text-muted-foreground font-normal ml-0.5">{plan.price > 0 ? '/mo' : ''}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-5">{plan.minutesPerMonth.toLocaleString()} min/mo</p>

                  <ul className="space-y-2 mb-5 flex-1">
                    {plan.features.map((f: string) => (
                      <li key={f} className="text-[12px] text-muted-foreground flex gap-2">
                        <Check className="w-3.5 h-3.5 text-primary/70 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="text-center py-1.5 rounded-md text-[12px] font-medium border border-primary/20 text-primary">
                      Active
                    </div>
                  ) : (
                    <Button
                      variant={isPopular ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleUpgrade(key)}
                      disabled={!!loading}
                      className="w-full"
                    >
                      {loading === key
                        ? 'Activating...'
                        : plan.price > Number(PLANS[currentPlan as PlanKey]?.price || 0)
                        ? plan.cta
                        : key === 'FREE'
                        ? 'Switch to Free'
                        : 'Switch'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Contact Sales */}
          <Card>
            <CardContent className="p-5 flex flex-col h-full">
              <h3 className="text-[13px] font-semibold text-foreground mb-2">Custom</h3>
              <p className="text-[24px] font-semibold tracking-tight text-foreground mb-1">Let&apos;s talk</p>
              <p className="text-[11px] text-muted-foreground mb-5">Volume pricing and custom terms.</p>
              <ul className="space-y-2 mb-5 flex-1 text-[12px] text-muted-foreground">
                {['Volume discounts', 'Dedicated infra', 'White-label', 'Custom SLA'].map(f => (
                  <li key={f} className="flex gap-2">
                    <Check className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:sales@zevox.com"
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full' })}
              >
                Contact sales
              </a>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* FAQ */}
      <div className="mt-10">
        <Section title="FAQ" description="Common questions about plans and features.">
          <Card>
            <CardContent className="p-6">
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                {[
                  { q: 'What happens at the call limit?', a: 'Free trial: paused once the 50-minute one-time allowance is used. Pro and Premium plans include monthly minutes that reset each period.' },
                  { q: 'Can I switch plans anytime?', a: 'Yes. Click any plan below and it activates immediately. Your usage resets to the new plan\'s limits.' },
                  { q: 'What\'s included in STT + TTS?', a: 'Deepgram Nova-3 (STT) and Aura (TTS) are included in all plans. You only provide your LLM key.' },
                  { q: 'Do you store my ServiceNow credentials?', a: 'Encrypted at rest. Never exposed in logs or API responses. Used only for gateway ↔ SN communication.' },
                ].map(({ q, a }) => (
                  <div key={q}>
                    <p className="text-[12px] font-semibold text-foreground mb-1">{q}</p>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">{a}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}
