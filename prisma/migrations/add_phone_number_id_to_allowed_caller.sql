-- Add phoneNumberId to AllowedCaller for per-agent caller group scoping.
-- Existing rows keep phoneNumberId = NULL (tenant-wide, backward-compat).
-- The gate checks phone-scoped callers first; tenant-wide is the fallback.

-- 1. Add the column (nullable so existing rows are unaffected)
ALTER TABLE "AllowedCaller" ADD COLUMN "phoneNumberId" TEXT;

-- 2. Add FK constraint
ALTER TABLE "AllowedCaller"
  ADD CONSTRAINT "AllowedCaller_phoneNumberId_fkey"
  FOREIGN KEY ("phoneNumberId") REFERENCES "PhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Drop the old unique constraint (tenantId, phoneE164)
ALTER TABLE "AllowedCaller" DROP CONSTRAINT IF EXISTS "AllowedCaller_tenantId_phoneE164_key";

-- 4. Add new composite unique: (tenantId, phoneNumberId, phoneE164)
--    PostgreSQL treats NULLs as distinct in UNIQUE constraints, so two tenant-wide
--    rows (phoneNumberId = NULL) with the same (tenantId, phoneE164) would NOT
--    naturally be rejected. We keep uniqueness for tenant-wide entries via the
--    application layer (existence check before insert).
ALTER TABLE "AllowedCaller"
  ADD CONSTRAINT "AllowedCaller_tenantId_phoneNumberId_phoneE164_key"
  UNIQUE ("tenantId", "phoneNumberId", "phoneE164");

-- 5. Index for fast per-phone-number lookups
CREATE INDEX IF NOT EXISTS "AllowedCaller_phoneNumberId_active_idx"
  ON "AllowedCaller" ("phoneNumberId", "active");
