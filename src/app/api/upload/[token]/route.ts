export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyUploadToken } from '@/lib/upload-tokens'
import { resolvePendingUpload, hasPendingUpload } from '@/lib/upload-registry'
import { extractText } from '@/lib/file-extract'
import { addLog } from '@/lib/log-store'
import { logAudit } from '@/lib/audit'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const ALLOWED_EXT_FALLBACK = new Set(['png', 'jpg', 'jpeg', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx'])

type RouteCtx = { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params
  const v = verifyUploadToken(token)
  if (!v.ok) return NextResponse.json({ ok: false, reason: v.reason }, { status: 410 })
  return NextResponse.json({
    ok: true,
    ready: hasPendingUpload(token),
    expSeconds: v.payload.exp - Math.floor(Date.now() / 1000),
    maxBytes: MAX_BYTES,
    allowed: Array.from(ALLOWED_EXT_FALLBACK),
  })
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params
  const v = verifyUploadToken(token)
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: 'Link expired or invalid' }, { status: 410 })
  }
  const { tenantId, sessionId, agentId } = v.payload

  if (!hasPendingUpload(token)) {
    return NextResponse.json({ ok: false, error: 'Call ended — upload no longer accepted' }, { status: 410 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'multipart/form-data expected' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file field required' }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: 'File is empty' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 })
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const allowed = ALLOWED_MIME.has(file.type) || ALLOWED_EXT_FALLBACK.has(ext)
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: 'Unsupported file type. Allowed: png, jpg, pdf, xls, xlsx, ppt, pptx' },
      { status: 415 },
    )
  }

  // Look up tenant's first active instance to find where to attach
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      instances: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!tenant || tenant.instances.length === 0) {
    return NextResponse.json({ ok: false, error: 'Tenant has no active ServiceNow instance' }, { status: 404 })
  }
  const inst = tenant.instances[0]
  if (!inst.snInstanceUrl) {
    return NextResponse.json({ ok: false, error: 'ServiceNow URL missing on instance' }, { status: 404 })
  }

  // Resolve the attachment parent. Default = voice session record (always
  // guaranteed to exist). If the agent passed a target in the token (tt/tn),
  // we look up the sys_id by number via SN REST and attach there instead.
  // Lookup failure falls back to the session and carries an error note back
  // to the LLM via the registry meta so it can tell the user.
  const auth = Buffer.from(`${inst.snUsername}:${inst.snPassword}`).toString('base64')
  const bytes = Buffer.from(await file.arrayBuffer())
  const snBase = inst.snInstanceUrl.replace(/\/$/, '')

  let attachmentTable = 'x_ztpas_ai_voice_a_conversation_session'
  let attachmentParentId = sessionId
  let attachmentNumber: string | undefined
  let targetResolutionError: string | undefined

  const targetTable = v.payload.tt
  const targetNumber = v.payload.tn
  if (targetTable && targetNumber) {
    // Basic sanitization — SN table names are lowercase alphanumerics + underscore.
    const tt = targetTable.toLowerCase()
    const safeTable = /^[a-z][a-z0-9_]{1,49}$/.test(tt) ? tt : ''
    if (!safeTable) {
      targetResolutionError = `${targetTable} ${targetNumber} (invalid table name)`
      addLog('warn', 'upload', 'Invalid target_table "' + targetTable + '" — falling back to session', { tenantId })
    } else {
      const lookupUrl =
        snBase +
        `/api/now/table/${encodeURIComponent(safeTable)}` +
        `?sysparm_query=number=${encodeURIComponent(targetNumber)}` +
        `&sysparm_fields=sys_id,number` +
        `&sysparm_limit=1`
      try {
        const lookupResp = await fetch(lookupUrl, {
          headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
        })
        if (lookupResp.ok) {
          const data = (await lookupResp.json().catch(() => ({}))) as any
          const rec = Array.isArray(data?.result) ? data.result[0] : null
          if (rec?.sys_id) {
            attachmentTable = safeTable
            attachmentParentId = String(rec.sys_id)
            attachmentNumber = String(rec.number || targetNumber)
            addLog('info', 'upload', `Target resolved: ${safeTable} ${attachmentNumber} → ${attachmentParentId}`, { tenantId })
          } else {
            targetResolutionError = `${safeTable} ${targetNumber} (record not found)`
            addLog('warn', 'upload', `Target not found: ${safeTable} ${targetNumber} — falling back to session`, { tenantId })
          }
        } else {
          targetResolutionError = `${safeTable} ${targetNumber} (lookup returned ${lookupResp.status})`
          addLog('warn', 'upload', `Target lookup ${lookupResp.status} — falling back to session`, { tenantId })
        }
      } catch (err: any) {
        targetResolutionError = `${safeTable} ${targetNumber} (lookup error: ${err?.message || 'unknown'})`
        addLog('error', 'upload', 'Target lookup threw: ' + err.message, { tenantId })
      }
    }
  }

  const attachUrl =
    snBase +
    `/api/now/attachment/file?table_name=${encodeURIComponent(attachmentTable)}` +
    `&table_sys_id=${encodeURIComponent(attachmentParentId)}` +
    `&file_name=${encodeURIComponent(file.name)}`

  let snResp: Response
  try {
    snResp = await fetch(attachUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': file.type || 'application/octet-stream',
        'Accept': 'application/json',
      },
      body: bytes as any,
    })
  } catch (err: any) {
    addLog('error', 'upload', 'SN attach fetch failed: ' + err.message, { tenantId })
    return NextResponse.json({ ok: false, error: 'Could not reach ServiceNow' }, { status: 502 })
  }

  if (!snResp.ok) {
    const body = await snResp.text().catch(() => '')
    addLog('error', 'upload', `SN attach ${snResp.status}: ${body.slice(0, 200)}`, { tenantId })
    return NextResponse.json(
      { ok: false, error: `ServiceNow rejected the attachment (${snResp.status})` },
      { status: 502 },
    )
  }

  const snData = (await snResp.json().catch(() => ({}))) as any
  const snAttachmentSysId = snData?.result?.sys_id || ''
  const downloadUrl = snData?.result?.download_link || ''

  addLog('info', 'upload', `Attached ${file.name} (${file.size}B) → ${attachmentTable} ${attachmentNumber || attachmentParentId}`, {
    tenantId,
    data: { agentId, sessionId, mime: file.type, attachmentTable },
  })

  await logAudit({
    tenantId,
    actorType: 'user',
    action: 'attachment.uploaded',
    targetType: 'sys_attachment',
    targetId: snAttachmentSysId,
    metadata: {
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      sessionId,
      agentId,
      attachmentTable,
      attachmentParentId,
      attachmentNumber,
      targetResolutionError,
    },
  })

  // Server-side text extraction for PDF + XLSX — lets the agent reason about
  // file contents, not just the filename. Best-effort: a parse failure never
  // blocks the attach; the agent just won't see the text.
  const extraction = await extractText({
    bytes,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
  })
  if (extraction.kind === 'error') {
    addLog('warn', 'upload', `Extraction error for ${file.name}: ${extraction.error}`, { tenantId })
  } else if (extraction.kind !== 'unsupported') {
    addLog('info', 'upload', `Extracted ${extraction.kind}: ${extraction.note} (${extraction.text.length} chars)`, { tenantId })
  }

  // Notify the live voice pipeline so the agent can reference the file mid-call
  resolvePendingUpload(token, {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    snAttachmentSysId,
    snInstanceUrl: inst.snInstanceUrl,
    downloadUrl,
    extractedText: extraction.text || undefined,
    extractedNote: extraction.note,
    extractedTruncated: extraction.truncated,
    attachedTable: attachmentTable !== 'x_ztpas_ai_voice_a_conversation_session' ? attachmentTable : undefined,
    attachedSysId: attachmentParentId,
    attachedNumber: attachmentNumber,
    targetResolutionError,
  })

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    size: file.size,
    snAttachmentSysId,
    attachedTable: attachmentTable,
    attachedNumber: attachmentNumber,
  })
}
