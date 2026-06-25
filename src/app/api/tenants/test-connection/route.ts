export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Test connection to ServiceNow for a specific instance.
 * Accepts optional instanceId in body; defaults to first active instance.
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const instanceId = body?.instanceId

  const instance = instanceId
    ? await db.instance.findFirst({ where: { id: instanceId, tenantId: tenant.id }, include: { agents: { where: { active: true }, take: 1 } } })
    : await db.instance.findFirst({ where: { tenantId: tenant.id, active: true }, orderBy: { createdAt: 'asc' }, include: { agents: { where: { active: true }, take: 1 } } })

  const results: { step: string; status: 'pass' | 'fail'; detail: string }[] = []

  if (!instance) {
    results.push({ step: 'Instance', status: 'fail', detail: 'No instance configured. Add one on the Connection page.' })
    return NextResponse.json({ results })
  }
  results.push({ step: 'Instance', status: 'pass', detail: instance.snInstanceUrl })

  if (!instance.snUsername || !instance.snPassword) {
    results.push({ step: 'Credentials', status: 'fail', detail: 'Username or password missing.' })
    return NextResponse.json({ results })
  }
  results.push({ step: 'Credentials', status: 'pass', detail: 'Username: ' + instance.snUsername })

  // Reachable
  try {
    const res = await fetch(instance.snInstanceUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    results.push({ step: 'Instance Reachable', status: (res.ok || res.status === 301 || res.status === 302) ? 'pass' : 'fail', detail: 'HTTP ' + res.status })
  } catch (err: any) {
    results.push({ step: 'Instance Reachable', status: 'fail', detail: err.message })
    return NextResponse.json({ results })
  }

  // Auth
  try {
    const authHeader = Buffer.from(instance.snUsername + ':' + instance.snPassword).toString('base64')
    const res = await fetch(instance.snInstanceUrl + '/api/now/table/sys_properties?sysparm_limit=1', {
      headers: { 'Authorization': 'Basic ' + authHeader, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    results.push({ step: 'Authentication', status: res.ok ? 'pass' : 'fail', detail: res.ok ? 'Login successful' : 'HTTP ' + res.status + ' — check credentials' })
    if (!res.ok) return NextResponse.json({ results })
  } catch (err: any) {
    results.push({ step: 'Authentication', status: 'fail', detail: err.message })
    return NextResponse.json({ results })
  }

  // Voice Agent API
  const firstAgent = instance.agents[0] || null
  if (firstAgent?.snAgentId) {
    try {
      const authHeader = Buffer.from(instance.snUsername + ':' + instance.snPassword).toString('base64')
      const res = await fetch(instance.snInstanceUrl + '/api/x_ztpas_ai_voice_a/v1/gateway/init', {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + authHeader, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ agent_id: firstAgent.snAgentId }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      const result = data.result || data
      if (result.success) {
        results.push({ step: 'Voice Agent', status: 'pass', detail: 'Agent: ' + (result.agent?.name || 'OK') })
      } else {
        results.push({ step: 'Voice Agent', status: 'fail', detail: result.error || 'Check agent sys_id' })
      }
    } catch (err: any) {
      results.push({ step: 'Voice Agent', status: 'fail', detail: err.message })
    }
  } else {
    results.push({ step: 'Voice Agent', status: 'fail', detail: 'No agent linked to this instance yet. Create one in ServiceNow (auto-syncs if SaaS sync is configured).' })
  }

  return NextResponse.json({ results })
}
