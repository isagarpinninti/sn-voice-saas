/**
 * DB-backed registry for pending attachment uploads.
 *
 * State lives in the AttachmentUpload Prisma table so pending uploads survive
 * rolling deploys, container restarts, and horizontal scaling. The voice
 * pipeline writes a row on `request_attachment` and polls the same row until
 * status === 'completed'. The upload route updates the row on success.
 *
 * Tokens are HMAC-signed (see upload-tokens.ts). The DB row is the source of
 * truth for lifecycle; the token is the unforgeable handle.
 */
import { db } from './db'

export type UploadMeta = {
  fileName: string
  mimeType: string
  sizeBytes: number
  snAttachmentSysId: string
  snInstanceUrl: string
  downloadUrl: string
  extractedText?: string
  extractedNote?: string
  extractedTruncated?: boolean
  attachedTable?: string
  attachedSysId?: string
  attachedNumber?: string
  targetResolutionError?: string
}

export type PendingRow = {
  id: string
  token: string
  tenantId: string
  sessionId: string
  agentId: string
  targetTable: string | null
  targetNumber: string | null
  status: string
  expiresAt: Date
  completedAt: Date | null
}

/**
 * Create a pending upload row. Called by the pipeline when the LLM invokes
 * request_attachment.
 */
export async function createPendingUpload(params: {
  token: string
  tenantId: string
  sessionId: string
  agentId: string
  targetTable?: string
  targetNumber?: string
  ttlSeconds?: number
}): Promise<void> {
  const ttl = params.ttlSeconds ?? 900
  await db.attachmentUpload.create({
    data: {
      token: params.token,
      tenantId: params.tenantId,
      sessionId: params.sessionId,
      agentId: params.agentId,
      targetTable: params.targetTable || null,
      targetNumber: params.targetNumber || null,
      status: 'pending',
      expiresAt: new Date(Date.now() + ttl * 1000),
    },
  })
}

/**
 * Look up a pending upload by token. Returns null when the row doesn't exist
 * or the upload is expired.
 */
export async function findActivePendingUpload(token: string): Promise<PendingRow | null> {
  const row = await db.attachmentUpload.findUnique({ where: { token } })
  if (!row) return null
  if (row.status === 'cancelled') return null
  if (row.status === 'pending' && row.expiresAt < new Date()) return null
  return {
    id: row.id,
    token: row.token,
    tenantId: row.tenantId,
    sessionId: row.sessionId,
    agentId: row.agentId,
    targetTable: row.targetTable,
    targetNumber: row.targetNumber,
    status: row.status,
    expiresAt: row.expiresAt,
    completedAt: row.completedAt,
  }
}

/**
 * Mark an upload completed and persist the result meta. Idempotent — a second
 * call on an already-completed row is a no-op.
 */
export async function completePendingUpload(token: string, meta: UploadMeta): Promise<boolean> {
  const row = await db.attachmentUpload.findUnique({ where: { token }, select: { id: true, status: true } })
  if (!row) return false
  if (row.status !== 'pending') return false
  await db.attachmentUpload.update({
    where: { token },
    data: {
      status: 'completed',
      completedAt: new Date(),
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      snAttachmentSysId: meta.snAttachmentSysId,
      attachedTable: meta.attachedTable || null,
      attachedSysId: meta.attachedSysId || null,
      attachedNumber: meta.attachedNumber || null,
      extractedText: meta.extractedText || null,
      extractedNote: meta.extractedNote || null,
      extractedTruncated: meta.extractedTruncated ?? null,
      targetResolutionError: meta.targetResolutionError || null,
    },
  })
  return true
}

/**
 * Read back the completed metadata for a token. Used by the pipeline poller
 * after it sees status='completed'.
 */
export async function readCompletedMeta(token: string): Promise<(UploadMeta & { snInstanceUrl: string; downloadUrl: string }) | null> {
  const row = await db.attachmentUpload.findUnique({
    where: { token },
    include: {
      tenant: {
        include: { instances: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } } },
      },
    },
  })
  if (!row || row.status !== 'completed' || !row.fileName) return null
  const inst = row.tenant.instances[0]
  return {
    fileName: row.fileName,
    mimeType: row.mimeType || 'application/octet-stream',
    sizeBytes: row.sizeBytes || 0,
    snAttachmentSysId: row.snAttachmentSysId || '',
    snInstanceUrl: inst?.snInstanceUrl || '',
    downloadUrl: '',
    extractedText: row.extractedText || undefined,
    extractedNote: row.extractedNote || undefined,
    extractedTruncated: row.extractedTruncated ?? undefined,
    attachedTable: row.attachedTable || undefined,
    attachedSysId: row.attachedSysId || undefined,
    attachedNumber: row.attachedNumber || undefined,
    targetResolutionError: row.targetResolutionError || undefined,
  }
}

/**
 * Cancel a pending upload (called on pipeline.stop() so the upload link stops
 * working once the call ends).
 */
export async function cancelPendingUpload(token: string): Promise<void> {
  try {
    await db.attachmentUpload.updateMany({
      where: { token, status: 'pending' },
      data: { status: 'cancelled' },
    })
  } catch {
    /* swallow — best effort cleanup */
  }
}

/**
 * Back-compat shim for /upload/[token] GET — check if a token has an active
 * pending row. Returns false for expired / cancelled / completed.
 */
export async function hasPendingUpload(token: string): Promise<boolean> {
  const row = await findActivePendingUpload(token)
  return !!row && row.status === 'pending'
}
