/**
 * In-process registry for pending attachment uploads.
 *
 * The voice pipeline calls `registerPendingUpload(token, onUpload)` when it
 * mints an upload token. The /api/upload/[token] route calls
 * `resolvePendingUpload(token, meta)` when a file arrives. That fires the
 * registered callback exactly once (then removes the entry) so the pipeline
 * can inject a system message into the live conversation.
 *
 * In-memory only — safe for a single-container Railway service. If we scale
 * horizontally later, swap this for Redis pub/sub with the same interface.
 */

export type UploadMeta = {
  fileName: string
  mimeType: string
  sizeBytes: number
  snAttachmentSysId: string
  snInstanceUrl: string
  downloadUrl: string
}

type Entry = {
  callback: (meta: UploadMeta) => void
  expiresAt: number
}

const registry = new Map<string, Entry>()

// GC expired entries on each call — O(n) across the tiny map (uploads in flight)
function gc(now: number) {
  for (const [k, v] of registry) {
    if (v.expiresAt < now) registry.delete(k)
  }
}

export function registerPendingUpload(
  token: string,
  callback: (meta: UploadMeta) => void,
  ttlSeconds = 900,
) {
  const now = Date.now()
  gc(now)
  registry.set(token, { callback, expiresAt: now + ttlSeconds * 1000 })
}

export function unregisterPendingUpload(token: string) {
  registry.delete(token)
}

export function resolvePendingUpload(token: string, meta: UploadMeta): boolean {
  gc(Date.now())
  const entry = registry.get(token)
  if (!entry) return false
  registry.delete(token)
  try {
    entry.callback(meta)
  } catch {
    /* swallow — pipeline may have ended */
  }
  return true
}

export function hasPendingUpload(token: string): boolean {
  gc(Date.now())
  return registry.has(token)
}
