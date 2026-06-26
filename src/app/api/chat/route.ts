/**
 * Text chat endpoint — used by the widget in chat_only / both mode.
 *
 * POST /api/chat
 * Body: { token, agent, message, session_id?, sn_user_id?, user_email? }
 * Response: { session_id, message }
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signUploadToken } from '@/lib/upload-tokens'
import { createPendingUpload } from '@/lib/upload-registry'

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-cache',
}

// ── In-memory session store (30-min TTL) ──────────────────────────────────
type ChatSession = {
  history:       { role: 'user' | 'assistant'; content: string }[]
  instanceId:    string
  tenantId:      string
  snInstanceUrl: string
  snAuth:        string
  agentSnToken:  string
  userEmail:     string
  createdAt:     number
}
const sessions = new Map<string, ChatSession>()

function gcSessions() {
  const cut = Date.now() - 30 * 60 * 1000
  for (const [id, s] of sessions) if (s.createdAt < cut) sessions.delete(id)
}

// ── System prompt builder ─────────────────────────────────────────────────
function buildSystemPrompt(cfg: any): string {
  const agentName = cfg?.agent_identity || 'Service Desk Agent'
  const org       = cfg?.org_name || ''
  const orgLine   = org ? ` for ${org}` : ''

  const base = `You are ${agentName}${orgLine}, a professional IT Service Desk Agent. You handle IT incidents, service requests, password resets, access requests, software issues, and general IT questions with expertise and empathy.

## Core Responsibilities
- Diagnose and resolve IT issues on first contact where possible
- Create and update ServiceNow tickets using available tools
- Escalate complex issues clearly, explaining next steps to the user
- Provide accurate ETAs and follow-ups when resolution requires time

## How to Handle Requests
1. **Greet** the user professionally and acknowledge their issue
2. **Gather context**: affected system/app, error messages, when it started, steps already tried
3. **Diagnose**: ask targeted clarifying questions — no more than 2-3 at a time
4. **Resolve**: provide clear step-by-step guidance or use tools to take action
5. **Confirm**: always confirm the issue is resolved before closing

## Communication Style
- Professional, calm, and empathetic — even with frustrated users
- Use plain language; avoid acronyms unless the user uses them first
- Keep responses concise and structured (use numbered steps for instructions)
- Never make promises you cannot keep (e.g., "I'll escalate and someone will call within the hour" only if you can guarantee it)
- Do not repeat the user's words back unnecessarily

## File Uploads — STRICT RULE
- **NEVER** proactively suggest or mention file uploads
- **ONLY** use the \`request_attachment\` tool if the user explicitly says they have a screenshot, log file, or document to share (e.g. "I have a screenshot", "can I share an error log?")
- If the user says they have no file or declines, **never bring it up again**
- Do not offer "you can upload a screenshot" as a troubleshooting step

## Email — STRICT RULE
- **ONLY** use the \`send_email\` tool if the user explicitly asks you to send them an email (e.g. "send me an email with the steps", "email me the ticket number")
- Ask for their email address first if it is not already known
- Format the email body clearly with a subject that matches the conversation topic

## Tools Usage
- Use ServiceNow tools (create ticket, look up records, etc.) only when they add value — don't call tools unnecessarily
- Always inform the user when you take an action ("I've created a ticket for you — number INC0001234")
- If a tool fails, tell the user and offer an alternative`

  const agentInstructions = cfg?.agent_instructions
    ? `\n\n## Agent-Specific Instructions\n${cfg.agent_instructions}`
    : ''

  const guardrailsBlock = cfg?.guardrails?.length
    ? `\n\n## Rules\n${cfg.guardrails.map((g: any) => `- ${g.description}`).filter(Boolean).join('\n')}`
    : ''

  return base + agentInstructions + guardrailsBlock + '\n\nYou are responding via text chat. Be concise and actionable.'
}

// ── Route handlers ─────────────────────────────────────────────────────────
export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  gcSessions()

  const body      = await req.json().catch(() => null)
  const token     = (body?.token      || '').trim()
  const agentId   = (body?.agent      || '').trim()
  const userMsg   = (body?.message    || '').trim()
  const snUserId  = (body?.sn_user_id || '').trim()
  const userEmail = (body?.user_email || '').trim()
  const sessionId: string = body?.session_id || crypto.randomUUID()

  if (!token || !userMsg) {
    return NextResponse.json({ error: 'token and message are required' }, { status: 400, headers: CORS })
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  const apiToken = await db.apiToken.findUnique({
    where: { token },
    include: { instance: true },
  })
  if (!apiToken?.active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403, headers: CORS })
  }

  const instance = apiToken.instance ?? await db.instance.findFirst({
    where: { tenantId: apiToken.tenantId, active: true },
  })
  if (!instance) {
    return NextResponse.json({ error: 'No instance configured' }, { status: 404, headers: CORS })
  }

  const snAuth = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')

  // ── Get or create session ─────────────────────────────────────────────
  let sess = sessions.get(sessionId)
  if (!sess) {
    sess = {
      history:       [],
      instanceId:    instance.id,
      tenantId:      apiToken.tenantId,
      snInstanceUrl: instance.snInstanceUrl,
      snAuth,
      agentSnToken:  agentId,
      userEmail,
      createdAt:     Date.now(),
    }
    sessions.set(sessionId, sess)
  }
  // Update user email if provided in this turn
  if (userEmail) sess.userEmail = userEmail

  // ── Fetch agent config from SN ────────────────────────────────────────
  let agentCfg: any = null
  if (agentId) {
    try {
      const r = await fetch(
        `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/agent/${agentId}`,
        { headers: { Authorization: `Basic ${snAuth}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000) }
      )
      if (r.ok) { const d = await r.json(); agentCfg = d.result ?? d }
    } catch { /* fall back to base prompt */ }
  }

  const llmEndpoint  = agentCfg?.llm?.api_endpoint || 'https://api.groq.com/openai/v1/chat/completions'
  const llmKey       = agentCfg?.llm?.api_key      || ''
  const llmModel     = agentCfg?.llm?.model_name   || 'llama-3.3-70b-versatile'
  const systemPrompt = buildSystemPrompt(agentCfg)

  // ── Built-in tools ────────────────────────────────────────────────────
  const builtInTools = [
    {
      type: 'function',
      function: {
        name: 'request_attachment',
        description:
          'Request a file upload from the user. ' +
          'Use ONLY when the user has explicitly stated they have a screenshot, log file, error dump, or document to share. ' +
          'NEVER call this proactively or suggest uploading unless the user brings it up first. ' +
          'If the user declines or says they have no file, do not call this tool.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Brief description of what file is needed and why' },
          },
          required: ['reason'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_knowledge_base',
        description:
          'Search ServiceNow knowledge articles for a solution. ' +
          'ALWAYS call this first before creating an incident or service request — it is mandatory triage. ' +
          'Call it as soon as you understand the user\'s issue. ' +
          'If articles are found, present the solution steps one at a time and ask if they resolved the issue. ' +
          'Only create an incident if the user confirms the KB steps did not work or no relevant articles were found.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search terms describing the issue. Be specific — e.g. "VPN not connecting Windows 11" or "Outlook cannot send emails".',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_email',
        description:
          'Send a professional HTML email to the user. ' +
          'Use ONLY when the user explicitly asks you to send them an email. ' +
          'If their email address is unknown, ask for it before calling this tool. ' +
          'The body should be clear and complete — written as a standalone email the user can reference later.',
        parameters: {
          type: 'object',
          properties: {
            to:      { type: 'string',  description: 'Recipient email address' },
            subject: { type: 'string',  description: 'Email subject line — concise and descriptive' },
            body:    { type: 'string',  description: 'Full email body. Use \\n\\n between paragraphs. Include greeting, content, and sign-off.' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    },
  ]

  // ── SN-defined tools ──────────────────────────────────────────────────
  const activeSnTools = (agentCfg?.tools ?? []).filter((t: any) => t.active !== false)
  const snLlmTools = activeSnTools.map((t: any) => ({
    type: 'function',
    function: {
      name:        t.name,
      description: t.description || t.name,
      parameters:  t.input_schema ?? { type: 'object', properties: {} },
    },
  }))

  const llmTools = [...builtInTools, ...snLlmTools]

  // ── Append user message ───────────────────────────────────────────────
  sess.history.push({ role: 'user', content: userMsg })

  const messages = [
    { role: 'system', content: systemPrompt },
    ...sess.history.slice(-20),
  ]

  // ── First LLM call ────────────────────────────────────────────────────
  const llmBody: any = {
    model:       llmModel,
    messages,
    temperature: agentCfg?.llm?.temperature ?? 0.3,
    max_tokens:  agentCfg?.llm?.max_tokens  ?? 1024,
  }
  if (llmTools.length) { llmBody.tools = llmTools; llmBody.tool_choice = 'auto' }

  let llmRes = await fetch(llmEndpoint, {
    method:  'POST',
    headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(llmBody),
    signal:  AbortSignal.timeout(30_000),
  })
  if (!llmRes.ok) {
    const err = await llmRes.text()
    return NextResponse.json({ error: `LLM error ${llmRes.status}: ${err}`, session_id: sessionId }, { status: 502, headers: CORS })
  }

  let llmData = await llmRes.json()
  let choice  = llmData.choices?.[0]

  // ── Tool call loop ────────────────────────────────────────────────────
  if (choice?.finish_reason === 'tool_calls' && choice?.message?.tool_calls?.length) {
    const toolMsgs: any[]  = [choice.message]
    let attachmentUrl: string | null = null
    let attachmentReason: string | null = null

    for (const tc of choice.message.tool_calls) {
      let toolOutput = 'Tool executed'
      try {
        const input = JSON.parse(tc.function.arguments)

        // ── Built-in: search_knowledge_base ───────────────────────────
        if (tc.function.name === 'search_knowledge_base') {
          try {
            const snR = await fetch(
              `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/gateway/search-kb`,
              {
                method:  'POST',
                headers: { Authorization: `Basic ${snAuth}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ query: input.query, limit: 3 }),
                signal:  AbortSignal.timeout(15_000),
              }
            )
            const d = await snR.json().catch(() => ({}))
            toolOutput = JSON.stringify(snR.ok ? (d.result ?? d) : { success: false, error: `SN returned ${snR.status}` })
          } catch (e: any) {
            toolOutput = JSON.stringify({ success: false, error: e.message })
          }

        // ── Built-in: request_attachment ──────────────────────────────
        } else if (tc.function.name === 'request_attachment') {
          const uploadToken = signUploadToken({
            tenantId: apiToken.tenantId,
            sessionId,
            agentId:  agentId || '',
          })
          await createPendingUpload({
            token:    uploadToken,
            tenantId: apiToken.tenantId,
            sessionId,
            agentId:  agentId || '',
          })
          const baseUrl     = process.env.NEXTAUTH_URL || 'https://zevox.onrender.com'
          attachmentUrl     = `${baseUrl}/upload/${uploadToken}`
          attachmentReason  = input.reason || 'a file'
          toolOutput = JSON.stringify({ status: 'upload_requested', url: attachmentUrl })

        // ── Built-in: send_email (via ServiceNow) ────────────────────
        } else if (tc.function.name === 'send_email') {
          const recipientEmail = input.to || sess.userEmail
          if (!recipientEmail) {
            toolOutput = JSON.stringify({ success: false, error: 'No recipient email address available. Ask the user for their email.' })
          } else {
            try {
              const snR = await fetch(
                `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/gateway/send-email`,
                {
                  method:  'POST',
                  headers: { Authorization: `Basic ${snAuth}`, 'Content-Type': 'application/json' },
                  body:    JSON.stringify({
                    to:        recipientEmail,
                    subject:   input.subject,
                    body:      input.body,
                    from_name: agentCfg?.agent_identity || 'Service Desk',
                  }),
                  signal: AbortSignal.timeout(15_000),
                }
              )
              const d = await snR.json().catch(() => ({}))
              toolOutput = JSON.stringify(snR.ok ? (d.result ?? d) : { success: false, error: `SN returned ${snR.status}` })
            } catch (e: any) {
              toolOutput = JSON.stringify({ success: false, error: e.message })
            }
          }

        // ── SN tool ───────────────────────────────────────────────────
        } else {
          const snR = await fetch(
            `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/gateway/tool`,
            {
              method:  'POST',
              headers: { Authorization: `Basic ${snAuth}`, 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                session_id: sessionId,
                tool_name:  tc.function.name,
                tool_input: input,
                sn_user_id: snUserId,
              }),
              signal: AbortSignal.timeout(15_000),
            }
          )
          if (snR.ok) { const d = await snR.json(); toolOutput = JSON.stringify(d.result ?? d) }
        }
      } catch (e: any) {
        toolOutput = `Tool error: ${e.message}`
      }
      toolMsgs.push({ role: 'tool', tool_call_id: tc.id, content: toolOutput })
    }

    // If attachment was requested, return immediately with the upload URL
    if (attachmentUrl) {
      const agentMsg = choice.message?.content?.trim() ||
        `Please upload ${attachmentReason || 'a file'} using the link below.`
      sess.history.push({ role: 'assistant', content: agentMsg })
      return NextResponse.json(
        { session_id: sessionId, message: agentMsg, attachment_url: attachmentUrl, attachment_reason: attachmentReason },
        { headers: CORS }
      )
    }

    // Second LLM call with tool results
    const secondRes = await fetch(llmEndpoint, {
      method:  'POST',
      headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...llmBody, messages: [...messages, ...toolMsgs] }),
      signal:  AbortSignal.timeout(30_000),
    })
    if (secondRes.ok) { llmData = await secondRes.json(); choice = llmData.choices?.[0] }
  }

  const reply = (choice?.message?.content || '').trim()
  sess.history.push({ role: 'assistant', content: reply })

  return NextResponse.json({ session_id: sessionId, message: reply }, { headers: CORS })
}
