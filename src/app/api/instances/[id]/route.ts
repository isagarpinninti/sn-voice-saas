/**
 * Single instance API.
 *
 * GET    /api/instances/[id] — fetch one instance
 * PATCH  /api/instances/[id] — update name, credentials, widget config
 * DELETE /api/instances/[id] — hard-delete instance + its tokens
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { encryptInstancePassword } from '@/lib/instance-credentials'

type RouteContext = { params: Promise<{ id: string }> }

async function loadOwnedInstance(userId: string, instanceId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const instance = await db.instance.findFirst({
    where: { id: instanceId, tenantId: tenant.id },
  })
  return instance ? { tenant, instance } : null
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedInstance(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const i = owned.instance
  return NextResponse.json({
    id: i.id,
    name: i.name,
    snInstanceUrl: i.snInstanceUrl,
    snUsername: i.snUsername,
    hasPassword: !!i.snPassword,
    active: i.active,
    widgetColor: i.widgetColor,
    widgetPosition: i.widgetPosition,
    widgetVoiceOnly: i.widgetVoiceOnly,
    widgetAutoOpen: i.widgetAutoOpen,
    widgetGreeting: i.widgetGreeting,
    widgetAgentName: i.widgetAgentName,
    widgetShowBranding: i.widgetShowBranding,
    widgetLogoUrl: i.widgetLogoUrl,
    widgetBorderRadius: i.widgetBorderRadius,
  })
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedInstance(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string') data.name = body.name.trim() || 'Untitled Instance'
  if (typeof body.snInstanceUrl === 'string') data.snInstanceUrl = body.snInstanceUrl.replace(/\/$/, '')
  if (typeof body.snUsername === 'string') data.snUsername = body.snUsername
  if (body.snPassword && body.snPassword !== '••••••••') Object.assign(data, encryptInstancePassword(body.snPassword))
  if (typeof body.active === 'boolean') data.active = body.active

  // Widget fields
  if (body.widgetColor !== undefined) data.widgetColor = body.widgetColor || '#10b981'
  if (body.widgetPosition !== undefined) data.widgetPosition = body.widgetPosition || 'right'
  if (body.widgetVoiceOnly !== undefined) data.widgetVoiceOnly = !!body.widgetVoiceOnly
  if (body.widgetAutoOpen !== undefined) data.widgetAutoOpen = !!body.widgetAutoOpen
  if (body.widgetGreeting !== undefined) data.widgetGreeting = body.widgetGreeting || null
  if (body.widgetAgentName !== undefined) data.widgetAgentName = body.widgetAgentName || null
  if (body.widgetShowBranding !== undefined) data.widgetShowBranding = !!body.widgetShowBranding
  if (body.widgetLogoUrl !== undefined) data.widgetLogoUrl = body.widgetLogoUrl || null
  if (body.widgetBorderRadius !== undefined) data.widgetBorderRadius = body.widgetBorderRadius || 'full'

  await db.instance.update({ where: { id: owned.instance.id }, data })

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedInstance(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Hard delete — cascades to ApiTokens and unlinks Agents (SetNull)
  await db.instance.delete({ where: { id: owned.instance.id } })

  return NextResponse.json({ success: true })
}
