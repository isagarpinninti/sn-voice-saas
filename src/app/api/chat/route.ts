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
import { instanceBasicAuthValue } from '@/lib/instance-credentials'

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-cache',
}

const SESSION_TTL_MS = 30 * 60 * 1000  // 30 minutes

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

  const snAuth = instanceBasicAuthValue(instance)

  // ── Get or create session (DB-backed, survives deploys) ───────────────
  const now = new Date()
  let dbSess = await db.chatSession.findUnique({ where: { sessionId } })

  // Expired sessions are treated as new
  if (dbSess && dbSess.expiresAt < now) {
    await db.chatSession.delete({ where: { sessionId } }).catch(() => {})
    dbSess = null
  }

  let llmEndpoint: string
  let llmKey: string
  let llmModel: string
  let systemPrompt: string
  let cachedTools: any[]
  let history: { role: 'user' | 'assistant'; content: string }[]

  if (!dbSess) {
    // First message — fetch agent config from SN gateway/init once
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
    } catch { /* fall back to defaults */ }

    const llmCfg = agentCfg?.llm_config || {}
    let ep = llmCfg.base_url || 'https://api.groq.com/openai/v1'
    ep = ep.replace(/\/chat\/completions\/?$/, '') + '/chat/completions'
    const rawTools: any[] = agentCfg?.tools || []
    const wrappedTools = rawTools.map((t: any) => {
      if (t?.function) return t
      return { type: 'function', function: { name: t.name, description: t.description || t.name, parameters: t.input_schema ?? { type: 'object', properties: {} } } }
    })

    llmEndpoint  = ep
    llmKey       = llmCfg.api_key || process.env.GROQ_API_KEY || ''
    llmModel     = llmCfg.model   || 'llama-3.3-70b-versatile'
    systemPrompt = agentCfg?.system_prompt
      ? agentCfg.system_prompt + '\n\nYou are responding via text chat. Be concise and actionable.'
      : buildSystemPrompt(agentCfg)
    cachedTools  = wrappedTools
    history      = []

    dbSess = await db.chatSession.create({
      data: {
        sessionId,
        tenantId:     apiToken.tenantId,
        instanceId:   instance.id,
        agentId:      agentId || '',
        snUserId:     snUserId || '',
        history:      [],
        llmEndpoint,
        llmKey,
        llmModel,
        systemPrompt,
        tools:        wrappedTools,
        expiresAt:    new Date(Date.now() + SESSION_TTL_MS),
      },
    })
  } else {
    // Existing session — use cached config
    llmEndpoint  = dbSess.llmEndpoint
    llmKey       = dbSess.llmKey
    llmModel     = dbSess.llmModel
    systemPrompt = dbSess.systemPrompt
    cachedTools  = dbSess.tools as any[]
    history      = dbSess.history as { role: 'user' | 'assistant'; content: string }[]
    // Slide expiry on activity
    await db.chatSession.update({
      where: { sessionId },
      data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    })
  }

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

  const llmTools = [...builtInTools, ...(cachedTools || [])]

  // ── Append user message ───────────────────────────────────────────────
  history.push({ role: 'user', content: userMsg })

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20),
  ]

  // ── Guard: no LLM key ────────────────────────────────────────────────
  if (!llmKey) {
    return NextResponse.json(
      { error: 'Chat is not configured — no LLM API key. Check your ServiceNow connection and agent settings.', session_id: sessionId },
      { status: 503, headers: CORS }
    )
  }

  // ── First LLM call ────────────────────────────────────────────────────
  const llmBody: any = {
    model:       llmModel,
    messages,
    temperature: 0.3,
    max_tokens:  1024,
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
    console.error('[chat] LLM error', llmRes.status, err.substring(0, 300))
    return NextResponse.json({ error: 'Failed to process your message. Please try again.', session_id: sessionId }, { status: 502, headers: CORS })
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
                agent_id:      agentId || (dbSess?.agentId ?? ''),
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
      history.push({ role: 'assistant', content: agentMsg })
      await db.chatSession.update({ where: { sessionId }, data: { history } }).catch(() => {})
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

  const reply = (choice?.message?.content || '').trim() || 'I was unable to generate a response. Please try again.'
  history.push({ role: 'assistant', content: reply })
  await db.chatSession.update({ where: { sessionId }, data: { history } }).catch(() => {})

  return NextResponse.json({ session_id: sessionId, message: reply }, { headers: CORS })
}
