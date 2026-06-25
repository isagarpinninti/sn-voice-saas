/**
 * Per-agent widget customization.
 * GET  /api/agents/[id]/widget  — fetch widget config for this agent
 * PUT  /api/agents/[id]/widget  — save widget config for this agent
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

const WIDGET_FIELDS = [
  'widgetMode', 'widgetColor', 'widgetPosition', 'widgetAutoOpen',
  'widgetGreeting', 'widgetTitle', 'widgetShowBranding', 'widgetLogoUrl',
  'widgetBorderRadius',
] as const

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const agent = await db.agent.findFirst({ where: { id, tenantId: tenant.id } })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  return NextResponse.json({
    widgetMode:         agent.widgetMode         ?? 'voice_only',
    widgetColor:        agent.widgetColor        ?? '#10b981',
    widgetPosition:     agent.widgetPosition     ?? 'right',
    widgetAutoOpen:     agent.widgetAutoOpen      ?? false,
    widgetGreeting:     agent.widgetGreeting     ?? '',
    widgetTitle:        agent.widgetTitle        ?? '',
    widgetShowBranding: agent.widgetShowBranding ?? true,
    widgetLogoUrl:      agent.widgetLogoUrl      ?? '',
    widgetBorderRadius: agent.widgetBorderRadius ?? 'full',
  })
}

export async function PUT(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const agent = await db.agent.findFirst({ where: { id, tenantId: tenant.id } })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  for (const field of WIDGET_FIELDS) {
    if (body[field] !== undefined) data[field] = body[field]
  }

  const updated = await db.agent.update({ where: { id: agent.id }, data })

  return NextResponse.json({ success: true, widgetMode: updated.widgetMode })
}
