// Phone allowlist input validation + normalization.
// Used by both the CRUD API and the phone gate so the format rules don't drift.

export const E164_RE = /^\+[1-9]\d{6,14}$/
export const SN_SYS_ID_RE = /^[a-f0-9]{32}$/

export type AllowedCallerInput = {
  phoneE164: string
  name: string | null
  email: string | null
  employeeId: string | null
  snUserSysId: string | null
  active: boolean
}

/**
 * Validate + normalize CREATE input. phoneE164 is required; other fields default
 * to null/true. Email is lower-cased, optional fields collapse to null when empty.
 */
export function normalizeCreateInput(body: any): AllowedCallerInput | { error: string } {
  const partial = normalizeUpdateInput(body)
  if ('error' in partial) return partial
  if (!partial.phoneE164) return { error: 'phoneE164 is required' }
  return {
    phoneE164: partial.phoneE164,
    name: partial.name ?? null,
    email: partial.email ?? null,
    employeeId: partial.employeeId ?? null,
    snUserSysId: partial.snUserSysId ?? null,
    active: partial.active ?? true,
  }
}

/**
 * Validate + normalize UPDATE input. All fields optional — only supplied keys
 * are validated and returned, so the resulting object can be passed straight
 * to Prisma's `update` data without overwriting unsupplied fields with null.
 */
export function normalizeUpdateInput(body: any): Partial<AllowedCallerInput> | { error: string } {
  const out: Partial<AllowedCallerInput> = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  if (has('phoneE164')) {
    const raw = typeof body.phoneE164 === 'string' ? body.phoneE164.trim() : ''
    if (!E164_RE.test(raw)) {
      return { error: 'phoneE164 must be E.164 format with country code (e.g. +14155550123)' }
    }
    out.phoneE164 = raw
  }

  if (has('name')) {
    const raw = typeof body.name === 'string' ? body.name.trim() : ''
    out.name = raw || null
  }

  if (has('email')) {
    const raw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (raw && !raw.includes('@')) return { error: 'email must contain @' }
    out.email = raw || null
  }

  if (has('employeeId')) {
    const raw = typeof body.employeeId === 'string' ? body.employeeId.trim() : ''
    out.employeeId = raw || null
  }

  if (has('snUserSysId')) {
    const raw = typeof body.snUserSysId === 'string' ? body.snUserSysId.trim().toLowerCase() : ''
    if (raw && !SN_SYS_ID_RE.test(raw)) {
      return { error: 'snUserSysId must be a 32-char hex sys_id (or empty)' }
    }
    out.snUserSysId = raw || null
  }

  if (has('active')) {
    out.active = body.active === true || body.active === 'true'
  }

  return out
}
