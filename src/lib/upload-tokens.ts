/**
 * HMAC-signed one-time upload tokens.
 *
 * A token is `<base64url(payload)>.<hex-hmac>` where payload is a JSON blob
 * binding the upload to a specific tenant, session, and expiry. Signed with
 * NEXTAUTH_SECRET so the upload endpoint can verify the token wasn't forged,
 * without needing a DB lookup.
 *
 * The one-time property is enforced in-process by upload-registry.ts (the
 * pipeline registers a callback on mint, and the upload route unregisters
 * on success — a replayed token after the callback is gone returns 410).
 */
import { createHmac, randomBytes } from 'crypto'

export type UploadPayload = {
  tenantId: string
  sessionId: string
  agentId: string
  /** Unix seconds */
  exp: number
  /** Random nonce — the session may issue multiple tokens */
  n: string
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET required for upload token signing')
  return s
}

export function signUploadToken(data: Omit<UploadPayload, 'exp' | 'n'>, ttlSeconds = 900): string {
  const payload: UploadPayload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    n: randomBytes(8).toString('hex'),
  }
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = createHmac('sha256', secret()).update(body).digest('hex')
  return `${body}.${sig}`
}

export function verifyUploadToken(token: string): { ok: true; payload: UploadPayload } | { ok: false; reason: string } {
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'malformed' }
  const [body, sig] = token.split('.', 2)
  if (!body || !sig) return { ok: false, reason: 'malformed' }
  const expected = createHmac('sha256', secret()).update(body).digest('hex')
  if (expected.length !== sig.length) return { ok: false, reason: 'signature-length' }
  // Constant-time compare
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return { ok: false, reason: 'signature' }
  let payload: UploadPayload
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8')) as UploadPayload
  } catch {
    return { ok: false, reason: 'payload' }
  }
  if (!payload?.tenantId || !payload?.sessionId || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'payload-fields' }
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, payload }
}
