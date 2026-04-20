/**
 * ServiceNow Table API client.
 *
 * Wraps fetch calls to a tenant's ServiceNow instance with HTTP Basic auth
 * and JSON parsing. Used by API routes that need to read/write scoped-app
 * tables (e.g. x_ztpas_ai_voice_a_agent_tool).
 *
 * Tenant credentials live on the Tenant model (snInstanceUrl/snUsername/snPassword).
 */

import { db } from './db'

export interface ServiceNowCredentials {
  instanceUrl: string
  username: string
  password: string
}

export class ServiceNowError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ServiceNowError'
    this.status = status
    this.body = body
  }
}

/**
 * Load ServiceNow credentials from a tenant's first active instance.
 * Returns null if no instance is configured.
 */
export async function getTenantServiceNowCreds(
  userId: string,
): Promise<ServiceNowCredentials | null> {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const instance = await db.instance.findFirst({
    where: { tenantId: tenant.id, active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!instance?.snInstanceUrl || !instance?.snUsername || !instance?.snPassword) return null
  return {
    instanceUrl: instance.snInstanceUrl.replace(/\/$/, ''),
    username: instance.snUsername,
    password: instance.snPassword,
  }
}

function authHeader(creds: ServiceNowCredentials): string {
  return 'Basic ' + Buffer.from(creds.username + ':' + creds.password).toString('base64')
}

interface SnListOptions {
  query?: string
  fields?: string[]
  limit?: number
  orderBy?: string
}

/**
 * List records from a ServiceNow table.
 */
export async function snList<T = Record<string, unknown>>(
  creds: ServiceNowCredentials,
  table: string,
  opts: SnListOptions = {},
): Promise<T[]> {
  const params = new URLSearchParams()
  if (opts.query) params.set('sysparm_query', opts.query)
  if (opts.fields?.length) params.set('sysparm_fields', opts.fields.join(','))
  if (opts.limit) params.set('sysparm_limit', String(opts.limit))
  if (opts.orderBy) {
    const existingQuery = params.get('sysparm_query') || ''
    params.set('sysparm_query', (existingQuery ? existingQuery + '^' : '') + 'ORDERBY' + opts.orderBy)
  }
  params.set('sysparm_display_value', 'false')
  params.set('sysparm_exclude_reference_link', 'true')

  const url = `${creds.instanceUrl}/api/now/table/${table}?${params.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: authHeader(creds), Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ServiceNowError(`ServiceNow list failed (${res.status})`, res.status, body)
  }
  return (body.result || []) as T[]
}

/**
 * Fetch a single record by sys_id.
 */
export async function snGet<T = Record<string, unknown>>(
  creds: ServiceNowCredentials,
  table: string,
  sysId: string,
): Promise<T | null> {
  const url = `${creds.instanceUrl}/api/now/table/${table}/${sysId}?sysparm_display_value=false&sysparm_exclude_reference_link=true`
  const res = await fetch(url, {
    headers: { Authorization: authHeader(creds), Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (res.status === 404) return null
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ServiceNowError(`ServiceNow get failed (${res.status})`, res.status, body)
  }
  return (body.result || null) as T | null
}

/**
 * Create a record. Returns the created record's sys_id and full body.
 */
export async function snCreate<T = Record<string, unknown>>(
  creds: ServiceNowCredentials,
  table: string,
  data: Record<string, unknown>,
): Promise<T> {
  const url = `${creds.instanceUrl}/api/now/table/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(creds),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ServiceNowError(`ServiceNow create failed (${res.status})`, res.status, body)
  }
  return body.result as T
}

/**
 * Patch (partial update) a record by sys_id.
 */
export async function snUpdate<T = Record<string, unknown>>(
  creds: ServiceNowCredentials,
  table: string,
  sysId: string,
  data: Record<string, unknown>,
): Promise<T> {
  const url = `${creds.instanceUrl}/api/now/table/${table}/${sysId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader(creds),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ServiceNowError(`ServiceNow update failed (${res.status})`, res.status, body)
  }
  return body.result as T
}

/**
 * Delete a record by sys_id.
 */
export async function snDelete(
  creds: ServiceNowCredentials,
  table: string,
  sysId: string,
): Promise<void> {
  const url = `${creds.instanceUrl}/api/now/table/${table}/${sysId}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: authHeader(creds) },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => ({}))
    throw new ServiceNowError(`ServiceNow delete failed (${res.status})`, res.status, body)
  }
}

// Table name constants for the AI Voice scoped app
export const SN_TABLES = {
  voiceAgent: 'x_ztpas_ai_voice_a_voice_agent',
  agentTool: 'x_ztpas_ai_voice_a_agent_tool',
} as const
