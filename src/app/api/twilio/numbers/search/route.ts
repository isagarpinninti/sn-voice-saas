export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encrypt'

// GET — search Twilio for available numbers to buy
// ?country=US&areaCode=415&contains=555&limit=10
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, twilioConnection: true },
  })
  if (!tenant?.twilioConnection?.verified)
    return NextResponse.json({ error: 'Twilio not connected' }, { status: 400 })

  const url = new URL(req.url)
  const country  = (url.searchParams.get('country') || 'US').toUpperCase()
  const areaCode = url.searchParams.get('areaCode') || ''
  const contains = url.searchParams.get('contains') || ''
  const limit    = Math.min(20, parseInt(url.searchParams.get('limit') || '10'))

  const { accountSid, authToken } = {
    accountSid: tenant.twilioConnection.accountSid,
    authToken: decrypt(tenant.twilioConnection.authToken),
  }
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const params = new URLSearchParams({ VoiceEnabled: 'true', PageSize: String(limit) })
  if (areaCode) params.set('AreaCode', areaCode)
  if (contains) params.set('Contains', contains)

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json?${params}`,
    { headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: err?.message || `Twilio returned ${res.status}` }, { status: 502 })
  }
  const data = await res.json()

  const numbers = (data.available_phone_numbers || []).map((n: any) => ({
    e164: n.phone_number as string,
    friendly: n.friendly_name as string,
    region: n.region as string,
    isoCountry: n.iso_country as string,
    capabilities: n.capabilities as Record<string, boolean>,
  }))

  return NextResponse.json({ numbers })
}
