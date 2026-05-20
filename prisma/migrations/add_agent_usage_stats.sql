-- Per-agent usage aggregates: incremented on call close, synced back to SN every 6h.
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "totalCalls"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "totalMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "lastCallAt"   TIMESTAMP(3);
