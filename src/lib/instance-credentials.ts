import { encrypt, decrypt } from './encrypt'

/**
 * Every read/write of Instance.snPassword goes through this module (see M11
 * of the merge plan) — never access instance.snPassword directly for
 * authentication. snPasswordEncrypted defaults to false so pre-existing
 * plaintext rows keep working until the one-time migration script
 * (scripts/encrypt-instance-passwords.ts) re-encrypts them; new/updated
 * rows are always written encrypted.
 */

export type InstanceCredentialSource = {
  snUsername: string | null
  snPassword: string | null
  snPasswordEncrypted: boolean | null
}

export function getInstancePassword(instance: InstanceCredentialSource): string {
  const password = instance.snPassword ?? ''
  return instance.snPasswordEncrypted ? decrypt(password) : password
}

/** Raw base64 "user:pass" — for call sites that prepend "Basic " themselves. */
export function instanceBasicAuthValue(instance: InstanceCredentialSource): string {
  return Buffer.from(`${instance.snUsername ?? ''}:${getInstancePassword(instance)}`).toString('base64')
}

/** Full "Basic <base64>" header value, ready to assign to Authorization. */
export function instanceBasicAuthHeader(instance: InstanceCredentialSource): string {
  return 'Basic ' + instanceBasicAuthValue(instance)
}

export function encryptInstancePassword(password: string): { snPassword: string; snPasswordEncrypted: true } {
  return { snPassword: encrypt(password), snPasswordEncrypted: true }
}
