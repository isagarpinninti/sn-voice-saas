/**
 * Cross-origin URL helpers for the split admin deploy.
 *
 * When ADMIN_MODE=true (the admin deploy), user-facing links must point at the
 * user app's absolute URL and vice-versa — same-origin relative links won't
 * work across the port/host boundary.
 *
 * Configure via:
 *   NEXT_PUBLIC_APP_URL   = https://app.zevox.com   (or http://localhost:3000 in dev)
 *   NEXT_PUBLIC_ADMIN_URL = https://admin.zevox.com (or http://localhost:3001 in dev)
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL || '').replace(/\/$/, '')

export const IS_ADMIN_DEPLOY = process.env.ADMIN_MODE === 'true'

export function adminHref(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return ADMIN_URL ? `${ADMIN_URL}${clean}` : clean
}

export function appHref(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return APP_URL ? `${APP_URL}${clean}` : clean
}
