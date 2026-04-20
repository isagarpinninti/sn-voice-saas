export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'

export type SearchResult = {
  type: 'tenant' | 'user' | 'agent' | 'instance' | 'action'
  id: string
  label: string
  sub?: string
  href: string
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const LIMIT = 6
  const contains = { contains: q, mode: 'insensitive' as const }

  const [users, tenants, agents, instances] = await Promise.all([
    db.user.findMany({
      where: {
        OR: [
          { email: contains },
          { name: contains },
          { id: q.length > 8 ? q : undefined },
        ].filter(Boolean) as any,
      },
      select: { id: true, email: true, name: true, tenant: { select: { id: true } } },
      take: LIMIT,
    }),
    db.tenant.findMany({
      where: {
        OR: [
          { company: contains },
          { id: q.length > 8 ? q : undefined },
          { user: { email: contains } },
          { user: { name: contains } },
        ].filter(Boolean) as any,
      },
      select: {
        id: true,
        plan: true,
        company: true,
        user: { select: { email: true, name: true } },
      },
      take: LIMIT,
    }),
    db.agent.findMany({
      where: {
        OR: [{ name: contains }, { id: q.length > 8 ? q : undefined }].filter(Boolean) as any,
      },
      select: { id: true, name: true, tenantId: true },
      take: LIMIT,
    }),
    db.instance.findMany({
      where: {
        OR: [
          { name: contains },
          { snInstanceUrl: contains },
          { id: q.length > 8 ? q : undefined },
        ].filter(Boolean) as any,
      },
      select: { id: true, name: true, snInstanceUrl: true, tenantId: true },
      take: LIMIT,
    }),
  ])

  const results: SearchResult[] = []

  for (const t of tenants) {
    results.push({
      type: 'tenant',
      id: t.id,
      label: t.company || t.user?.name || t.user?.email || t.id,
      sub: `${t.plan} · ${t.user?.email || t.id}`,
      href: `/admin/tenants/${t.id}`,
    })
  }
  for (const u of users) {
    results.push({
      type: 'user',
      id: u.id,
      label: u.name || u.email || u.id,
      sub: u.email || 'no email',
      href: u.tenant ? `/admin/tenants/${u.tenant.id}` : `/admin/users`,
    })
  }
  for (const a of agents) {
    results.push({
      type: 'agent',
      id: a.id,
      label: a.name,
      sub: `agent · tenant ${a.tenantId.slice(0, 10)}…`,
      href: `/admin/tenants/${a.tenantId}`,
    })
  }
  for (const i of instances) {
    results.push({
      type: 'instance',
      id: i.id,
      label: i.name,
      sub: i.snInstanceUrl?.replace('https://', '') || 'no url',
      href: `/admin/tenants/${i.tenantId}`,
    })
  }

  const lower = q.toLowerCase()
  const ACTIONS: SearchResult[] = [
    { type: 'action', id: 'nav-overview', label: 'Go to Overview', href: '/admin' },
    { type: 'action', id: 'nav-tenants', label: 'Go to Tenants', href: '/admin/tenants' },
    { type: 'action', id: 'nav-phone', label: 'Go to Phone Numbers', href: '/admin/phone-numbers' },
    { type: 'action', id: 'nav-users', label: 'Go to Users', href: '/admin/users' },
    { type: 'action', id: 'nav-audit', label: 'Go to Audit log', href: '/admin/audit' },
    { type: 'action', id: 'nav-revenue', label: 'Go to Revenue', href: '/admin/revenue' },
    { type: 'action', id: 'nav-flags', label: 'Go to Feature flags', href: '/admin/flags' },
    { type: 'action', id: 'nav-health', label: 'Go to Health', href: '/admin/health' },
    { type: 'action', id: 'nav-logs', label: 'Go to Live logs', href: '/admin/logs' },
    { type: 'action', id: 'nav-usage', label: 'Go to Usage', href: '/admin/usage' },
  ]
  for (const a of ACTIONS) {
    if (a.label.toLowerCase().includes(lower)) results.push(a)
  }

  return NextResponse.json({ results: results.slice(0, 20) })
}
