export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react'

interface Step {
  key: string
  title: string
  description: string
  done: boolean
  cta: { label: string; href: string; external?: boolean }
}

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth')

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      instances: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
      connectors: { take: 1 },
      agents: { where: { active: true }, take: 1 },
      tokens: { where: { active: true }, take: 1 },
    },
  })
  if (!tenant) redirect('/dashboard')

  const instance = tenant.instances[0]
  const hasCredentials = !!instance && !!instance.snUsername && !!instance.snPassword
  const hasConnector = tenant.connectors.length > 0
  const hasAgent = tenant.agents.length > 0
  const hasToken = tenant.tokens.length > 0

  const steps: Step[] = [
    {
      key: 'connect',
      title: 'Connect a backend',
      description: 'Add a generic connector (HaloITSM or any REST API) from Connectors, or a ServiceNow instance from Connection — either works.',
      done: hasCredentials || hasConnector,
      cta: { label: 'Open Connectors', href: '/dashboard/connectors' },
    },
    {
      key: 'sync',
      title: 'Create your first voice agent',
      description: 'Create an agent directly in ZeVox (Agents → New agent), or sync one from ServiceNow under AI Voice Agent → Voice Agents once SaaS sync is configured there.',
      done: hasAgent,
      cta: { label: 'Open Agents', href: '/dashboard/agents' },
    },
    {
      key: 'voice',
      title: 'Pick a voice and test',
      description: 'Choose a voice for your agent and play a sample to confirm.',
      done: hasAgent, // voice is always defaulted; consider this done when agent exists
      cta: { label: 'Configure agent', href: '/dashboard/agents' },
    },
    {
      key: 'embed',
      title: 'Embed the widget',
      description: 'Drop the ZeVox widget script onto your portal or intranet page and point it at your tenant token.',
      done: hasToken,
      cta: { label: 'Get embed code', href: '/dashboard/connection' },
    },
    {
      key: 'call',
      title: 'Make your first test call',
      description: 'Open the widget, ask something like "What are my open tickets?" and confirm you hear a response.',
      done: false, // binary sense of completion not tracked yet
      cta: { label: 'Read docs', href: '/docs', external: true },
    },
  ]

  const doneCount = steps.filter(s => s.done).length
  const progressPct = Math.round((doneCount / steps.length) * 100)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Get Started"
        description="Five quick steps to a working voice agent. You can leave and come back — your progress is preserved."
      />

      {/* Progress bar */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium">Setup progress</span>
            <span className="text-[12px] text-muted-foreground">{doneCount} of {steps.length}</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: progressPct + '%' }} />
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((s, i) => (
          <Card key={s.key} className={s.done ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : ''}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="pt-0.5">
                  {s.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground/70 font-medium">Step {i + 1}</span>
                    {s.done && <span className="text-[11px] text-emerald-600 font-medium">· Done</span>}
                  </div>
                  <h3 className="text-[14px] font-semibold mt-0.5">{s.title}</h3>
                  <p className="text-[13px] text-muted-foreground mt-1">{s.description}</p>
                </div>
                <div className="shrink-0">
                  {s.cta.external ? (
                    <a
                      href={s.cta.href}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-[12px] text-primary hover:text-primary/80"
                    >
                      {s.cta.label} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <Link
                      href={s.cta.href}
                      className="inline-flex items-center gap-1 text-[12px] text-primary hover:text-primary/80"
                    >
                      {s.cta.label} →
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
