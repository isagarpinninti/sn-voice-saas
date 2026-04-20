-- Multi-instance support: one tenant can connect multiple SN instances
-- Run this AFTER move_widget_to_tenant.sql

-- Step 1: Create Instance table
CREATE TABLE IF NOT EXISTS "Instance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Default Instance',
  "snInstanceUrl" TEXT NOT NULL,
  "snUsername" TEXT NOT NULL,
  "snPassword" TEXT NOT NULL,
  "widgetColor" TEXT DEFAULT '#10b981',
  "widgetPosition" TEXT DEFAULT 'right',
  "widgetVoiceOnly" BOOLEAN NOT NULL DEFAULT false,
  "widgetAutoOpen" BOOLEAN NOT NULL DEFAULT false,
  "widgetGreeting" TEXT,
  "widgetAgentName" TEXT,
  "widgetShowBranding" BOOLEAN NOT NULL DEFAULT true,
  "widgetLogoUrl" TEXT,
  "widgetBorderRadius" TEXT DEFAULT 'full',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Instance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Instance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Instance_tenantId_idx" ON "Instance"("tenantId");

-- Step 2: Add max_instances to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "max_instances" INTEGER NOT NULL DEFAULT 1;

-- Step 3: Add instanceId to Agent
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "instanceId" TEXT;
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Agent_instanceId_idx" ON "Agent"("instanceId");

-- Step 4: Add instanceId to ApiToken
ALTER TABLE "ApiToken" ADD COLUMN IF NOT EXISTS "instanceId" TEXT;
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "ApiToken_instanceId_idx" ON "ApiToken"("instanceId");

-- Step 5: Migrate existing tenant SN connections to Instance records
INSERT INTO "Instance" ("id", "tenantId", "name", "snInstanceUrl", "snUsername", "snPassword",
  "widgetColor", "widgetPosition", "widgetVoiceOnly", "widgetAutoOpen", "widgetGreeting",
  "widgetAgentName", "widgetShowBranding", "widgetLogoUrl", "widgetBorderRadius")
SELECT
  gen_random_uuid()::text,
  t.id,
  COALESCE(t.company, 'Default Instance'),
  t."snInstanceUrl",
  t."snUsername",
  t."snPassword",
  t."widgetColor", t."widgetPosition", t."widgetVoiceOnly", t."widgetAutoOpen", t."widgetGreeting",
  t."widgetAgentName", t."widgetShowBranding", t."widgetLogoUrl", t."widgetBorderRadius"
FROM "Tenant" t
WHERE t."snInstanceUrl" IS NOT NULL AND t."snInstanceUrl" != '';

-- Step 6: Link existing agents to their instance
UPDATE "Agent" a SET "instanceId" = i.id
FROM "Instance" i
WHERE i."tenantId" = a."tenantId";

-- Step 7: Link existing tokens to their instance
UPDATE "ApiToken" t SET "instanceId" = i.id
FROM "Instance" i
WHERE i."tenantId" = t."tenantId";

-- Step 8: Drop old SN credential columns from Tenant (now on Instance)
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "snInstanceUrl";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "snUsername";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "snPassword";

-- Step 9: Drop old widget columns from Tenant (now on Instance)
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetColor";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetPosition";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetVoiceOnly";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetAutoOpen";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetGreeting";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetAgentName";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetShowBranding";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetLogoUrl";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetBorderRadius";
ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "widgetVoice";
