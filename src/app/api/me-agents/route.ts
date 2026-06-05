export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

async function getTenantId(userId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId }, select: { id: true } })
  return tenant?.id ?? null
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = await getTenantId(session.user.id)
  if (!tenantId) return NextResponse.json({ agents: [] })

  const agents = await db.manageEngineAgent.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, active: true, meUrl: true, llmModel: true, ttsVoice: true, token: true, createdAt: true },
  })
  return NextResponse.json({ agents })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenantId = await getTenantId(session.user.id)
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await req.json()
  const { name, meUrl, apiKey } = body
  if (!name?.trim() || !meUrl?.trim() || !apiKey?.trim()) {
    return NextResponse.json({ error: 'name, meUrl, and apiKey are required' }, { status: 400 })
  }

  const agent = await db.manageEngineAgent.create({
    data: { tenantId, name: name.trim(), meUrl: meUrl.trim(), apiKey: apiKey.trim() },
  })
  return NextResponse.json(agent, { status: 201 })
}
