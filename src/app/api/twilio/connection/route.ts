export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encrypt'
import { PHONE_ELIGIBLE_PLANS } from '@/lib/plans'

async function getTenant(userId: string) {
  return db.tenant.findUnique({
    where: { userId },
    select: { id: true, plan: true, twilioConnection: true },
  })
}

async function verifyTwilioCredentials(accountSid: string, authToken: string) {
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
    { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message || `Twilio returned ${res.status}`)
  }
  const data = await res.json()
  return { accountName: data.friendly_name as string | undefined }
}

// GET — return connection status (never expose raw token)
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenant = await getTenant(session.user.id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const conn = tenant.twilioConnection
  return NextResponse.json({
    connected: !!conn?.verified,
    accountSid: conn?.accountSid || null,
    accountName: conn?.accountName || null,
    planEligible: PHONE_ELIGIBLE_PLANS.has(tenant.plan),
  })
}

// POST — save and verify Twilio credentials
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenant = await getTenant(session.user.id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!PHONE_ELIGIBLE_PLANS.has(tenant.plan))
    return NextResponse.json({ error: 'Phone numbers require a Premium plan' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const accountSid = String(body.accountSid || '').trim()
  const authToken  = String(body.authToken  || '').trim()

  if (!accountSid.startsWith('AC') || accountSid.length < 10)
    return NextResponse.json({ error: 'Invalid Account SID — must start with AC' }, { status: 400 })
  if (!authToken || authToken.length < 16)
    return NextResponse.json({ error: 'Auth Token is too short' }, { status: 400 })

  let accountName: string | undefined
  try {
    ;({ accountName } = await verifyTwilioCredentials(accountSid, authToken))
  } catch (e: any) {
    return NextResponse.json({ error: `Twilio verification failed: ${e.message}` }, { status: 400 })
  }

  const encryptedToken = encrypt(authToken)
  await db.twilioConnection.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, accountSid, authToken: encryptedToken, accountName, verified: true },
    update: { accountSid, authToken: encryptedToken, accountName, verified: true },
  })

  return NextResponse.json({ connected: true, accountSid, accountName })
}

// DELETE — disconnect
export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenant = await getTenant(session.user.id)
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.twilioConnection.deleteMany({ where: { tenantId: tenant.id } })
  return NextResponse.json({ connected: false })
}

// Helper: get decrypted credentials for a tenant (used by other routes)
export async function getTwilioCreds(tenantId: string) {
  const conn = await db.twilioConnection.findUnique({ where: { tenantId } })
  if (!conn?.verified) return null
  return { accountSid: conn.accountSid, authToken: decrypt(conn.authToken) }
}
