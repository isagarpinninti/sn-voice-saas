export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const DEFAULTS = {
  llmModel:             'llama-3.3-70b-versatile',
  llmTemperature:       0.4,
  llmMaxTokens:         600,
  sttModel:             'nova-3',
  sttLanguage:          'multi',
  ttsVoice:             'aura-asteria-en',
  agentName:            'AI Voice Agent',
  agentSubtitle:        'Incident Co-Agent • Powered by AI',
  systemPrompt:         null as string | null,
  greetingTemplate:     null as string | null,
  toolUpdateField:      true,
  toolSuggestResolution: true,
  toolSuggestReply:     true,
  toolSearchIncidents:  true,
  toolSearchKb:         true,
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const config = await db.incidentAgentConfig.findUnique({ where: { tenantId: tenant.id } })
  return NextResponse.json({ ...DEFAULTS, ...config })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.llmModel       !== undefined) data.llmModel             = String(body.llmModel)
  if (body.llmTemperature !== undefined) data.llmTemperature        = Math.min(2, Math.max(0, Number(body.llmTemperature)))
  if (body.llmMaxTokens   !== undefined) data.llmMaxTokens          = Math.min(4096, Math.max(100, Math.round(Number(body.llmMaxTokens))))
  if (body.sttModel       !== undefined) data.sttModel              = String(body.sttModel)
  if (body.sttLanguage    !== undefined) data.sttLanguage           = String(body.sttLanguage)
  if (body.ttsVoice       !== undefined) data.ttsVoice              = String(body.ttsVoice)
  if (body.agentName      !== undefined) data.agentName             = String(body.agentName).slice(0, 80)
  if (body.agentSubtitle  !== undefined) data.agentSubtitle         = String(body.agentSubtitle).slice(0, 120)
  if ('systemPrompt'      in body)       data.systemPrompt          = body.systemPrompt ? String(body.systemPrompt) : null
  if ('greetingTemplate'  in body)       data.greetingTemplate      = body.greetingTemplate ? String(body.greetingTemplate) : null
  if (body.toolUpdateField      !== undefined) data.toolUpdateField      = Boolean(body.toolUpdateField)
  if (body.toolSuggestResolution !== undefined) data.toolSuggestResolution = Boolean(body.toolSuggestResolution)
  if (body.toolSuggestReply     !== undefined) data.toolSuggestReply     = Boolean(body.toolSuggestReply)
  if (body.toolSearchIncidents  !== undefined) data.toolSearchIncidents  = Boolean(body.toolSearchIncidents)
  if (body.toolSearchKb         !== undefined) data.toolSearchKb         = Boolean(body.toolSearchKb)

  const config = await db.incidentAgentConfig.upsert({
    where:  { tenantId: tenant.id },
    create: { tenantId: tenant.id, ...data },
    update: data,
  })

  return NextResponse.json({ ...DEFAULTS, ...config })
}
