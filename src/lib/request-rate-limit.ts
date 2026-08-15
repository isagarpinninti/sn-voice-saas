/**
 * Minimal in-memory fixed-window request-rate limiter (IP-keyed, per-route
 * throttling) — distinct from lib/rate-limiter.ts, which enforces
 * per-tenant plan minute quotas. Good enough for a single-instance
 * deployment; swap for a Redis-backed limiter before running more than one
 * replica. Ported verbatim from VoiceConnect's control-plane/lib/rate-limit.ts.
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  bucket.count += 1
  return bucket.count > limit
}
