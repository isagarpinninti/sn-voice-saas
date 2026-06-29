import { cookies } from 'next/headers'
import crypto from 'crypto'
import { db } from './db'

const COOKIE_NAME = 'zevox_impersonate'
const TTL_SECONDS = 60 * 60 // 1 hour
const _secret = process.env.NEXTAUTH_SECRET || process.env.IMPERSONATION_SECRET
if (!_secret) throw new Error('NEXTAUTH_SECRET or IMPERSONATION_SECRET env var is required')
const SECRET: string = _secret

function sign(value: string): string {
  const hmac = crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 32)
  return value + '.' + hmac
}

function verify(signed: string): string | null {
  if (!signed || !signed.includes('.')) return null
  const idx = signed.lastIndexOf('.')
  const value = signed.slice(0, idx)
  const sig = signed.slice(idx + 1)
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 32)
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  return value
}

export interface ImpersonationState {
  impersonating: boolean
  realUserId: string | null
  targetUserId: string | null
}

/**
 * Read the impersonation cookie (if valid). Returns the target userId the
 * admin is acting as, or null. Cookie is sha256-signed with NEXTAUTH_SECRET.
 */
export async function readImpersonationCookie(): Promise<{ realUserId: string; targetUserId: string } | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value
  if (!raw) return null
  const value = verify(raw)
  if (!value) return null
  const [realUserId, targetUserId, expires] = value.split('|')
  if (!realUserId || !targetUserId || !expires) return null
  if (parseInt(expires) < Date.now()) return null
  return { realUserId, targetUserId }
}

/**
 * Start impersonating. Only callable by an admin — the caller enforces that.
 */
export async function startImpersonation(realUserId: string, targetUserId: string) {
  if (realUserId === targetUserId) throw new Error('Cannot impersonate yourself')
  const target = await db.user.findUnique({ where: { id: targetUserId } })
  if (!target) throw new Error('Target user not found')

  const expires = Date.now() + TTL_SECONDS * 1000
  const signed = sign([realUserId, targetUserId, String(expires)].join('|'))
  ;(await cookies()).set({
    name: COOKIE_NAME,
    value: signed,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_SECONDS,
    path: '/',
  })
}

export async function stopImpersonation() {
  ;(await cookies()).delete(COOKIE_NAME)
}
