/**
 * Sync agent caller group from ServiceNow.
 *
 * POST /api/agents/[id]/sync-group
 *
 * Fetches all active members of the agent's callerGroupSysId from SN,
 * then upserts them as AllowedCaller rows scoped to this agent's phone number.
 * Existing callers not in the SN group are deactivated (not deleted).
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const agent = await db.agent.findFirst({
    where: { id, tenantId: tenant.id },
    include: {
      phoneNumbers: { where: { active: true }, take: 1 },
      instance: true,
    },
  })
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!agent.callerGroupSysId) {
    return NextResponse.json({ error: 'No caller group configured on this agent' }, { status: 400 })
  }

  const phone = agent.phoneNumbers[0]
  if (!phone) {
    return NextResponse.json({ error: 'Agent has no phone number assigned' }, { status: 400 })
  }

  // Fall back to tenant primary instance if agent has no direct instance
  let instance = agent.instance
  if (!instance) {
    instance = await db.instance.findFirst({
      where: { tenantId: tenant.id, active: true },
      orderBy: { createdAt: 'asc' },
    })
  }
  if (!instance?.snInstanceUrl) {
    return NextResponse.json({ error: 'No ServiceNow instance configured' }, { status: 400 })
  }

  const auth64 = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')

  // Fetch group members from SN (dot-walk to get user mobile_phone, phone, name, sys_id)
  const qs = new URLSearchParams({
    sysparm_query: `group=${agent.callerGroupSysId}^active=true`,
    sysparm_fields: 'user.sys_id,user.name,user.mobile_phone,user.phone',
    sysparm_limit: '500',
    sysparm_display_value: 'false',
  })
  let members: any[] = []
  try {
    const snRes = await fetch(
      `${instance.snInstanceUrl}/api/now/table/sys_user_grmember?${qs}`,
      {
        headers: {
          Authorization: `Basic ${auth64}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      },
    )
    if (!snRes.ok) {
      const body = await snRes.text().catch(() => '')
      return NextResponse.json(
        { error: `SN returned HTTP ${snRes.status}: ${body.slice(0, 200)}` },
        { status: 502 },
      )
    }
    const data = await snRes.json()
    members = data.result || []
  } catch (err: any) {
    return NextResponse.json({ error: 'SN unreachable: ' + err.message }, { status: 502 })
  }

  // Build set of active SN member phones for deactivation pass
  const activeSysIds = new Set<string>()
  let added = 0
  let updated = 0

  for (const m of members) {
    const sysId = m['user.sys_id'] || ''
    const name: string = m['user.name'] || ''
    // Prefer mobile_phone; fall back to phone
    const rawPhone: string = (m['user.mobile_phone'] || m['user.phone'] || '').trim()
    if (!rawPhone || !sysId) continue

    // Normalise to E.164: strip spaces/dashes, ensure leading +
    const e164 = rawPhone.startsWith('+') ? rawPhone.replace(/[\s\-]/g, '') : '+' + rawPhone.replace(/[\s\-]/g, '')
    if (!/^\+\d{7,15}$/.test(e164)) continue

    activeSysIds.add(sysId)

    const existing = await db.allowedCaller.findFirst({
      where: { phoneNumberId: phone.id, phoneE164: e164 },
    })
    if (existing) {
      await db.allowedCaller.update({
        where: { id: existing.id },
        data: { name, snUserSysId: sysId, active: true },
      })
      updated++
    } else {
      await db.allowedCaller.create({
        data: {
          tenantId: tenant.id,
          phoneNumberId: phone.id,
          phoneE164: e164,
          name,
          snUserSysId: sysId,
          active: true,
        },
      })
      added++
    }
  }

  // Deactivate group-sourced callers no longer in the SN group
  // (only those with a snUserSysId not in the fresh group list)
  const deactivated = await db.allowedCaller.updateMany({
    where: {
      phoneNumberId: phone.id,
      snUserSysId: { not: null, notIn: [...activeSysIds] },
      active: true,
    },
    data: { active: false },
  })

  return NextResponse.json({
    success: true,
    added,
    updated,
    deactivated: deactivated.count,
    totalMembers: members.length,
  })
}
