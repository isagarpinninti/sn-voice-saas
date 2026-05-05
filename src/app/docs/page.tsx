import Link from 'next/link'
import { ArrowRight, Mail, Check } from 'lucide-react'
import { CodeBlock } from '@/components/docs/code-block'
import { TocNav, type TocItem } from '@/components/docs/toc-nav'
import { cn } from '@/lib/utils'

const SECTIONS: TocItem[] = [
  { id: 'prerequisites', num: '00', title: 'Prerequisites' },
  { id: 'install', num: '01', title: 'Install the ServiceNow scoped app' },
  { id: 'connect-sn', num: '02', title: 'Connect ServiceNow to ZeVox' },
  { id: 'llm', num: '03', title: 'Configure the LLM' },
  { id: 'agent', num: '04', title: 'Create your first voice agent' },
  { id: 'standard-tools', num: '05', title: 'Seed standard tools' },
  { id: 'connect-saas', num: '06', title: 'Set up your ZeVox tenant' },
  { id: 'instructions', num: '07', title: 'Agent Instructions playbook' },
  { id: 'kb', num: '08', title: 'Link a Knowledge Base' },
  { id: 'guardrails', num: '09', title: 'Add Guardrails' },
  { id: 'widget', num: '10', title: 'Embed the widget' },
  { id: 'custom-tools', num: '11', title: 'Custom tools — advanced' },
  { id: 'monitoring', num: '12', title: 'Monitoring' },
  { id: 'troubleshooting', num: '13', title: 'Troubleshooting' },
]

