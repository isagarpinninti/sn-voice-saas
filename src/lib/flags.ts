import { db } from './db'
import { logAudit } from './audit'

const CACHE = new Map<string, { value: boolean; expires: number }>()
const TTL_MS = 30_000

function cacheKey(key: string, tenantId: string | null): string {
  return key + ':' + (tenantId ?? 'global')
}

/**
 * Resolve a flag with tenant-override semantics:
 * 1. Tenant-specific row wins.
 * 2. Global row (tenantId null) falls back.
 * 3. Otherwise false.
 *
 * Supports rolloutPct on the global row — deterministic per tenant via
 * stable hash so a tenant either gets the flag or doesn't, not flipping.
 */
export async function isFlagEnabled(key: string, tenantId: string | null): Promise<boolean> {
  const ck = cacheKey(key, tenantId)
  const cached = CACHE.get(ck)
  if (cached && cached.expires > Date.now()) return cached.value

  const value = await resolveFlag(key, tenantId)
  CACHE.set(ck, { value, expires: Date.now() + TTL_MS })
  return value
}

async function resolveFlag(key: string, tenantId: string | null): Promise<boolean> {
  if (tenantId) {
    const tenantRow = await db.featureFlag.findUnique({
      where: { key_tenantId: { key, tenantId } },
    })
    if (tenantRow) return tenantRow.enabled
  }

  const globalRow = await db.featureFlag.findUnique({
    where: { key_tenantId: { key, tenantId: null as any } },
  })
  if (!globalRow) return false
  if (globalRow.enabled) return true
  if (globalRow.rolloutPct > 0 && tenantId) {
    // Deterministic hash (simple FNV-ish) → 0-99
    let hash = 2166136261
    const input = key + ':' + tenantId
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = (hash * 16777619) >>> 0
    }
    const bucket = hash % 100
    return bucket < globalRow.rolloutPct
  }
  return false
}

export async function setFlag(opts: {
  key: string
  tenantId: string | null
  enabled: boolean
  rolloutPct?: number
  description?: string
  actorId?: string | null
}) {
  const row = await db.featureFlag.upsert({
    where: { key_tenantId: { key: opts.key, tenantId: opts.tenantId as any } },
    update: {
      enabled: opts.enabled,
      rolloutPct: opts.rolloutPct ?? 0,
      description: opts.description,
    },
    create: {
      key: opts.key,
      tenantId: opts.tenantId,
      enabled: opts.enabled,
      rolloutPct: opts.rolloutPct ?? 0,
      description: opts.description,
    },
  })
  CACHE.delete(cacheKey(opts.key, opts.tenantId))
  await logAudit({
    actorId: opts.actorId,
    actorType: 'admin',
    action: 'flag.updated',
    targetType: 'FeatureFlag',
    targetId: row.id,
    tenantId: opts.tenantId,
    metadata: { key: opts.key, enabled: opts.enabled, rolloutPct: opts.rolloutPct },
  })
  return row
}

export async function listFlags(tenantId?: string | null) {
  return db.featureFlag.findMany({
    where: tenantId === undefined ? {} : { tenantId },
    orderBy: [{ key: 'asc' }, { tenantId: 'asc' }],
  })
}
