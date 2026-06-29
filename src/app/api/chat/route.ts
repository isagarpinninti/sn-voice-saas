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
  const identity     = cfg?.agent_identity     ? `You are ${cfg.agent_identity}.\n\n` : ''
  const instructions = cfg?.agent_instructions ? cfg.agent_instructions + '\n\n' : ''
  const guardrails   = cfg?.guardrails?.length
    ? cfg.guardrails.map((g: any) => `- ${g.description}`).filter(Boolean).join('\n') + '\n\n'
    : ''

  return (identity + instructions + guardrails +
    'FILE UPLOAD RULE: NEVER call request_attachment unless the user explicitly says they have a file, screenshot, or document to share.\n\n' +
    'You are responding via text chat. Be concise and actionable.').trim()
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

  // ── Fetch agent config via /gateway/init (same as voice pipeline) ────────
  let agentCfg: any = null
  try {
    const initBody: any = {}
    if (agentId) initBody.agent_id = agentId
    if (snUserId) initBody.caller_user_id = snUserId
    const r = await fetch(
      `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/gateway/init`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${snAuth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(initBody),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (r.ok) { const d = await r.json(); agentCfg = d.result ?? d }
  } catch { /* fall back to base prompt */ }

  // /gateway/init returns llm_config, system_prompt, tools — same shape as voice pipeline
  const llmCfg      = agentCfg?.llm_config || {}
  let llmEndpoint   = llmCfg.base_url || 'https://api.groq.com/openai/v1'
  llmEndpoint       = llmEndpoint.replace(/\/chat\/completions\/?$/, '') + '/chat/completions'
  const llmKey      = llmCfg.api_key || ''
  const llmModel    = llmCfg.model   || 'llama-3.3-70b-versatile'
  const systemPrompt = agentCfg?.system_prompt
    ? agentCfg.system_prompt + '\n\nYou are responding via text chat. Be concise and actionable.'
    : buildSystemPrompt(agentCfg)

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
  ]

  // ── SN-defined tools (/gateway/init returns {name, description, input_schema}) ──
  const activeSnTools = (agentCfg?.tools ?? []).filter((t: any) => t.active !== false)
  const snLlmTools = activeSnTools.map((t: any) => {
    if (t?.function) return t  // already wrapped
    return {
      type: 'function',
      function: {
        name:        t.name,
        description: t.description || t.name,
        parameters:  t.input_schema ?? { type: 'object', properties: {} },
      },
    }
  })

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

        // ── Built-in: request_attachment (SaaS-side — mints a signed upload URL) ──
        if (tc.function.name === 'request_attachment') {
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

        // ── SN tool — forward everything else to gateway/tool ─────────
        } else {
          const enrichedInput = { ...input, __caller_id: snUserId || '' }
          const snR = await fetch(
            `${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/gateway/tool`,
            {
              method:  'POST',
              headers: { Authorization: `Basic ${snAuth}`, 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                session_id:    sessionId,
                agent_id:      agentId || (agentCfg?.selected_agent_id ?? ''),
                tool_name:     tc.function.name,
                tool_input:    enrichedInput,
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
