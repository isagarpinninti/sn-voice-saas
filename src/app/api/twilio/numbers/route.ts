export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encrypt'

// GET — list numbers already owned in the tenant's Twilio account
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, twilioConnection: true },
  })
  if (!tenant?.twilioConnection?.verified)
    return NextResponse.json({ error: 'Twilio not connected' }, { status: 400 })

  const { accountSid, authToken } = {
    accountSid: tenant.twilioConnection.accountSid,
    authToken: decrypt(tenant.twilioConnection.authToken),
  }
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json?PageSize=50`,
    { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) return NextResponse.json({ error: `Twilio returned ${res.status}` }, { status: 502 })
  const data = await res.json()

  // Also fetch which numbers are already imported into our DB
  const imported = await db.phoneNumber.findMany({
    where: { tenantId: tenant.id },
    select: { e164: true, providerExternalId: true },
  })
  const importedSids = new Set(imported.map(n => n.providerExternalId).filter(Boolean))
  const importedE164 = new Set(imported.map(n => n.e164))

  const numbers = (data.incoming_phone_numbers || []).map((n: any) => ({
    sid: n.sid as string,
    e164: n.phone_number as string,
    friendly: n.friendly_name as string,
    capabilities: n.capabilities as Record<string, boolean>,
    voiceUrl: n.voice_url as string | null,
    imported: importedSids.has(n.sid) || importedE164.has(n.phone_number),
  }))

  return NextResponse.json({ numbers })
}
