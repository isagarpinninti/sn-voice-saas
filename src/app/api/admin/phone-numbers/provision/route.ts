export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { addLog } from '@/lib/log-store'
import { getTelephonyProvider, type TelephonyProviderName } from '@/lib/telephony'
import { ProvisioningNotSupportedError } from '@/lib/telephony/types'

// POST body:
//   provider: 'telnyx' (required; 'twilio' not yet supported)
//   country: 'US' (ISO-2)
//   areaCode?: string
//   contains?: string
//   tenantId: string (required)
//   agentId?: string
//   instanceId?: string
//   friendly?: string
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const providerName: TelephonyProviderName = 'twilio'
  const country = String(body.country || 'US').toUpperCase()
  const areaCode = body.areaCode ? String(body.areaCode).trim() : undefined
  const contains = body.contains ? String(body.contains).trim() : undefined
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
  const agentId = typeof body.agentId === 'string' && body.agentId ? body.agentId.trim() : null
  const instanceId = typeof body.instanceId === 'string' && body.instanceId ? body.instanceId.trim() : null
  const friendly = typeof body.friendly === 'string' && body.friendly ? body.friendly.trim() : null

  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 })

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: { instances: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } } },
  })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  if (tenant.plan !== 'PREMIUM' && tenant.plan !== 'PRO_VOICE' && tenant.plan !== 'ENTERPRISE') {
    return NextResponse.json(
      { error: `Tenant is on ${tenant.plan}. Phone numbers require the Premium plan.` },
      { status: 400 },
    )
  }
  const boundInstanceId = instanceId || tenant.instances[0]?.id || null
  if (!boundInstanceId) {
    return NextResponse.json({ error: 'Tenant has no active ServiceNow instance' }, { status: 400 })
  }
  if (agentId) {
    const agent = await db.agent.findFirst({ where: { id: agentId, tenantId } })
    if (!agent) return NextResponse.json({ error: 'Agent not found or not owned by tenant' }, { status: 400 })
  }

  const provider = getTelephonyProvider(providerName)

  // Step 1: search
  let candidates
  try {
    candidates = await provider.searchAvailableNumbers({ country, areaCode, contains, features: ['voice'], limit: 5 })
  } catch (err: any) {
    if (err instanceof ProvisioningNotSupportedError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    addLog('error', 'phone-provision', 'search failed: ' + err.message)
    return NextResponse.json({ error: 'Search failed: ' + err.message }, { status: 502 })
  }
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: `No ${country} numbers match that criteria on ${provider.name}` },
      { status: 404 },
    )
  }
  const picked = candidates[0]

  // Step 2: purchase
  let purchased
  try {
    purchased = await provider.purchaseNumber(picked.e164)
  } catch (err: any) {
    addLog('error', 'phone-provision', `purchase ${picked.e164} failed: ${err.message}`)
    return NextResponse.json({ error: 'Purchase failed: ' + err.message }, { status: 502 })
  }

  // Step 3: bind to TeXML app (rollback: release number on failure)
  try {
    await provider.bindNumberToApp(purchased.providerNumberId)
  } catch (err: any) {
    addLog('error', 'phone-provision', `bind ${purchased.e164} failed, releasing: ${err.message}`)
    await provider.releaseNumber(purchased.providerNumberId).catch((e: any) =>
      addLog('error', 'phone-provision', `release after bind-fail ALSO failed for ${purchased.e164} (${purchased.providerNumberId}) — MANUAL CLEANUP REQUIRED: ${e.message}`),
    )
    return NextResponse.json({ error: 'Bind failed (number released): ' + err.message }, { status: 502 })
  }

  // Step 4: DB insert (rollback: release number on failure)
  try {
    const created = await db.phoneNumber.create({
      data: {
        e164: purchased.e164,
        friendly,
        provider: provider.name.toUpperCase(),
        providerExternalId: purchased.providerNumberId,
        tenantId,
        agentId,
        instanceId: boundInstanceId,
        active: true,
      },
      include: {
        tenant: { select: { company: true, user: { select: { email: true } } } },
        agent: true,
        instance: true,
      },
    })

    await logAudit({
      tenantId,
      actorId: session?.user?.id,
      actorType: 'admin',
      action: 'phone.number.provisioned',
      targetType: 'PhoneNumber',
      targetId: created.id,
      metadata: {
        e164: purchased.e164,
        provider: provider.name,
        providerExternalId: purchased.providerNumberId,
        agentId,
        instanceId: boundInstanceId,
        searchCriteria: { country, areaCode, contains },
      },
    })

    addLog('info', 'phone-provision', `Provisioned ${purchased.e164} via ${provider.name} for tenant ${tenantId}`)
    return NextResponse.json({ phoneNumber: created, picked })
  } catch (err: any) {
    addLog('error', 'phone-provision', `DB insert for ${purchased.e164} failed, releasing: ${err.message}`)
    await provider.releaseNumber(purchased.providerNumberId).catch((e: any) =>
      addLog('error', 'phone-provision', `release after DB-fail ALSO failed for ${purchased.e164} — MANUAL CLEANUP REQUIRED: ${e.message}`),
    )
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: `${purchased.e164} already registered (race condition; number released)` }, { status: 409 })
    }
    return NextResponse.json({ error: 'DB insert failed (number released): ' + err.message }, { status: 500 })
  }
}
