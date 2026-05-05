export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Download, Server, Terminal, KeyRound, CheckCircle2, ExternalLink, BookOpen, Wrench, Cpu, Library, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { SN_APP_VERSION } from '@/app/api/downloads/sn-app/route'

const STEPS = [
  {
    Icon: Download,
    title: 'Download the release',
    body: 'Click the button above. The .zip is auth-gated to your account and contains the scoped app and a README.',
  },
  {
    Icon: Server,
    title: 'Install in your ServiceNow instance',
    body: 'Use the ServiceNow SDK CLI: unzip, then run `now-sdk install --instance https://<your>.service-now.com`. Requires admin role on the target instance.',
  },
  {
    Icon: KeyRound,
    title: 'Grant yourself the app role',
    body: 'In your instance, add the role `x_ztpas_ai_voice_a.admin` to your user (System Security → Users → Roles).',
  },
  {
    Icon: Terminal,
    title: 'Open the settings page',
    body: 'Navigate to /x_ztpas_ai_voice_a_settings.do in your instance. Paste this dashboard URL and your tenant API token, click Test Connection, then Save.',
  },
]

const REQS = [
  'ServiceNow release Vancouver or later',
  '`admin` role to install the app',
  'Outbound HTTPS to *.up.railway.app',
  'Node.js 18+ with the ServiceNow SDK installed (`npm i -g @servicenow/sdk`)',
]

const DOCS = [
  {
    Icon: BookOpen,
    title: 'Create Your First Voice Agent',
    desc: 'Five-minute walkthrough — agent identity, instructions, voice settings, activation.',
    file: 'docs/GUIDE_CREATE_AGENT.md',
  },
  {
    Icon: Cpu,
    title: 'Configure the LLM',
    desc: 'Pick a tool-capable model, set the endpoint, paste your API key, link to your agent.',
    file: 'docs/GUIDE_LLM_CONFIG.md',
  },
  {
    Icon: Wrench,
    title: 'Add Custom Tools',
    desc: 'Three tool types (custom script, Script Include, Flow Designer), parameters, output schemas, confirmation.',
    file: 'docs/GUIDE_ADD_TOOLS.md',
  },
  {
    Icon: Library,
    title: 'Knowledge Base Integration',
    desc: 'Link a KB to your agent, how chunks are cached, the search_kb tool wiring.',
    file: 'docs/GUIDE_KB_SETUP.md',
  },
  {
    Icon: ShieldCheck,
    title: 'Write Guardrails',
    desc: 'Topic restrictions, data protection rules, block/warn/redirect actions, violation tracking.',
    file: 'docs/GUIDE_GUARDRAILS.md',
  },
]

export default async function SnAppDownloadPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth')

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Downloads"
        title="ServiceNow application"
        description="Install the ZeVox scoped app in your ServiceNow instance to expose your tables, KB, and tools to the voice agent."
      />

      {/* Release card */}
      <Card className="mb-8">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">
                  ZeVox AI Voice Agent
                </h3>
                <Badge variant="success" dot>
                  v{SN_APP_VERSION}
                </Badge>
                <Badge variant="outline">Latest</Badge>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                Scoped app · <span className="font-mono text-[11.5px]">x_ztpas_ai_voice_a</span> · 11 tables, 13 script
                includes, settings UI included
              </p>
            </div>
            <a
              href="/api/downloads/sn-app"
              className={cn(buttonVariants({ size: 'default' }), 'shrink-0')}
            >
              <Download className="w-4 h-4" />
              Download .zip
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Prerequisites */}
      <div className="mb-8">
        <Section title="Prerequisites" description="Confirm these before installing.">
          <Card>
            <CardContent className="p-4">
              <ul className="space-y-2">
                {REQS.map((r) => (
                  <li key={r} className="flex items-start gap-2.5 text-[13px] text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span dangerouslySetInnerHTML={{ __html: r.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-secondary text-foreground font-mono text-[11.5px]">$1</code>') }} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </Section>
      </div>

      {/* Steps */}
      <Section title="Install" description="Five minutes end-to-end.">
        <div className="space-y-0 mb-10">
          {STEPS.map((s, idx) => (
            <div key={s.title} className="flex gap-4 py-4 border-b border-border last:border-b-0">
              <div className="shrink-0 flex flex-col items-center">
                <div className="w-8 h-8 rounded-md border border-primary/20 bg-primary/[0.06] text-primary flex items-center justify-center">
                  <s.Icon className="w-4 h-4" />
                </div>
                {idx < STEPS.length - 1 && <div className="w-px flex-1 bg-border mt-2" />}
              </div>
              <div className="flex-1 pb-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-semibold mb-1">
                  Step {String(idx + 1).padStart(2, '0')}
                </p>
                <h3 className="text-[14px] font-semibold text-foreground tracking-[-0.005em] mb-1">{s.title}</h3>
                <p
                  className="text-[12.5px] text-muted-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: s.body.replace(
                      /`([^`]+)`/g,
                      '<code class="px-1 py-0.5 rounded bg-secondary text-foreground font-mono text-[11.5px]">$1</code>'
                    ),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Documentation */}
      <Section
        title="Setup guides"
        description="All five guides ship inside the .zip in the docs/ folder. Recommended order — top to bottom."
      >
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {DOCS.map((d) => (
                <div key={d.title} className="flex items-start gap-3 p-4">
                  <div className="w-8 h-8 rounded-md border border-primary/20 bg-primary/[0.06] text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <d.Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-foreground tracking-[-0.005em]">
                      {d.title}
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{d.desc}</p>
                    <p className="text-[10.5px] text-muted-foreground/70 mt-1.5 font-mono">{d.file}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* Footer help */}
      <div className="mt-8 flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          Find your API token
          <ExternalLink className="w-3 h-3" />
        </Link>
        <span className="text-muted-foreground/40">·</span>
        <a
          href="mailto:support@zevox.com"
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          Email support
        </a>
      </div>
    </div>
  )
}