const STANDARD_TOOLS = [
  { name: 'get_user_context', desc: 'Caller profile — name, email, department, manager.' },
  { name: 'get_my_tickets', desc: 'Up to 10 open incidents for the caller.' },
  { name: 'get_ticket_status', desc: 'Look up INC / CHG / TASK / PRB by number.' },
  { name: 'create_incident', desc: 'Creates an incident — requires user confirmation.' },
  { name: 'update_incident', desc: 'Adds comment or changes state — requires confirmation.' },
  { name: 'search_knowledge', desc: 'Queries the KB cache; falls back to kb_knowledge.' },
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
            Install the ServiceNow scoped app, connect it to ZeVox, configure an AI voice agent, and embed the widget.
            End-to-end setup is about 15 minutes for a working demo agent.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-6">
            <Link
              href="/dashboard/downloads/sn-app"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-foreground text-background text-[12.5px] font-medium hover:bg-foreground/90 transition-colors"
            >
              Download the SN app
              <ArrowRight className="w-3.5 h-3.5" />
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
                  A ServiceNow instance on Vancouver or newer (Washington / Xanadu / Yokohama all supported).
                </BulletItem>
                <BulletItem>
                  Admin rights to install a scoped application.
                </BulletItem>
                <BulletItem>
                  An LLM API key —{' '}
                  <ExternalLink href="https://platform.openai.com">OpenAI</ExternalLink>{' '}
                  (<InlineCode>gpt-4o-mini</InlineCode> recommended) or{' '}
                  <ExternalLink href="https://console.anthropic.com">Anthropic</ExternalLink>{' '}
                  (<InlineCode>claude-haiku-4-5-20251001</InlineCode>). Groq with Llama models works but emits
                  malformed tool calls frequently.
                </BulletItem>
                <BulletItem>
                  A ZeVox account — free tier includes 50 lifetime minutes.
                </BulletItem>
                <BulletItem>
                  Node.js 18+ with the ServiceNow SDK installed: <InlineCode>npm i -g @servicenow/sdk</InlineCode>
                </BulletItem>
              </ul>
            </Section>

            <Section id="install" num="01" title="Install the ServiceNow scoped app">
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

            <Section id="connect-sn" num="02" title="Connect ServiceNow to ZeVox">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                The SN app needs the SaaS URL and a tenant API key to push agent configuration and serve the gateway.
              </p>
              <p className="text-[13.5px] text-muted-foreground mb-3">
                Open <InlineCode>{'/x_ztpas_ai_voice_a_settings.do'}</InlineCode> (or use the{' '}
                <strong className="text-foreground font-medium">SaaS Connection</strong> nav module) and fill in:
              </p>
              <KvCard
                rows={[
                  ['SaaS Base URL', 'https://zevox-production.up.railway.app'],
                  ['Tenant API Key', 'sk_live_… (from ZeVox → Connection)'],
                ]}
              />
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Click <strong className="text-foreground font-medium">Test Connection</strong> — you should see{' '}
                <InlineCode>Connected (tenant: …)</InlineCode>.
              </p>
            </Section>

            <Section id="llm" num="03" title="Configure the LLM">
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

            <Section id="agent" num="04" title="Create your first voice agent">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Open <InlineCode>AI Voice Agent &gt; Voice Agents</InlineCode> → New (or edit the auto-seeded
                Demo Voice Agent). STT/TTS settings are inline on the form.
              </p>
              <KvCard
                rows={[
                  ['Name', 'Nova'],
                  ['Agent Identity', 'You are Nova, a friendly IT support assistant.'],
                  ['Agent Instructions', 'Workflow playbook — see Section 07'],
                  ['LLM Configuration', 'Production LLM (from Section 03)'],
                  ['STT Model', 'nova-3'],
                  ['STT Language', 'en-US'],
                  ['TTS Voice', 'aura-asteria-en (female) or aura-orion-en (male)'],
                  ['TTS Speaking Rate', '1.0'],
                  ['Context Window (Messages)', '4'],
                  ['Max Tool Calls Per Turn', '5'],
                  ['Conversation Starters', '["Check my tickets","Create an incident"]'],
                  ['Active', '✓'],
                ]}
              />
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Save. The record auto-syncs to ZeVox within seconds — the agent appears in the dashboard's Agents
                list.
              </p>
            </Section>

            <Section id="standard-tools" num="05" title="Seed standard tools">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                On the Voice Agent form, click <strong className="text-foreground font-medium">Seed Standard Tools</strong>{' '}
                (or <strong className="text-foreground font-medium">Refresh Standard Tools</strong> to re-apply
                existing ones). This creates 9 ready-to-use tools:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
                {STANDARD_TOOLS.map((c) => (
                  <div key={c.name} className="p-3 rounded-md border border-border bg-card">
                    <p className="text-[12px] font-mono text-primary mb-0.5">{c.name}</p>
                    <p className="text-[11.5px] text-muted-foreground leading-snug">{c.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-[13.5px] text-muted-foreground">
                Each tool has visual <strong className="text-foreground font-medium">Parameters</strong> and{' '}
                <strong className="text-foreground font-medium">Output Fields</strong> related lists — no JSON
                editing needed. Click <strong className="text-foreground font-medium">Test Tool</strong> on any
                tool record to dry-run it with sample input.
              </p>
            </Section>

            <Section id="connect-saas" num="06" title="Set up your ZeVox tenant">
              <ol className="space-y-3">
                <Numbered n="1">
                  Sign in at <ExternalLink href="/auth">zevox.zetechno.com</ExternalLink> with Google or GitHub.
                </Numbered>
                <Numbered n="2">
                  New tenants land on the <strong className="text-foreground font-medium">Get Started</strong>{' '}
                  page — a 5-step checklist that auto-detects progress.
                </Numbered>
                <Numbered n="3">
                  Open <strong className="text-foreground font-medium">Connection</strong> →{' '}
                  <strong className="text-foreground font-medium">Add Instance</strong>.
                </Numbered>
                <Numbered n="4">
                  Enter the instance URL ({' '}
                  <InlineCode>https://yourinstance.service-now.com</InlineCode>), a service-account username, and
                  password.
                </Numbered>
                <Numbered n="5">
                  Click <strong className="text-foreground font-medium">Test Connection</strong>. Green ticks on
                  every check = ready.
                </Numbered>
                <Numbered n="6">
                  Copy the generated <strong className="text-foreground font-medium">API key</strong> and paste it
                  into the SN SaaS Connection page (Section 02).
                </Numbered>
              </ol>
            </Section>

            <Section id="instructions" num="07" title="Agent Instructions playbook">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                <strong className="text-foreground font-medium">Agent Instructions</strong> is where the personality
                and workflow live. The SN app injects a generic anti-hallucination rule set; your instructions
                define the rest. Example for an IT support agent:
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
- 'my tickets' → get_my_tickets
- 'status of INCxxxx' → get_ticket_status
- 'email me' → send_email (recipient auto-resolved from profile)

ENDING THE CALL:
- If the user says "thanks" / "bye" — give a warm 1-2 sentence
  closing. Do NOT call any tools.`}</CodeBlock>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Stored on the agent record — hot-reloads on the next session, no redeploy.
              </p>
            </Section>

            <Section id="kb" num="08" title="Link a Knowledge Base (optional)">
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

            <Section id="guardrails" num="09" title="Add Guardrails (optional)">
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

            <Section id="widget" num="10" title="Embed the widget">
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
                Open <strong className="text-foreground font-medium">Connection</strong> in ZeVox, copy the embed
                snippet, and paste it before your <InlineCode>{'</body>'}</InlineCode>:
              </p>
              <CodeBlock language="html">{`<script src="https://zevox-production.up.railway.app/widget.js"
        data-token="sk_live_your_token_here"></script>`}</CodeBlock>
              <p className="text-[13.5px] text-muted-foreground mt-3">
                Customize the widget (colors, position, greeting, voice-only mode) on the{' '}
                <strong className="text-foreground font-medium">Connection</strong> page — changes apply instantly.
              </p>
              <p className="text-[13.5px] text-muted-foreground mt-2">
                For ServiceNow Service Portal: add this snippet to the portal theme header widget.
              </p>
            </Section>

            <Section id="custom-tools" num="11" title="Custom tools — advanced">
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
                  user's permissions to limit blast radius. The pre-save business rule blocks{' '}
                  <InlineCode>Packages.*</InlineCode>, <InlineCode>java.*</InlineCode>,{' '}
                  <InlineCode>GlidePluginManager</InlineCode>, and <InlineCode>GlideDBConfiguration</InlineCode> as
                  a secondary safety net.
                </p>
              </div>
            </Section>

            <Section id="monitoring" num="12" title="Monitoring">
              <ul className="space-y-2.5">
                <BulletItem>
                  <strong className="text-foreground font-medium">SN:</strong>{' '}
                  <InlineCode>Conversation Sessions</InlineCode> and{' '}
                  <InlineCode>Conversation Logs</InlineCode> contain every call.
                </BulletItem>
                <BulletItem>
                  <strong className="text-foreground font-medium">ZeVox dashboard:</strong> the{' '}
                  <strong className="text-foreground font-medium">Usage</strong> page shows minutes, tokens, and a
                  month-end forecast.
                </BulletItem>
                <BulletItem>
                  <strong className="text-foreground font-medium">Admin ops:</strong> the{' '}
                  <strong className="text-foreground font-medium">Live Logs</strong> page tails gateway events in
                  real time.
                </BulletItem>
                <BulletItem>
                  <strong className="text-foreground font-medium">Guardrail violations:</strong> admin-only list
                  showing every triggered guardrail.
                </BulletItem>
                <BulletItem>
                  <strong className="text-foreground font-medium">Phone allowlist audit:</strong> denied calls are
                  logged with <InlineCode>phone.call.rejected</InlineCode> +{' '}
                  <InlineCode>reason: caller_not_on_allowlist</InlineCode>.
                </BulletItem>
              </ul>
            </Section>

            <Section id="troubleshooting" num="13" title="Troubleshooting">
              <div className="space-y-3">
                <Issue q='Agent responds "Sorry, I am having trouble right now"'>
                  Click Test Connection on the LLM record. Groq with Llama models frequently fails tool calling;
                  switch to OpenAI <InlineCode>gpt-4o-mini</InlineCode> or Anthropic{' '}
                  <InlineCode>claude-haiku-4-5</InlineCode>.
                </Issue>
                <Issue q="Agent invents incident numbers or record details">
                  Open the agent record → Refresh Standard Tools. Each tool now enforces output schema and the
                  prompt includes anti-fabrication rules. Verify your{' '}
                  <strong className="text-foreground font-medium">Agent Instructions</strong> includes a "never
                  fabricate parameter values" section (Section 07).
                </Issue>
                <Issue q="search_knowledge returns nothing">
                  If KB Cache is empty (new install), the tool falls back to direct{' '}
                  <InlineCode>kb_knowledge</InlineCode> text search. For richer results, link a KB to the agent
                  (Section 08) and run Reprocess All Articles.
                </Issue>
                <Issue q="Phone caller hears immediate hangup">
                  Either the caller's number isn't on your allowlist (when allowlist is non-empty), or the tenant
                  isn't on the Premium plan. Check the SN audit log for{' '}
                  <InlineCode>phone.call.rejected</InlineCode> with the reason metadata.
                </Issue>
                <Issue q="Free tier keeps charging minutes past the limit">
                  Fixed — the gate is now enforced at WebSocket connection. If you still see overage, check Admin
                  → Live Logs for <InlineCode>quota.exceeded</InlineCode> events.
                </Issue>
              </div>
            </Section>

          </main>
        </div>

        <footer className="mt-20 pt-8 border-t border-border max-w-[760px] lg:ml-[268px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground/70">© {new Date().getFullYear()} ZeVox — A ZeTechno Product</p>
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

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  )
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
