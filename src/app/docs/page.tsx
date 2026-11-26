import Link from 'next/link'
import { ArrowRight, Mail, Check } from 'lucide-react'
import { CodeBlock } from '@/components/docs/code-block'
import { TocNav, type TocItem } from '@/components/docs/toc-nav'
import { cn } from '@/lib/utils'

const SECTIONS: TocItem[] = [
  { id: 'prerequisites', num: '00', title: 'Prerequisites' },
  { id: 'connect-backend', num: '01', title: 'Connect a backend' },
  { id: 'configure-agent', num: '02', title: 'Configure your agent' },
  { id: 'add-tools', num: '03', title: 'Add tools' },
  { id: 'widget', num: '04', title: 'Embed the widget' },
  { id: 'phone', num: '05', title: 'Phone calls' },
  { id: 'monitoring', num: '06', title: 'Monitoring' },
  { id: 'troubleshooting', num: '07', title: 'Troubleshooting' },
  { id: 'sn-install', num: '08', title: 'ServiceNow: install the scoped app' },
  { id: 'sn-connect', num: '09', title: 'ServiceNow: connect to ZeVox' },
  { id: 'sn-llm', num: '10', title: 'ServiceNow: configure the LLM' },
  { id: 'sn-instructions', num: '11', title: 'ServiceNow: Agent Instructions playbook' },
  { id: 'sn-kb', num: '12', title: 'ServiceNow: link a Knowledge Base' },
  { id: 'sn-guardrails', num: '13', title: 'ServiceNow: add Guardrails' },
  { id: 'sn-custom-tools', num: '14', title: 'ServiceNow: custom tools — advanced' },
]

