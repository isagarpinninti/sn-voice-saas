export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 glass">
        <div className="max-w-[820px] mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /></svg>
            </div>
            <span className="text-[13px] font-semibold">ZeVox</span>
            <span className="text-[11px] text-zinc-600 ml-1">/ Docs</span>
          </a>
          <a href="/auth" className="text-[12px] px-3 py-1.5 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition-colors">Get started</a>
        </div>
      </nav>

      <div className="max-w-[820px] mx-auto px-6 py-16">
        <h1 className="text-[32px] font-bold tracking-[-0.03em] mb-3">ZeVox Setup Guide</h1>
        <p className="text-[15px] text-zinc-500 mb-12 leading-relaxed">
          Install the ServiceNow scoped app, connect it to ZeVox, configure an AI voice agent, and embed the widget.
          End-to-end setup is about 15 minutes.
        </p>

        <div className="space-y-16">

          <Section num="00" title="Prerequisites">
            <ul className="space-y-3">
              <Item>A ServiceNow instance on Utah or newer (Vancouver, Washington, Xanadu, Yokohama all supported)</Item>
              <Item>Admin rights to install a scoped application</Item>
              <Item>An LLM API key — <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">OpenAI</a> (<code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">gpt-4o-mini</code> recommended) or <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Anthropic</a> (<code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">claude-haiku-4-5</code>). Groq/Llama models work but emit malformed tool calls frequently.</Item>
              <Item>ZeVox account (free tier includes 50 lifetime minutes)</Item>
            </ul>
          </Section>

          <Section num="01" title="Install the ServiceNow scoped app">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              ZeVox requires a scoped app (<code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">x_ztpas_ai_voice_a</code>) installed on your instance. It owns agent configuration, tools, guardrails, and conversation history.
            </p>
            <p className="text-[13px] text-zinc-500 mb-3">Clone the repo and install using the Now SDK:</p>
            <CodeBlock>{`git clone https://github.com/zetechno/zevox-servicenow.git
cd zevox-servicenow
npm install

# One-time: authenticate with your instance
npx now-sdk auth --add your-instance --type basic

# Build and install
npx now-sdk build
npx now-sdk install`}</CodeBlock>
            <p className="text-[13px] text-zinc-500 mt-3">
              After install, the app nav appears at <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">All &gt; AI Voice Agent</code>. A scheduled job wires form layout + related lists automatically within ~5 minutes.
            </p>
          </Section>

          <Section num="02" title="Connect ServiceNow to ZeVox SaaS">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              The SN app needs to know where to push agent changes. Set two system properties:
            </p>
            <p className="text-[13px] text-zinc-500 mb-3">
              Open <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">AI Voice Agent &gt; SaaS Connection</code> (from the left nav) and fill in:
            </p>
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-3">
              <Row label="SaaS Base URL" value="https://zevox-production.up.railway.app" />
              <Row label="Tenant API Key" value="sk_live_... (from ZeVox → Connection)" />
            </div>
            <p className="text-[13px] text-zinc-500 mt-3">Click <strong className="text-white">Test Connection</strong> — you should see <code className="text-emerald-400">Connected (tenant: …)</code>.</p>
          </Section>

          <Section num="03" title="Configure the LLM">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              Navigate to <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">AI Voice Agent &gt; LLM Configurations</code> and create a record:
            </p>
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-3 mb-3">
              <Row label="Name" value="Production LLM" />
              <Row label="Provider Type" value="openai" />
              <Row label="API Endpoint" value="https://api.openai.com/v1" />
              <Row label="API Key" value="sk-... (your OpenAI key, encrypted)" />
              <Row label="Model Name" value="gpt-4o-mini" />
              <Row label="Temperature" value="0.6" />
              <Row label="Max Tokens" value="300" />
              <Row label="Top P" value="0.95" />
            </div>
            <p className="text-[13px] text-zinc-500 mb-3"><strong className="text-white">Anthropic alternative:</strong></p>
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-3">
              <Row label="API Endpoint" value="https://api.anthropic.com/v1" />
              <Row label="Model Name" value="claude-haiku-4-5-20251001" />
            </div>
            <p className="text-[13px] text-zinc-500 mt-3">
              Click <strong className="text-white">Test Connection</strong> on the LLM record to validate credentials before creating agents.
            </p>
          </Section>

          <Section num="04" title="Create your first voice agent">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              Open <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">AI Voice Agent &gt; Voice Agents</code> → New. STT/TTS settings are inline (no separate tables).
            </p>
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-3 mb-4">
              <Row label="Name" value="Nova (or your agent name)" />
              <Row label="Agent Identity" value="You are Nova, a friendly IT support assistant." />
              <Row label="Agent Instructions" value="Your workflow playbook — see Section 07 below" />
              <Row label="LLM Configuration" value="Production LLM (from Section 03)" />
              <Row label="STT Model" value="nova-3" />
              <Row label="STT Language" value="en-US" />
              <Row label="TTS Voice" value="aura-asteria-en (female) or aura-orion-en (male)" />
              <Row label="TTS Speaking Rate" value="1.0" />
              <Row label="Context Window (Messages)" value="4" />
              <Row label="Max Tool Calls Per Turn" value="5" />
              <Row label="Conversation Starters" value={'["Check my tickets","Create an incident"]'} />
              <Row label="Active" value="✓" />
            </div>
            <p className="text-[13px] text-zinc-500">
              Save. The record auto-syncs to ZeVox within seconds (you'll see it appear in the dashboard's Agents list).
            </p>
          </Section>

          <Section num="05" title="Seed standard tools">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              On the Voice Agent form, click <strong className="text-white">Seed Standard Tools</strong> (or <strong className="text-white">Refresh Standard Tools</strong> if they already exist). This creates 7 ready-to-use tools:
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                { t: 'get_user_context', d: 'Returns caller profile (name, email, dept, manager).' },
                { t: 'get_my_tickets', d: 'Lists up to 10 open incidents for the caller.' },
                { t: 'get_ticket_status', d: 'Look up INC/CHG/TASK/PRB by number.' },
                { t: 'create_incident', d: 'Creates an incident — requires user confirmation.' },
                { t: 'update_incident', d: 'Adds comment / changes state — requires confirmation.' },
                { t: 'search_knowledge', d: 'Queries KB cache first, falls back to kb_knowledge.' },
                { t: 'send_email', d: 'Sends to caller\'s email (resolved from profile).' },
              ].map((c) => (
                <div key={c.t} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <p className="text-[12px] font-mono text-emerald-400 mb-0.5">{c.t}</p>
                  <p className="text-[11px] text-zinc-500">{c.d}</p>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-zinc-500">
              Each tool has a visual <strong className="text-white">Parameters</strong> and <strong className="text-white">Output Fields</strong> related list — no JSON editing needed. Customize or test any tool using the <strong className="text-white">Test Tool</strong> button.
            </p>
          </Section>

          <Section num="06" title="Connect ZeVox to your ServiceNow instance">
            <ol className="space-y-4">
              <Li n="1">Sign in at <a href="/auth" className="text-emerald-400 hover:underline">zevox.zetechno.com/auth</a> (Google or GitHub)</Li>
              <Li n="2">New tenants land on the <strong className="text-white">Get Started</strong> page — a 5-step checklist that auto-detects progress.</Li>
              <Li n="3">Open <strong className="text-white">Connection</strong> → <strong className="text-white">Add Instance</strong></Li>
              <Li n="4">Enter the instance URL (<code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">https://yourinstance.service-now.com</code>), a service-account username, and password</Li>
              <Li n="5">Click <strong className="text-white">Test Connection</strong>. Green ticks on all steps = ready.</Li>
              <Li n="6">Copy the generated <strong className="text-white">API key</strong> and paste it into the SN SaaS Connection page (Section 02).</Li>
            </ol>
          </Section>

          <Section num="07" title="Agent Instructions — workflow playbook">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              <strong className="text-white">Agent Instructions</strong> is where the personality and workflow live. The SN app injects a generic anti-hallucination rule set; your instructions define the rest. Example for an IT support agent:
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
            <p className="text-[13px] text-zinc-500 mt-3">
              This playbook is stored on the agent record and hot-reloads on the next session — no redeploy.
            </p>
          </Section>

          <Section num="08" title="Link a Knowledge Base (optional)">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              <strong className="text-white">search_knowledge</strong> works out of the box via direct <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">kb_knowledge</code> text search. For better results with relevance ranking and feedback loop, set up the KB cache:
            </p>
            <ol className="space-y-4">
              <Li n="1">On your Voice Agent record, open the <strong className="text-white">Knowledge Bases</strong> related list → New</Li>
              <Li n="2">Pick a Knowledge Base (e.g. "IT") and set Search Priority (lower = higher)</Li>
              <Li n="3">Go to <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">AI Voice Agent &gt; KB Cache</code> → click <strong className="text-white">Reprocess All Articles</strong></Li>
              <Li n="4">The scheduled job re-chunks articles every 6 hours and marks changed ones stale automatically</Li>
            </ol>
            <p className="text-[13px] text-zinc-500 mt-3">
              <strong className="text-white">Relevance feedback:</strong> when a session ends with <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">user_satisfaction=positive</code>, surfaced chunks get +5 relevance; negative sessions get -5. KB ranking self-tunes over time.
            </p>
          </Section>

          <Section num="09" title="Add Guardrails (optional)">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              On your Voice Agent record, open the <strong className="text-white">Guardrails</strong> related list. Each guardrail is injected into the system prompt as a rule.
            </p>
            <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-3">
              <Row label="Name" value="No medical advice" />
              <Row label="Guardrail Type" value="scope_limitation" />
              <Row label="Description" value="Never give medical, legal, or financial advice. Offer to escalate instead." />
              <Row label="Action on Violation" value="redirect" />
              <Row label="Violation Message" value="That is outside my scope — let me transfer you to someone who can help." />
            </div>
            <p className="text-[13px] text-zinc-500 mt-3">
              Violations are logged to <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">Guardrail Violations</code> for review.
            </p>
          </Section>

          <Section num="10" title="Embed the widget">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              Open <strong className="text-white">Connection</strong> in ZeVox, copy the embed snippet, and paste it before your <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">&lt;/body&gt;</code>:
            </p>
            <CodeBlock>{`<script src="https://zevox-production.up.railway.app/widget.js"
        data-token="sk_live_your_token_here"></script>`}</CodeBlock>
            <p className="text-[13px] text-zinc-500 mt-3">
              Customize the widget (colors, position, greeting, voice-only mode) on the <strong className="text-white">Connection</strong> page — changes apply instantly.
            </p>
            <p className="text-[13px] text-zinc-500 mt-2">
              For ServiceNow Service Portal: add this snippet to the portal theme header widget.
            </p>
          </Section>

          <Section num="11" title="Custom tools — advanced">
            <p className="text-[14px] text-zinc-400 leading-relaxed mb-4">
              Create custom tools via <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">AI Voice Agent &gt; Agent Tools &gt; New</code>. Two tool types are supported:
            </p>
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <p className="text-[13px] font-semibold text-white mb-2">Custom Script</p>
                <p className="text-[12px] text-zinc-500 mb-3">Short JavaScript running in a scoped sandbox. Available variables:</p>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div><span className="text-emerald-400">input</span><span className="text-zinc-600"> — parameters from LLM</span></div>
                  <div><span className="text-emerald-400">output</span><span className="text-zinc-600"> — set fields the LLM will see</span></div>
                  <div><span className="text-emerald-400">success</span><span className="text-zinc-600"> — set false to signal failure</span></div>
                  <div><span className="text-emerald-400">error_message</span><span className="text-zinc-600"> — explanation on failure</span></div>
                  <div><span className="text-emerald-400">caller_user_id</span><span className="text-zinc-600"> — sys_user of the end-user</span></div>
                  <div><span className="text-emerald-400">agent_sys_id</span><span className="text-zinc-600"> — the voice agent sys_id</span></div>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <p className="text-[13px] font-semibold text-white mb-2">Flow Designer</p>
                <p className="text-[12px] text-zinc-500">Set Tool Type to <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">flow_designer</code> and enter the scoped flow name (e.g. <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">x_ztpas_ai_voice_a.approve_request</code>). The executor invokes it via <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">sn_fd.FlowAPI</code>, with parameters passed as inputs.</p>
              </div>
            </div>
            <p className="text-[13px] text-zinc-500 mt-4">
              For both types: add rows to <strong className="text-white">Parameters</strong> (with type, description, required) and <strong className="text-white">Output Fields</strong> (required outputs are enforced — missing fields fail the tool, preventing hallucination).
            </p>
          </Section>

          <Section num="12" title="Monitoring">
            <ul className="space-y-3">
              <Item><strong className="text-white">SN:</strong> <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">Conversation Sessions</code> and <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">Conversation Logs</code> contain every call.</Item>
              <Item><strong className="text-white">ZeVox:</strong> the <strong>Usage</strong> page shows minutes, tokens, and a month-end forecast.</Item>
              <Item><strong className="text-white">Admin ops:</strong> the <strong>Live Logs</strong> page tails gateway events in real time.</Item>
              <Item><strong className="text-white">Guardrail violations:</strong> admin-only list showing every triggered guardrail.</Item>
            </ul>
          </Section>

          <Section num="13" title="Troubleshooting">
            <div className="space-y-3">
              <Issue q='Agent responds "Sorry, I am having trouble right now"'>
                Check the LLM configuration — click Test Connection on the LLM record. Groq with Llama models frequently fails tool calling; switch to OpenAI <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">gpt-4o-mini</code> or Anthropic <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">claude-haiku-4-5</code>.
              </Issue>
              <Issue q="Agent invents incident numbers or record details">
                Open the agent record → Refresh Standard Tools. Each tool now enforces output schema and the prompt includes anti-fabrication rules. Verify your <strong className="text-white">Agent Instructions</strong> includes a "never fabricate parameter values" section (Section 07).
              </Issue>
              <Issue q="search_knowledge returns nothing">
                If KB Cache is empty (new install), the tool falls back to direct <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">kb_knowledge</code> text search. For richer results, link a KB to the agent (Section 08) and run Reprocess All Articles.
              </Issue>
              <Issue q="Free tier keeps charging minutes past the limit">
                Fixed — the gate is now enforced at WebSocket connection. If you still see overage, check Admin → Live Logs for <code className="text-emerald-400 bg-white/[0.04] px-1 rounded text-[11px]">quota.exceeded</code> events.
              </Issue>
            </div>
          </Section>
        </div>

        <div className="mt-20 pt-8 border-t border-white/[0.04] flex items-center justify-between">
          <p className="text-[11px] text-zinc-700">ZeVox — A ZeTechno Product</p>
          <a href="mailto:support@zevox.com" className="text-[12px] text-zinc-500 hover:text-white transition-colors">Need help? support@zevox.com</a>
        </div>
      </div>
    </div>
  )
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[12px] font-mono text-emerald-500/50">{num}</span>
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="p-4 rounded-xl bg-[#0a0a0c] border border-white/[0.06] overflow-x-auto">
      <code className="text-[13px] text-zinc-300 font-mono leading-relaxed whitespace-pre">{children}</code>
    </pre>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] text-zinc-500 shrink-0">{label}</span>
      <span className="text-[12px] font-mono text-zinc-300 text-right">{value}</span>
    </div>
  )
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px] text-zinc-400 leading-relaxed">
      <svg className="w-4 h-4 text-emerald-500/60 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg>
      <span>{children}</span>
    </li>
  )
}

function Li({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[14px] text-zinc-400 leading-relaxed">
      <span className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] text-zinc-500 font-mono shrink-0 mt-0.5">{n}</span>
      <span>{children}</span>
    </li>
  )
}

function Issue({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <p className="text-[13px] font-medium text-white mb-1.5">{q}</p>
      <p className="text-[12px] text-zinc-500 leading-relaxed">{children}</p>
    </div>
  )
}
