CREATE TABLE IF NOT EXISTS "PlanDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "minutesPerMonth" INTEGER NOT NULL DEFAULT 0,
    "concurrentLimit" INTEGER NOT NULL DEFAULT 1,
    "maxAgents" INTEGER NOT NULL DEFAULT 1,
    "maxInstances" INTEGER NOT NULL DEFAULT 1,
    "overageRate" DOUBLE PRECISION,
    "oneTimeTrial" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB NOT NULL,
    "cta" TEXT NOT NULL DEFAULT 'Get started',
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanDefinition_key_key" ON "PlanDefinition"("key");

-- Seed current hardcoded values so nothing breaks on first load
INSERT INTO "PlanDefinition" ("id", "key", "name", "price", "minutesPerMonth", "concurrentLimit", "maxAgents", "maxInstances", "overageRate", "oneTimeTrial", "features", "cta", "popular", "displayOrder", "updatedAt")
VALUES
  ('plan_free_seed', 'FREE', 'Free Trial', 0, 50, 1, 1, 1, NULL, true,
   '["50 minutes total (one-time)","1 ServiceNow instance","1 voice agent","Neural STT + TTS included","ServiceNow tool execution","Basic analytics"]'::jsonb,
   'Start free trial', false, 10, CURRENT_TIMESTAMP),
  ('plan_pro_seed', 'PRO', 'Pro', 79, 500, 5, 5, 3, 0.15, false,
   '["500 minutes per month","3 ServiceNow instances","5 voice agents","All premium TTS voices","Cross-session memory","KB search integration","Full analytics dashboard","Priority email support"]'::jsonb,
   'Get started', true, 20, CURRENT_TIMESTAMP),
  ('plan_enterprise_seed', 'ENTERPRISE', 'Enterprise', 299, 3500, 25, -1, -1, 0.08, false,
   '["3,500 minutes per month","Unlimited instances","Unlimited voice agents","BYOK TTS & STT option","Dedicated account manager","SLA guarantee (99.9%)","Advanced guardrails & compliance","Onboarding assistance"]'::jsonb,
   'Get started', false, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