const STANDARD_TOOLS = [
  { name: 'get_current_user', desc: 'Caller profile — name, email, department, manager.' },
  { name: 'get_my_requests', desc: 'Up to 10 open catalog requests for the caller.' },
  { name: 'get_ticket_status', desc: 'Look up INC / CHG / TASK / PRB by number.' },
  { name: 'create_incident', desc: 'Creates an incident — requires user confirmation.' },
  { name: 'update_incident_notes', desc: 'Adds work note to an incident — requires confirmation.' },
  { name: 'search_knowledge', desc: 'Searches KB articles by keyword; returns title + number.' },
  { name: 'send_email', desc: "Sends to the caller's resolved email address." },
  { name: 'reset_password', desc: 'Triggers password reset — requires confirmation.' },
  { name: 'navigate_to', desc: 'Opens a ServiceNow page in the user\'s browser (widget).' },
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav — matches landing */}
      <nav className="fixed top-0 w-full z-50 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="max-w-[1280px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.01em]">ZeVox</span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground/70 ml-1">/ Docs</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            <Link
              href="/auth"
              className="text-[12.5px] px-3.5 py-1.5 rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-6 pt-24 pb-16">
        {/* Hero */}
        <header className="mb-14 max-w-[760px]">
          <p className="text-[10px] text-primary tracking-[0.18em] uppercase mb-3 font-semibold">Documentation</p>
          <h1 className="text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-[-0.035em] leading-[1.05] mb-4">
            ZeVox setup guide
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Connect a backend, configure your agent, add tools, and embed the widget. There are two ways to
            connect a backend: a <strong className="text-foreground font-medium">generic connector</strong> (HaloITSM,
            or any REST API you run — no extra install, ~5 minutes) or the{' '}
            <strong className="text-foreground font-medium">ServiceNow scoped app</strong> (deepest integration:
            native forms for instructions, guardrails, and knowledge base search — ~15 minutes). Sections 00–07 cover
            the end-to-end path with either; sections 08+ are ServiceNow-specific reference material.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-6">
            <Link
              href="/dashboard/connectors"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-foreground text-background text-[12.5px] font-medium hover:bg-foreground/90 transition-colors"
            >
              Connect a backend
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/dashboard/downloads/sn-app"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12.5px] text-foreground border border-border hover:border-border/80 hover:bg-secondary transition-colors"
            >
              Download the SN app
            </Link>
            <a
              href="mailto:support@zevox.com"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12.5px] text-foreground border border-border hover:border-border/80 hover:bg-secondary transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              Email support
            </a>
          </div>
        </header>

        {/* Two-column layout */}
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          {/* Sidebar TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TocNav items={SECTIONS} />
            </div>
          </aside>

          {/* Content */}
          <main className="max-w-[760px] space-y-16">

            <Section id="prerequisites" num="00" title="Prerequisites">
              <ul className="space-y-2.5">
                <BulletItem>
                  A ZeVox account — free tier includes 50 lifetime minutes.
                </BulletItem>
                <BulletItem>
                  A backend to connect: any REST API you run, a HaloITSM tenant, or a ServiceNow instance on
                  Vancouver or newer (Washington / Xanadu / Yokohama all supported).
                </BulletItem>
                <BulletItem>
                  If you&apos;re going the ServiceNow route: admin rights to install a scoped application, plus
                  Node.js 18+ with the ServiceNow SDK: <InlineCode>npm i -g @servicenow/sdk</InlineCode>
                </BulletItem>
              </ul>
            </Section>

            <Section id="connect-backend" num="01" title="Connect a backend">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
                Pick whichever fits how you run today. Both are first-class — you can also connect more than one
                backend to the same agent later.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-border bg-card">
                  <p className="text-[13px] font-semibold text-foreground mb-1">Generic connector</p>
                  <p className="text-[12px] text-muted-foreground/70 mb-3">HaloITSM, or any REST API — ~5 min</p>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-3">
                    Open{' '}
                    <Link href="/dashboard/connectors" className="text-primary hover:underline">
                      Dashboard → Connectors
                    </Link>{' '}
                    and add one: a base URL plus an auth method (none, API key, HTTP Basic, or OAuth2 client
                    credentials). Credentials are encrypted at rest, never stored in plaintext.
                  </p>
                  <div className="space-y-1 text-[11.5px] font-mono">
                    <KvLine k="platform" v="halo_itsm" />
                    <KvLine k="base_url" v="https://tenant.haloitsm.com" />
                    <KvLine k="auth" v="OAuth2 client credentials" />
                  </div>
                </div>
                <div className="p-4 rounded-lg border border-border bg-card">
                  <p className="text-[13px] font-semibold text-foreground mb-1">ServiceNow scoped app</p>
                  <p className="text-[12px] text-muted-foreground/70 mb-3">Deepest integration — ~15 min</p>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-3">
                    Install ZeVox as a scoped app in your instance. Gets you native forms for Agent Instructions,
                    Guardrails, and Knowledge Base search — configured on the ServiceNow side instead of the ZeVox
                    dashboard.
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Full walkthrough:{' '}
                    <a href="#sn-install" className="text-primary hover:underline">
                      Section 08 — Install the ServiceNow scoped app
                    </a>
                  </p>
                </div>
              </div>
            </Section>

            <Section id="configure-agent" num="02" title="Configure your agent">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Every agent — whether it&apos;s backed by a generic connector, ServiceNow, or both — is configured
                from{' '}
                <Link href="/dashboard/agents" className="text-primary hover:underline">
                  Dashboard → Agents
                </Link>
                . Open an agent and fill in the{' '}
                <strong className="text-foreground font-medium">Personality &amp; voice</strong> section:
              </p>
              <KvCard
                rows={[
                  ['Instructions', 'Personality, tone, and guardrails — spoken responses, so no formatting/emoji.'],
                  ['LLM model', 'e.g. groq/llama-3.3-70b-versatile — must match a model on your LiteLLM proxy.'],
                  ['Voice', 'A Kokoro voice (e.g. af_heart) for the self-hosted STT/TTS pipeline.'],
                ]}
              />
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Changes take effect on the next session — no redeploy needed. Example instructions for an IT
                support agent:
              </p>
              <CodeBlock>{`You are a helpful voice assistant. Your responses will be spoken aloud, so
avoid emojis, bullet points, or any formatting that can't be spoken. Keep
responses brief and conversational (1-3 sentences per turn).

Always use tools — never guess or make up ticket numbers, statuses, or
record details. After a tool call, speak the result naturally instead of
reading raw data back.`}</CodeBlock>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Going the ServiceNow route instead? The scoped app&apos;s{' '}
                <strong className="text-foreground font-medium">Agent Instructions</strong> field does the same
                job with a deeper playbook format — see{' '}
                <a href="#sn-instructions" className="text-primary hover:underline">Section 11</a>.
              </p>
            </Section>

            <Section id="add-tools" num="03" title="Add tools">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Tools are what let the agent actually do something — look up a ticket, create a record, search a
                knowledge base. What you add here depends on which backend(s) you connected in Section 01.
              </p>
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-border bg-card">
                  <p className="text-[13px] font-semibold text-foreground mb-2">On a generic connector</p>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-3">
                    Open the connector&apos;s detail page and add a tool: an HTTP method, a path template, its
                    parameters, and how to turn the response into something the agent can say out loud. Toggle
                    which connectors a given agent can use from that agent&apos;s detail page.
                  </p>
                  <div className="space-y-1 text-[11.5px] font-mono">
                    <KvLine k="tool" v="halo_create_ticket — POST /api/Tickets" />
                  </div>
                </div>
                <div className="p-4 rounded-lg border border-border bg-card">
                  <p className="text-[13px] font-semibold text-foreground mb-2">On ServiceNow</p>
                  <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                    Click <strong className="text-foreground font-medium">Seed Standard Tools</strong> on the Voice
                    Agent form for 9 ready-made tools (ticket lookup, incident creation, KB search, and more), or
                    build your own — see{' '}
                    <a href="#sn-custom-tools" className="text-primary hover:underline">Section 14</a>.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="widget" num="04" title="Embed the widget">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Open <strong className="text-foreground font-medium">Connection</strong> in ZeVox, copy the embed
                snippet, and paste it before your <InlineCode>{'</body>'}</InlineCode>:
              </p>
              <CodeBlock language="html">{`<script>window.ZEVOX_TOKEN = "sk_live_your_token_here";</script>
<script src="https://zevox.up.railway.app/widget.js"></script>`}</CodeBlock>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Customize the widget (colors, position, greeting, voice-only mode) on the{' '}
                <strong className="text-foreground font-medium">Connection</strong> page — changes apply instantly.
              </p>
              <p className="text-[13.5px] text-muted-foreground mt-2">
                For ServiceNow Service Portal: add this snippet to the portal theme header widget.
              </p>
            </Section>

            <Section id="phone" num="05" title="Phone calls">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Premium plans get a dedicated inbound phone number — callers dial in and speak directly to your
                agent, no widget or app required. Same agent config as the widget (Section 02); phone is just
                another channel.
              </p>
              <ol className="space-y-3">
                <Numbered n="1">
                  Open <strong className="text-foreground font-medium">Dashboard → Phone Numbers</strong> and buy a
                  number, or import one you already own in Twilio.
                </Numbered>
                <Numbered n="2">
                  Assign it to an agent. Inbound routing is configured automatically — no separate webhook setup.
                </Numbered>
                <Numbered n="3">
                  Optional: restrict who can call in from{' '}
                  <strong className="text-foreground font-medium">Dashboard → Phone Allowlist</strong>. Leave it
                  empty for open access.
                </Numbered>
              </ol>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Rejected calls (plan not eligible, caller not on the allowlist) are logged — see{' '}
                <a href="#monitoring" className="text-primary hover:underline">Monitoring</a> below.
              </p>
            </Section>

            <Section id="monitoring" num="06" title="Monitoring">
              <ul className="space-y-2.5">
                <BulletItem>
                  <strong className="text-foreground font-medium">ZeVox dashboard:</strong> the{' '}
                  <strong className="text-foreground font-medium">Usage</strong> page shows minutes, tokens, and a
                  month-end forecast. <strong className="text-foreground font-medium">Conversations</strong> has
                  full transcripts.
                </BulletItem>
                <BulletItem>
                  <strong className="text-foreground font-medium">Admin ops:</strong> the{' '}
                  <strong className="text-foreground font-medium">Live Logs</strong> page tails gateway events in
                  real time.
                </BulletItem>
                <BulletItem>
                  <strong className="text-foreground font-medium">Phone allowlist audit:</strong> denied calls are
                  logged with <InlineCode>phone.call.rejected</InlineCode> +{' '}
                  <InlineCode>reason: caller_not_on_allowlist</InlineCode> (or{' '}
                  <InlineCode>plan_not_phone_eligible</InlineCode>).
                </BulletItem>
                <BulletItem>
                  <strong className="text-foreground font-medium">ServiceNow route only:</strong>{' '}
                  <InlineCode>Conversation Sessions</InlineCode>, <InlineCode>Conversation Logs</InlineCode>, and{' '}
                  <InlineCode>Guardrail Violations</InlineCode> contain every call and rule trigger.
                </BulletItem>
              </ul>
            </Section>

            <Section id="troubleshooting" num="07" title="Troubleshooting">
              <div className="space-y-3">
                <Issue q='Agent responds "Sorry, I am having trouble right now"'>
                  Check the LLM model on the agent (Section 02) — it must match a model configured on your
                  voice-engine&apos;s LiteLLM proxy. On the ServiceNow route, click{' '}
                  <strong className="text-foreground font-medium">Test Connection</strong> on the LLM Configuration
                  record and check SN system logs for the provider&apos;s full error response.
                </Issue>
                <Issue q="Agent invents ticket numbers or record details">
                  Add an anti-fabrication rule to the agent&apos;s Instructions (Section 02) — e.g. &quot;never
                  guess a ticket number, always use a tool.&quot; On ServiceNow, refresh Standard Tools so output
                  schema enforcement is active.
                </Issue>
                <Issue q="Phone caller hears immediate hangup">
                  Either the caller&apos;s number isn&apos;t on your allowlist (when the allowlist is non-empty), or
                  the tenant isn&apos;t on the Premium plan. Check the audit log for{' '}
                  <InlineCode>phone.call.rejected</InlineCode> with the reason metadata.
                </Issue>
                <Issue q="search_knowledge returns nothing (ServiceNow route)">
                  If KB Cache is empty (new install), the tool falls back to direct{' '}
                  <InlineCode>kb_knowledge</InlineCode> text search. For richer results, link a KB to the agent
                  (Section 12) and run Reprocess All Articles.
                </Issue>
                <Issue q="Free tier keeps charging minutes past the limit">
                  The gate is enforced at connection start. If you still see overage, check Admin → Live Logs for{' '}
                  <InlineCode>quota.exceeded</InlineCode> events.
                </Issue>
              </div>
            </Section>

            <div className="pt-4 pb-2">
              <p className="text-[11px] font-mono tabular-nums text-primary tracking-[0.14em] uppercase mb-2">ServiceNow reference</p>
              <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                Sections 08–14 are a deep dive on the ServiceNow scoped-app path — install steps, the native
                Agent Instructions / Guardrails / Knowledge Base forms, and Script Include / Flow Designer custom
                tools. Skip this if you&apos;re on the generic-connector path from Section 01.
              </p>
            </div>

            <Section id="sn-install" num="08" title="Install the ServiceNow scoped app">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                ZeVox ships as a scoped application <InlineCode>x_ztpas_ai_voice_a</InlineCode> that owns agent
                configuration, tools, guardrails, and conversation history.
              </p>
              <p className="text-[13.5px] text-muted-foreground mb-3">
                Download the latest release from your{' '}
                <Link href="/dashboard/downloads/sn-app" className="text-primary hover:underline">
                  ZeVox dashboard
                </Link>
                {' '}(auth-gated, your customer copy), then install with the Now SDK:
              </p>
              <CodeBlock language="bash">{`# Unzip the download (contains dist/, docs/, README.md)
unzip ai-voice-agent-v1.0.2.zip -d ai-voice-agent
cd ai-voice-agent

# One-time: authenticate with your instance
npx now-sdk auth --add your-instance --type basic

# Install (uploads the scoped app and runs post-install setup)
npx now-sdk install --instance https://your-instance.service-now.com`}</CodeBlock>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                After install, the nav appears under <InlineCode>All &gt; AI Voice Agent</InlineCode>. A
                self-deactivating scheduled job wires form layout, related lists, and seeds a Demo Voice Agent + 9
                standard tools within 5 minutes.
              </p>
            </Section>

            <Section id="sn-connect" num="09" title="Connect ServiceNow to ZeVox">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                The SN app needs the SaaS URL and a tenant API key to push agent configuration and serve the gateway.
              </p>
              <p className="text-[13.5px] text-muted-foreground mb-3">
                Open <InlineCode>{'/x_ztpas_ai_voice_a_settings.do'}</InlineCode> (or use the{' '}
                <strong className="text-foreground font-medium">SaaS Connection</strong> nav module) and fill in:
              </p>
              <KvCard
                rows={[
                  ['SaaS Base URL', 'https://zevox.up.railway.app'],
                  ['Tenant API Key', 'sk_live_… (from ZeVox → Connection)'],
                ]}
              />
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Click <strong className="text-foreground font-medium">Test Connection</strong> — you should see{' '}
                <InlineCode>Connected (tenant: …)</InlineCode>. Then, in ZeVox,{' '}
                <strong className="text-foreground font-medium">Connection → Add Instance</strong> with the same
                instance URL and a service-account username/password, and copy the generated API key back into the
                SN SaaS Connection page above.
              </p>
            </Section>

            <Section id="sn-llm" num="10" title="Configure the LLM in ServiceNow">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Navigate to <InlineCode>AI Voice Agent &gt; LLM Configurations</InlineCode> and create a record (or
                edit the auto-seeded <strong className="text-foreground font-medium">Demo LLM Config</strong>):
              </p>
              <KvCard
                rows={[
                  ['Name', 'Production LLM'],
                  ['Provider Type', 'openai'],
                  ['API Endpoint', 'https://api.openai.com/v1/chat/completions'],
                  ['API Key', 'sk-… (encrypted at rest)'],
                  ['Model Name', 'gpt-4o-mini'],
                  ['Temperature', '0.6'],
                  ['Max Tokens', '1024'],
                  ['Top P', '0.95'],
                ]}
              />
              <p className="text-[13.5px] text-muted-foreground mt-4 mb-3">
                <strong className="text-foreground font-medium">Anthropic alternative:</strong>
              </p>
              <KvCard
                rows={[
                  ['API Endpoint', 'https://api.anthropic.com/v1/messages'],
                  ['Model Name', 'claude-haiku-4-5-20251001'],
                ]}
              />
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Click <strong className="text-foreground font-medium">Test Connection</strong> on the LLM record to
                validate config before linking it to an agent. Tool calling requires a function-calling-capable
                model — see <InlineCode>AiVoicePromptBuilder.TOOL_CAPABLE_MODEL_PREFIXES</InlineCode> for the
                verified list.
              </p>
            </Section>

            <Section id="sn-instructions" num="11" title="Agent Instructions playbook">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                On the Voice Agent form, <strong className="text-foreground font-medium">Agent Instructions</strong> is
                where the personality and workflow live — the ServiceNow-native equivalent of the dashboard
                Instructions field in Section 02, with the same anti-hallucination rule set injected automatically.
                Example for an IT support agent:
              </p>
              <CodeBlock>{`CORE RULES:
- Always use tools. Never guess or make up information.
- After tool results, speak naturally. Never read JSON or raw data.
- 1-3 sentences per turn.

WORKFLOW — before creating any ticket:
STEP 1: If the user asks for a ticket without describing the problem,
        respond "Sure, what is going on?" and wait.
STEP 2: Once you have the problem, say "Let me search the knowledge
        base for that." and call search_knowledge.
STEP 3: Share the top 1-2 article titles and offer to walk through one.
STEP 4: If no articles help, ASK "Would you like me to create an
        incident?" — do NOT create it without explicit agreement.
STEP 5: After user agrees, call create_incident. Speak the real
        number back: "I created incident I N C zero zero..."

QUERY PATTERNS:
- 'my tickets' → get_my_requests
- 'status of INCxxxx' → get_ticket_status
- 'email me' → send_email (recipient auto-resolved from profile)

ENDING THE CALL:
- If the user says "thanks" / "bye" — give a warm 1-2 sentence
  closing. Do NOT call any tools.`}</CodeBlock>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Stored on the agent record — hot-reloads on the next session, no redeploy. On the Voice Agent form,
                click <strong className="text-foreground font-medium">Seed Standard Tools</strong> to create the 9
                tools these instructions reference:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                {STANDARD_TOOLS.map((c) => (
                  <div key={c.name} className="p-3 rounded-md border border-border bg-card">
                    <p className="text-[12px] font-mono text-primary mb-0.5">{c.name}</p>
                    <p className="text-[11.5px] text-muted-foreground leading-snug">{c.desc}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="sn-kb" num="12" title="Link a Knowledge Base (optional)">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                <InlineCode>search_knowledge</InlineCode> works out of the box via direct{' '}
                <InlineCode>kb_knowledge</InlineCode> text search. For better relevance ranking + a feedback loop,
                set up the KB cache:
              </p>
              <ol className="space-y-3">
                <Numbered n="1">
                  On the Voice Agent record, open the{' '}
                  <strong className="text-foreground font-medium">Knowledge Bases</strong> related list → New.
                </Numbered>
                <Numbered n="2">
                  Pick a Knowledge Base (e.g. <em>IT</em>) and set Search Priority (lower = higher priority).
                </Numbered>
                <Numbered n="3">
                  Open <InlineCode>AI Voice Agent &gt; KB Cache</InlineCode> → click{' '}
                  <strong className="text-foreground font-medium">Reprocess All Articles</strong>.
                </Numbered>
                <Numbered n="4">
                  The scheduled job re-chunks articles every 6 hours and marks changed ones stale automatically.
                  Cache rows have a 90-day TTL — refreshes reset the timer.
                </Numbered>
              </ol>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                <strong className="text-foreground font-medium">Relevance feedback:</strong> when a session ends
                with <InlineCode>user_satisfaction=positive</InlineCode>, surfaced chunks get +5 relevance;
                negative sessions get −5. Ranking self-tunes over time.
              </p>
            </Section>

            <Section id="sn-guardrails" num="13" title="Add Guardrails (optional)">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                On the Voice Agent record, open the{' '}
                <strong className="text-foreground font-medium">Guardrails</strong> related list. Each guardrail is
                injected into the system prompt as a rule.
              </p>
              <KvCard
                rows={[
                  ['Name', 'No medical advice'],
                  ['Guardrail Type', 'scope_limitation'],
                  ['Description', 'Never give medical, legal, or financial advice. Offer to escalate instead.'],
                  ['Action on Violation', 'redirect'],
                  ['Violation Message', 'That is outside my scope — let me transfer you to someone who can help.'],
                ]}
              />
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Violations log to <InlineCode>Guardrail Violations</InlineCode> for review.
              </p>
            </Section>

            <Section id="sn-custom-tools" num="14" title="Custom tools — advanced">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Create custom tools via{' '}
                <InlineCode>AI Voice Agent &gt; Agent Tools &gt; New</InlineCode>. Three tool types are supported:
              </p>
              <div className="space-y-3">
                <div className="p-4 rounded-md border border-border bg-card">
                  <p className="text-[13px] font-semibold text-foreground mb-2">Custom Script</p>
                  <p className="text-[12.5px] text-muted-foreground mb-3">
                    Short JavaScript running in a scoped sandbox. Available variables:
                  </p>
                  <div className="space-y-1 text-[11.5px] font-mono">
                    <KvLine k="input" v="parameters from the LLM" />
                    <KvLine k="output" v="set fields the LLM will see" />
                    <KvLine k="success" v="false to signal failure" />
                    <KvLine k="error_message" v="explanation on failure" />
                    <KvLine k="caller_user_id" v="sys_user of the end-user (for attribution)" />
                    <KvLine k="agent_sys_id" v="the voice agent sys_id" />
                  </div>
                </div>
                <div className="p-4 rounded-md border border-border bg-card">
                  <p className="text-[13px] font-semibold text-foreground mb-2">Script Include</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Set Tool Type to <InlineCode>script_include</InlineCode> and configure{' '}
                    <InlineCode>script_include_class</InlineCode> + <InlineCode>script_include_method</InlineCode>.
                    Method is invoked as <InlineCode>{`new MyClass()[method](inputs, callerUserId)`}</InlineCode>{' '}
                    and the return value becomes the tool output. Use this when you already have a Script Include
                    with the logic.
                  </p>
                </div>
                <div className="p-4 rounded-md border border-border bg-card">
                  <p className="text-[13px] font-semibold text-foreground mb-2">Flow Designer</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    Set Tool Type to <InlineCode>flow_designer</InlineCode> and enter the scoped flow name (e.g.{' '}
                    <InlineCode>x_ztpas_ai_voice_a.approve_request</InlineCode>). Invoked via{' '}
                    <InlineCode>sn_fd.FlowAPI</InlineCode> with parameters passed as inputs.
                  </p>
                </div>
              </div>
              <p className="text-[13.5px] text-muted-foreground mt-4">
                For all three: add rows to <strong className="text-foreground font-medium">Parameters</strong>{' '}
                (with type, description, required) and{' '}
                <strong className="text-foreground font-medium">Output Fields</strong>. Required outputs are
                enforced — missing fields fail the tool, preventing hallucination.
              </p>
              <div className="mt-5 p-4 rounded-md border border-amber-400/20 bg-amber-400/[0.04]">
                <p className="text-[12.5px] text-amber-300 leading-relaxed">
                  <strong className="font-semibold">Security model:</strong> tool scripts run as the integration
                  user (the SN account ZeVox authenticates against), <em>not</em> as the caller. Use{' '}
                  <InlineCode>caller_user_id</InlineCode> for attribution, not gating. Scope down the integration
                  user&apos;s permissions to limit blast radius. The pre-save business rule blocks{' '}
                  <InlineCode>Packages.*</InlineCode>, <InlineCode>java.*</InlineCode>,{' '}
                  <InlineCode>GlidePluginManager</InlineCode>, and <InlineCode>GlideDBConfiguration</InlineCode> as
                  a secondary safety net.
                </p>
              </div>
            </Section>

          </main>
        </div>

        <footer className="mt-20 pt-8 border-t border-border max-w-[760px] lg:ml-[268px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground/70">© {new Date().getFullYear()} ZeVox</p>
          <a href="mailto:support@zevox.com" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
            Need help? support@zevox.com
          </a>
        </footer>
      </div>
    </div>
  )
}

// ── Section primitives (server-safe) ──

function Section({ id, num, title, children }: { id: string; num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-[10px] font-mono tabular-nums text-primary tracking-[0.14em]">{num}</span>
        <span className="h-px flex-1 max-w-[20px] bg-border" />
        <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11.5px] tracking-tight">{children}</code>
}

function KvCard({ rows }: { rows: [string, string][] }) {
  return (
    <div className="p-4 rounded-md border border-border bg-card divide-y divide-border">
      {rows.map(([k, v], i) => (
        <div key={k} className={cn('flex items-start justify-between gap-4', i === 0 ? 'pb-2.5' : i === rows.length - 1 ? 'pt-2.5' : 'py-2.5')}>
          <span className="text-[12px] text-muted-foreground shrink-0">{k}</span>
          <span className="text-[12px] font-mono text-foreground text-right break-all">{v}</span>
        </div>
      ))}
    </div>
  )
}

function KvLine({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="text-primary">{k}</span>
      <span className="text-muted-foreground"> — {v}</span>
    </div>
  )
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13.5px] text-muted-foreground leading-relaxed">
      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-1" />
      <span>{children}</span>
    </li>
  )
}

function Numbered({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[13.5px] text-muted-foreground leading-relaxed">
      <span className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] text-foreground font-mono shrink-0 mt-0.5">{n}</span>
      <span>{children}</span>
    </li>
  )
}

function Issue({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-md border border-border bg-card">
      <p className="text-[13px] font-medium text-foreground mb-1.5">{q}</p>
      <p className="text-[12.5px] text-muted-foreground leading-relaxed">{children}</p>
    </div>
  )
}
