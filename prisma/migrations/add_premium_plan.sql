-- Consolidate plans to FREE / PRO / PREMIUM.
-- Adds PREMIUM (top tier with phone), keeps legacy enum values for existing
-- tenants but marks their PlanDefinition rows inactive so they're hidden from
-- the customer-facing pricing UI.

INSERT INTO "PlanDefinition" ("id", "key", "name", "price", "minutesPerMonth", "concurrentLimit", "maxAgents", "maxInstances", "overageRate", "oneTimeTrial", "features", "cta", "popular", "displayOrder", "active", "updatedAt")
VALUES
  ('plan_premium_seed', 'PREMIUM', 'Premium', 199, 2000, 25, -1, -1, 0.10, false,
   '["2,000 minutes per month","Dedicated inbound phone number","Unlimited instances and agents","All premium TTS voices","BYOK TTS & STT option","Cross-session memory","KB search integration","Advanced guardrails & compliance","SLA guarantee (99.9%)","Priority support"]'::jsonb,
   'Get started', false, 30, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Hide legacy plans from the pricing UI. Existing tenants keep working — the
-- enum value is still valid and the row is still readable, just not listed.
UPDATE "PlanDefinition" SET "active" = false WHERE "key" IN ('STARTER', 'PRO_VOICE', 'BUSINESS', 'ENTERPRISE');
