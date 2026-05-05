-- Phase 2.5: add `provider` column to PhoneNumber for multi-provider telephony
-- (Twilio + Telnyx run in parallel; FreeSWITCH planned).
--
-- The legacy `twilioSid` column is kept in-place — the Prisma schema now
-- exposes it as `providerExternalId` via @map("twilioSid"). No data movement.
-- A later migration can physically rename the column once all deploys are on
-- the new schema.

ALTER TABLE "PhoneNumber"
  ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'TWILIO';

-- Existing rows were all Twilio — the DEFAULT backfills them. No-op when the
-- column already exists (idempotent re-run).
