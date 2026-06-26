/**
 * Text chat endpoint — used by the widget in chat_only / both mode.
 *
 * POST /api/chat
 * Body: { token, agent, message, session_id?, sn_user_id? }
 * Response: { session_id, message }
 *
 * Fetches agent config from SN at runtime, calls the LLM, handles
 * tool calls via the SN gateway tool endpoint, returns text response.
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
  history:      { role: 'user' | 'assistant'; content: string }[]
  instanceId:   string
  tenantId:     string
  snInstanceUrl: string
  snAuth:       string
  agentSnToken: string
  createdAt:    number
}
const sessions = new Map<string, ChatSession>()

function gcSessions() {
  const cut = Date.now() - 30 * 60 * 1000
  for (const [id, s] of sessions) if (s.createdAt < cut) sessions.delete(id)
}

// ── Helpers ───────────────────────────────────────────────────────────────
function buildSystemPrompt(cfg: any): string {
  const parts: string[] = []
  if (cfg?.agent_identity)    parts.push(cfg.agent_identity)
  if (cfg?.agent_instructions) parts.push('\n' + cfg.agent_instructions)
  if (cfg?.guardrails?.length) {
    parts.push('\n## Rules')
    cfg.guardrails.forEach((g: any) => { if (g.description) parts.push('- ' + g.description) })
  }
  parts.push('\nYou are responding via text chat. Be concise and helpful. Do not use excessive markdown.')
  return parts.join('\n') || 'You are a helpful ServiceNow assistant.'
}

// ── Route handlers ─────────────────────────────────────────────────────────
export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  gcSessions()

  const body = await req.json().catch(() => null)
  const token       = (body?.token   || '').trim()
  const agentId     = (body?.agent   || '').trim() // SaaS Agent.id = SN saas_token
  const userMsg     = (body?.message || '').trim()
  const snUserId    = (body?.sn_user_id || '').trim()
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
      history:      [],
      instanceId:   instance.id,
      tenantId:     apiToken.tenantId,
      snInstanceUrl: instance.snInstanceUrl,
      snAuth,
      agentSnToken: agentId,
      createdAt:    Date.now(),
    }
    sessions.set(sessionId, sess)
  }

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
    } catch { /* fall back to minimal config */ }
  }

  const llmEndpoint = agentCfg?.llm?.api_endpoint || 'https://api.groq.com/openai/v1/chat/completions'
  const llmKey      = agentCfg?.llm?.api_key      || ''
  const llmModel    = agentCfg?.llm?.model_name   || 'llama-3.3-70b-versatile'
  const systemPrompt = buildSystemPrompt(agentCfg)

  // ── Build LLM tools list ──────────────────────────────────────────────
  const activeTools = (agentCfg?.tools ?? []).filter((t: any) => t.active !== false)
  const llmTools = [
    // Built-in: request a file attachment from the user
    {
      type: 'function',
      function: {
        name: 'request_attachment',
        description: 'Ask the user to upload a file (image, PDF, document, spreadsheet). Use this when the conversation requires the user to provide supporting documentation.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Brief description of what file is needed and why' },
          },
          required: ['reason'],
        },
      },
    },
    ...activeTools.map((t: any) => ({
      type: 'function',
      function: {
        name:        t.name,
        description: t.description || t.name,
        parameters:  t.input_schema ?? { type: 'object', properties: {} },
      },
    })),
  ]

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
    temperature: agentCfg?.llm?.temperature ?? 0.7,
    max_tokens:  agentCfg?.llm?.max_tokens  ?? 1024,
  }
  if (llmTools.length) { llmBody.tools = llmTools; llmBody.tool_choice = 'auto' }

  let llmRes = await fetch(llmEndpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(llmBody),
    signal: AbortSignal.timeout(30_000),
  })
  if (!llmRes.ok) {
    const err = await llmRes.text()
    return NextResponse.json({ error: `LLM error ${llmRes.status}: ${err}`, session_id: sessionId }, { status: 502, headers: CORS })
  }

  let llmData = await llmRes.json()
  let choice = llmData.choices?.[0]

  // ── Tool call loop ────────────────────────────────────────────────────
  if (choice?.finish_reason === 'tool_calls' && choice?.message?.tool_calls?.length) {
    const toolMsgs: any[] = [choice.message]
    let attachmentUrl: string | null = null
    let attachmentReason: string | null = null

    for (const tc of choice.message.tool_calls) {
      let toolOutput = 'Tool executed'
      try {
        const input = JSON.parse(tc.function.arguments)

        // Built-in: request_attachment — generate signed upload URL
        if (tc.function.name === 'request_attachment') {
          const uploadToken = signUploadToken({
            tenantId:  apiToken.tenantId,
            sessionId,
            agentId:   agentId || '',
          })
          await createPendingUpload({
            token:      uploadToken,
            tenantId:   apiToken.tenantId,
            sessionId,
            agentId:    agentId || '',
          })
          const baseUrl = process.env.NEXTAUTH_URL || 'https://zevox.onrender.com'
          attachmentUrl    = `${baseUrl}/upload/${uploadToken}`
          attachmentReason = input.reason || 'a file'
          toolOutput = JSON.stringify({ status: 'upload_requested', url: attachmentUrl })
        } else {
          const snR = await fetch(
            `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/gateway/tool`,
            {
              method: 'POST',
              headers: { Authorization: `Basic ${snAuth}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                session_id:  sessionId,
                tool_name:   tc.function.name,
                tool_input:  input,
                sn_user_id:  snUserId,
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
    // (no second LLM call needed — the LLM's message already explains what's needed)
    if (attachmentUrl) {
      const agentMsg = choice.message?.content?.trim() || `Please upload ${attachmentReason || 'a file'} using the link below.`
      sess.history.push({ role: 'assistant', content: agentMsg })
      return NextResponse.json(
        { session_id: sessionId, message: agentMsg, attachment_url: attachmentUrl, attachment_reason: attachmentReason },
        { headers: CORS }
      )
    }

    // Second LLM call with tool results
    const secondRes = await fetch(llmEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...llmBody, messages: [...messages, ...toolMsgs] }),
      signal: AbortSignal.timeout(30_000),
    })
    if (secondRes.ok) { llmData = await secondRes.json(); choice = llmData.choices?.[0] }
  }

  const reply = (choice?.message?.content || '').trim()
  sess.history.push({ role: 'assistant', content: reply })

  return NextResponse.json({ session_id: sessionId, message: reply }, { headers: CORS })
}
