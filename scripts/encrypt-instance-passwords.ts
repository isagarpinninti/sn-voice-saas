/**
 * One-time migration (M11 of the merge plan): re-encrypts every Instance row
 * still storing snPassword in plaintext (snPasswordEncrypted = false).
 *
 * Safe to re-run — rows already encrypted are skipped. Processes one row at
 * a time and verifies each encryption round-trips (decrypts back to the
 * original plaintext) before committing it, so a bad write is caught
 * immediately rather than silently locking a tenant out of ServiceNow.
 *
 * Usage:
 *   npx tsx scripts/encrypt-instance-passwords.ts          # dry run (default)
 *   npx tsx scripts/encrypt-instance-passwords.ts --apply   # actually writes
 */
import { db } from '../src/lib/db'
import { encrypt, decrypt } from '../src/lib/encrypt'

const APPLY = process.argv.includes('--apply')

async function main() {
  const plaintextRows = await db.instance.findMany({
    where: { snPasswordEncrypted: false },
    select: { id: true, name: true, snPassword: true },
  })

  console.log(`Found ${plaintextRows.length} plaintext Instance row(s).`)
  if (plaintextRows.length === 0) return

  let succeeded = 0
  let failed = 0

  for (const row of plaintextRows) {
    if (!row.snPassword) {
      console.log(`  skip ${row.id} (${row.name}) — empty snPassword`)
      continue
    }
    const ciphertext = encrypt(row.snPassword)
    // Verify before writing anything.
    if (decrypt(ciphertext) !== row.snPassword) {
      console.error(`  FAIL ${row.id} (${row.name}) — round-trip mismatch, NOT writing`)
      failed++
      continue
    }

    if (APPLY) {
      await db.instance.update({
        where: { id: row.id },
        data: { snPassword: ciphertext, snPasswordEncrypted: true },
      })
    }
    console.log(`  ${APPLY ? 'encrypted' : '[dry run] would encrypt'} ${row.id} (${row.name})`)
    succeeded++
  }

  console.log(`\n${succeeded} succeeded, ${failed} failed.${APPLY ? '' : ' Re-run with --apply to write.'}`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
