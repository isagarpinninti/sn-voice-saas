/**
 * Authenticate inbound ServiceNow API requests.
 *
 * ServiceNow sends `Authorization: Bearer sk_live_...` using the instance's
 * API key. We resolve the token to a Tenant + Instance.
 */

import { db } from './db'

export interface SnAuthResult {
  tenantId: string
  instanceId: string | null
}

/**
 * Validate a Bearer token from ServiceNow against the ApiToken table.
 * Returns the tenantId + instanceId on success, null on failure.
 */
export async function authenticateSnRequest(
  req: Request,
): Promise<SnAuthResult | null> {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7).trim()
  if (!token) return null

  const apiToken = await db.apiToken.findUnique({
    where: { token },
    select: { tenantId: true, instanceId: true, active: true },
  })

  if (!apiToken || !apiToken.active) return null

  return { tenantId: apiToken.tenantId, instanceId: apiToken.instanceId }
}
