export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

const E164_RE = /^\+[1-9]\d{6,14}$/

export async function GET() {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const rows = await db.phoneNumber.findMany({
    include: {
      tenant: { select: { id: true, company: true, plan: true, user: { select: { email: true } } } },
      agent: { select: { id: true, name: true } },
      instance: { select: { id: true, name: true, snInstanceUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ phoneNumbers: rows })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const e164 = typeof body.e164 === 'string' ? body.e164.trim() : ''
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
  const agentId = typeof body.agentId === 'string' && body.agentId ? body.agentId.trim() : null
  const instanceId = typeof body.instanceId === 'string' && body.instanceId ? body.instanceId.trim() : null
  // Accept `providerExternalId` (preferred) and `twilioSid` (legacy) from clients.
  const providerExternalIdRaw =
    (typeof body.providerExternalId === 'string' && body.providerExternalId) ||
    (typeof body.twilioSid === 'string' && body.twilioSid) ||
    ''
  const providerExternalId = providerExternalIdRaw ? providerExternalIdRaw.trim() : null
  const provider = 'TWILIO'
  const friendly = typeof body.friendly === 'string' && body.friendly ? body.friendly.trim() : null

  if (!E164_RE.test(e164)) {
    return NextResponse.json({ error: 'e164 must be in E.164 format, e.g. +14155550123' }, { status: 400 })
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 })
  }

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

  // Default instance = tenant's first active one, unless caller supplied
  const boundInstanceId = instanceId || tenant.instances[0]?.id || null
  if (!boundInstanceId) {
    return NextResponse.json({ error: 'Tenant has no active ServiceNow instance' }, { status: 400 })
  }

  if (agentId) {
    const agent = await db.agent.findFirst({ where: { id: agentId, tenantId } })
    if (!agent) return NextResponse.json({ error: 'Agent not found or not owned by tenant' }, { status: 400 })
  }

  try {
    const created = await db.phoneNumber.create({
      data: { e164, friendly, provider, providerExternalId, tenantId, agentId, instanceId: boundInstanceId, active: true },
      include: { tenant: { select: { company: true, user: { select: { email: true } } } }, agent: true, instance: true },
    })

    await logAudit({
      tenantId,
      actorId: session?.user?.id,
      actorType: 'admin',
      action: 'phone.number.created',
      targetType: 'PhoneNumber',
      targetId: created.id,
      metadata: { e164, agentId, instanceId: boundInstanceId, provider, providerExternalId },
    })

    return NextResponse.json({ phoneNumber: created })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: `${e164} is already registered` }, { status: 409 })
    }
    return NextResponse.json({ error: err?.message || 'Create failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const existing = await db.phoneNumber.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.phoneNumber.delete({ where: { id } })
  await logAudit({
    tenantId: existing.tenantId,
    actorId: session?.user?.id,
    actorType: 'admin',
    action: 'phone.number.deleted',
    targetType: 'PhoneNumber',
    targetId: id,
    metadata: { e164: existing.e164 },
  })
  return NextResponse.json({ ok: true })
}
