export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

async function getTenantId(userId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId }, select: { id: true } })
  return tenant?.id ?? null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = await getTenantId(session.user.id)
  const { id } = await params

  const agent = await db.manageEngineAgent.findFirst({ where: { id, tenantId: tenantId! } })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Never return raw API key to the client — mask it
  return NextResponse.json({ ...agent, apiKey: agent.apiKey ? '••••••••' + agent.apiKey.slice(-4) : '', llmApiKey: agent.llmApiKey ? '••••' + agent.llmApiKey.slice(-4) : '' })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = await getTenantId(session.user.id)
  const { id } = await params

  const existing = await db.manageEngineAgent.findFirst({ where: { id, tenantId: tenantId! } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const allowed: any = {}
  const fields = ['name', 'active', 'meUrl', 'apiKey', 'llmProvider', 'llmApiKey', 'llmModel', 'llmBaseUrl', 'ttsVoice', 'sttLanguage', 'greeting', 'identity', 'instructions']
  for (const f of fields) {
    if (body[f] !== undefined) {
      // Don't overwrite masked values
      if ((f === 'apiKey' || f === 'llmApiKey') && String(body[f]).startsWith('••••')) continue
      allowed[f] = body[f]
    }
  }

  const updated = await db.manageEngineAgent.update({ where: { id }, data: allowed })
  return NextResponse.json({ ...updated, apiKey: updated.apiKey ? '••••' + updated.apiKey.slice(-4) : '', llmApiKey: updated.llmApiKey ? '••••' + updated.llmApiKey.slice(-4) : '' })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = await getTenantId(session.user.id)
  const { id } = await params

  const existing = await db.manageEngineAgent.findFirst({ where: { id, tenantId: tenantId! } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.manageEngineAgent.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
