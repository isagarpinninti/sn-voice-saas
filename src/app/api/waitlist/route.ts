export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const feature = typeof body?.feature === 'string' && body.feature.length > 0 ? body.feature : 'phone_calls'
  const source = typeof body?.source === 'string' ? body.source.slice(0, 120) : null

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 })
  }

  await db.waitlist.upsert({
    where: { email_feature: { email, feature } },
    update: { source: source ?? undefined },
    create: { email, feature, source },
  })

  return NextResponse.json({ ok: true })
}
