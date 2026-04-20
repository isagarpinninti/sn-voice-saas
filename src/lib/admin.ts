/**
 * Centralized admin check.
 *
 * A user is an admin if EITHER:
 *   1. Their `User.isAdmin` flag is true (DB-backed, granted via /admin/users), OR
 *   2. Their email is listed in the ADMIN_EMAILS env var (safety-net grant)
 *
 * The env grant exists so the operator can never lock themselves out — even if the
 * DB flag is wrong, an env grant always works.
 *
 * Usage:
 *   import { auth } from '@/lib/auth'
 *   import { isUserAdmin } from '@/lib/admin'
 *   const session = await auth()
 *   if (!isUserAdmin(session)) redirect('/dashboard')
 */
import type { Session } from 'next-auth'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isUserAdmin(session: Session | null | undefined): boolean {
  if (!session?.user) return false
  if (session.user.isAdmin === true) return true
  const email = session.user.email?.toLowerCase()
  if (email && ADMIN_EMAILS.includes(email)) return true
  return false
}

/** Returns true ONLY if the user is granted admin via the env var. */
export function isEnvGrantedAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
