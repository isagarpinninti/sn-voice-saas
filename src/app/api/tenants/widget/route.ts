/**
 * Widget config is now per-Instance, not per-Tenant.
 * This route redirects to /api/instances for backwards compatibility.
 * New code should use instance-level widget endpoints directly.
 */
export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET — Load widget config from first instance (backwards compat)
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const instance = await db.instance.findFirst({
    where: { tenantId: tenant.id, active: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!instance) {
    return NextResponse.json({
      widgetColor: '#10b981',
      widgetPosition: 'right',
      widgetVoiceOnly: false,
      widgetAutoOpen: false,
      widgetGreeting: '',
      widgetAgentName: '',
      widgetShowBranding: true,
      widgetLogoUrl: '',
      widgetBorderRadius: 'full',
    })
  }

  return NextResponse.json({
    instanceId: instance.id,
    widgetColor: instance.widgetColor || '#10b981',
    widgetPosition: instance.widgetPosition || 'right',
    widgetVoiceOnly: instance.widgetVoiceOnly,
    widgetAutoOpen: instance.widgetAutoOpen,
    widgetGreeting: instance.widgetGreeting || '',
    widgetAgentName: instance.widgetAgentName || '',
    widgetShowBranding: instance.widgetShowBranding,
    widgetLogoUrl: instance.widgetLogoUrl || '',
    widgetBorderRadius: instance.widgetBorderRadius || 'full',
  })
}

// PUT — Save widget config to a specific instance
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await req.json()
  const instanceId = body.instanceId

  // Find the target instance
  const instance = instanceId
    ? await db.instance.findFirst({ where: { id: instanceId, tenantId: tenant.id } })
    : await db.instance.findFirst({ where: { tenantId: tenant.id, active: true }, orderBy: { createdAt: 'asc' } })

  if (!instance) return NextResponse.json({ error: 'No instance found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.widgetColor !== undefined) data.widgetColor = body.widgetColor || '#10b981'
  if (body.widgetPosition !== undefined) data.widgetPosition = body.widgetPosition || 'right'
  if (body.widgetVoiceOnly !== undefined) data.widgetVoiceOnly = !!body.widgetVoiceOnly
  if (body.widgetAutoOpen !== undefined) data.widgetAutoOpen = !!body.widgetAutoOpen
  if (body.widgetGreeting !== undefined) data.widgetGreeting = body.widgetGreeting || null
  if (body.widgetAgentName !== undefined) data.widgetAgentName = body.widgetAgentName || null
  if (body.widgetShowBranding !== undefined) data.widgetShowBranding = !!body.widgetShowBranding
  if (body.widgetLogoUrl !== undefined) data.widgetLogoUrl = body.widgetLogoUrl || null
  if (body.widgetBorderRadius !== undefined) data.widgetBorderRadius = body.widgetBorderRadius || 'full'

  await db.instance.update({ where: { id: instance.id }, data })

  return NextResponse.json({ success: true })
}
