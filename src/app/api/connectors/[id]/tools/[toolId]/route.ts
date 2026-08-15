export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string; toolId: string }> }

async function loadOwnedTool(userId: string, connectorId: string, toolId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const tool = await db.connectorTool.findFirst({
    where: { id: toolId, connectorId, connector: { tenantId: tenant.id } },
  })
  return tool
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, toolId } = await ctx.params
  const tool = await loadOwnedTool(session.user.id, id, toolId)
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (typeof body.description === 'string' && body.description.trim()) data.description = body.description.trim()
  if (typeof body.timeoutMs === 'number') data.timeoutMs = body.timeoutMs

  await db.connectorTool.update({ where: { id: tool.id }, data })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, toolId } = await ctx.params
  const tool = await loadOwnedTool(session.user.id, id, toolId)
  if (!tool) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.connectorTool.delete({ where: { id: tool.id } })
  return NextResponse.json({ success: true })
}
