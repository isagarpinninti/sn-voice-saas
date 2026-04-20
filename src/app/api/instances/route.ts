/**
 * Instances API — list / create ServiceNow instances for the current tenant.
 *
 * GET   /api/instances       — list all instances
 * POST  /api/instances       — create a new instance
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      instances: {
        orderBy: { createdAt: 'asc' },
        include: {
          tokens: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
          _count: { select: { agents: true } },
        },
      },
    },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  return NextResponse.json({
    maxInstances: tenant.max_instances,
    instanceCount: tenant.instances.length,
    instances: tenant.instances.map((i) => ({
      id: i.id,
      name: i.name,
      snInstanceUrl: i.snInstanceUrl,
      snUsername: i.snUsername,
      hasPassword: !!i.snPassword,
      active: i.active,
      agentCount: i._count.agents,
      token: i.tokens[0]?.token ?? null,
      widgetColor: i.widgetColor || '#10b981',
      widgetPosition: i.widgetPosition || 'right',
      widgetVoiceOnly: i.widgetVoiceOnly,
      widgetAutoOpen: i.widgetAutoOpen,
      widgetGreeting: i.widgetGreeting || '',
      widgetAgentName: i.widgetAgentName || '',
      widgetShowBranding: i.widgetShowBranding,
      widgetLogoUrl: i.widgetLogoUrl || '',
      widgetBorderRadius: i.widgetBorderRadius || 'full',
      createdAt: i.createdAt,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: { instances: { where: { active: true } } },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Plan limit check
  if (tenant.max_instances !== -1 && tenant.instances.length >= tenant.max_instances) {
    return NextResponse.json(
      { error: `Your plan allows ${tenant.max_instances} instance${tenant.max_instances === 1 ? '' : 's'}. Upgrade to add more.` },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body?.snInstanceUrl || !body?.snUsername || !body?.snPassword) {
    return NextResponse.json({ error: 'snInstanceUrl, snUsername, snPassword are required' }, { status: 400 })
  }

  const name = (body.name || '').trim() || 'Untitled Instance'

  // Generate embed token for this instance
  const token =
    'sk_live_' +
    Array.from({ length: 32 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
    ).join('')

  const instance = await db.instance.create({
    data: {
      tenantId: tenant.id,
      name,
      snInstanceUrl: body.snInstanceUrl.replace(/\/$/, ''),
      snUsername: body.snUsername,
      snPassword: body.snPassword,
      tokens: {
        create: { tenantId: tenant.id, name: 'Default', token },
      },
    },
    include: { tokens: true },
  })

  return NextResponse.json({
    id: instance.id,
    name: instance.name,
    snInstanceUrl: instance.snInstanceUrl,
    token: instance.tokens[0]?.token,
  })
}
