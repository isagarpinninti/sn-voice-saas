/**
 * SaaS platform configuration — admin only.
 * GET  /api/admin/config  — fetch current config (or defaults)
 * PUT  /api/admin/config  — upsert config
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'

const DEFAULTS = {
  saasName:     'ZeVox',
  tagline:      'AI Voice Agents for ServiceNow',
  logoUrl:      '',
  faviconUrl:   '',
  primaryColor: '#10b981',
  darkBg:       '#000000',
  supportEmail: 'support@zevox.com',
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cfg = await db.saasConfig.findUnique({ where: { id: 'default' } })
  return NextResponse.json(cfg ?? { id: 'default', ...DEFAULTS })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const data: Record<string, string> = {}

  const allowed = ['saasName', 'tagline', 'logoUrl', 'faviconUrl', 'primaryColor', 'darkBg', 'supportEmail'] as const
  for (const key of allowed) {
    if (typeof body[key] === 'string') data[key] = body[key].trim()
  }

  const cfg = await db.saasConfig.upsert({
    where:  { id: 'default' },
    create: { id: 'default', ...DEFAULTS, ...data },
    update: data,
  })

  return NextResponse.json(cfg)
}
