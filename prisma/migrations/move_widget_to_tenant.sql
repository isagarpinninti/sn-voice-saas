-- Move widget customization from Agent to Tenant (one widget per instance)
-- Run this against your database before deploying the new code.

-- Step 1: Add widget columns to Tenant (copy defaults from Agent schema)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetColor" TEXT DEFAULT '#10b981';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetPosition" TEXT DEFAULT 'right';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetVoiceOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetAutoOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetGreeting" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetAgentName" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetShowBranding" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetLogoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetBorderRadius" TEXT DEFAULT 'full';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "widgetVoice" TEXT DEFAULT 'aura-asteria-en';

-- Step 2: Copy widget config from each tenant's first agent (preserve existing customizations)
UPDATE "Tenant" t SET
  "widgetColor" = a."widgetColor",
  "widgetPosition" = a."widgetPosition",
  "widgetVoiceOnly" = a."widgetVoiceOnly",
  "widgetAutoOpen" = a."widgetAutoOpen",
  "widgetGreeting" = a."widgetGreeting",
  "widgetAgentName" = a."widgetAgentName",
  "widgetShowBranding" = a."widgetShowBranding",
  "widgetLogoUrl" = a."widgetLogoUrl",
  "widgetBorderRadius" = a."widgetBorderRadius",
  "widgetVoice" = a."widgetVoice"
FROM "Agent" a
WHERE a."tenantId" = t.id
  AND a.id = (SELECT id FROM "Agent" WHERE "tenantId" = t.id ORDER BY "createdAt" ASC LIMIT 1);

-- Step 3: Drop widget columns from Agent
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetColor";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetPosition";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetVoiceOnly";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetAutoOpen";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetGreeting";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetAgentName";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetShowBranding";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetLogoUrl";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetBorderRadius";
ALTER TABLE "Agent" DROP COLUMN IF EXISTS "widgetVoice";
