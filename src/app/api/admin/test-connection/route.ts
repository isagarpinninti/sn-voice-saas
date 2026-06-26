export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isUserAdmin } from '@/lib/admin'

export async function POST(req: Request) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { tenantId, instanceId } = await req.json()

  // Find the instance to test
  const instance = instanceId
    ? await db.instance.findFirst({ where: { id: instanceId }, include: { agents: { where: { active: true }, take: 1 } } })
    : await db.instance.findFirst({ where: { tenantId, active: true }, orderBy: { createdAt: 'asc' }, include: { agents: { where: { active: true }, take: 1 } } })

  const results: { step: string; status: 'pass' | 'fail'; detail: string }[] = []

  if (!instance) {
    results.push({ step: 'Instance', status: 'fail', detail: 'No instance configured for this tenant' })
    return NextResponse.json({ results })
  }
  results.push({ step: 'Instance', status: 'pass', detail: instance.snInstanceUrl })
  results.push({ step: 'Credentials', status: 'pass', detail: 'Username: ' + instance.snUsername })

  try {
    const res = await fetch(instance.snInstanceUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    results.push({ step: 'Reachable', status: res.ok || res.status === 301 || res.status === 302 ? 'pass' : 'fail', detail: 'HTTP ' + res.status })
  } catch (err: any) {
    results.push({ step: 'Reachable', status: 'fail', detail: err.message })
    return NextResponse.json({ results })
  }

  try {
    const authHeader = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')
    const res = await fetch(`${instance.snInstanceUrl}/api/now/table/sys_properties?sysparm_limit=1`, {
      headers: { 'Authorization': `Basic ${authHeader}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    results.push({ step: 'Authentication', status: res.ok ? 'pass' : 'fail', detail: res.ok ? 'Login OK' : 'HTTP ' + res.status })
    if (!res.ok) return NextResponse.json({ results })
  } catch (err: any) {
    results.push({ step: 'Authentication', status: 'fail', detail: err.message })
    return NextResponse.json({ results })
  }

  const firstAgent = instance.agents[0] || null
  try {
    const authHeader = Buffer.from(`${instance.snUsername}:${instance.snPassword}`).toString('base64')
    const res = await fetch(`${instance.snInstanceUrl}/api/x_ztpas_ai_voice_a/v1/gateway/init`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(firstAgent?.snAgentId ? { preferred_agent_id: firstAgent.snAgentId } : {}),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      results.push({ step: 'Gateway Init', status: 'fail', detail: 'HTTP ' + res.status + ' — check app is installed and REST API is active' })
    } else {
      const data = await res.json()
      const result = data.result || data
      if (result.error || result.message) {
        results.push({ step: 'Gateway Init', status: 'fail', detail: result.message || result.error || 'No active agent found' })
      } else if (result.session_sys_id || result.agent_sys_id) {
        results.push({ step: 'Gateway Init', status: 'pass', detail: 'Gateway OK' + (result.agent_sys_id ? ' — agent: ' + result.agent_sys_id.slice(0, 8) + '…' : '') })
      } else {
        results.push({ step: 'Gateway Init', status: 'fail', detail: 'Unexpected response from gateway' })
      }
    }
  } catch (err: any) {
    results.push({ step: 'Gateway Init', status: 'fail', detail: err.message })
  }

  return NextResponse.json({ results })
}
