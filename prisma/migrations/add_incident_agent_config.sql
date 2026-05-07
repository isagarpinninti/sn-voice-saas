CREATE TABLE IF NOT EXISTS "IncidentAgentConfig" (
    "id"                   TEXT NOT NULL,
    "tenantId"             TEXT NOT NULL,
    "llmModel"             TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    "llmTemperature"       DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "llmMaxTokens"         INTEGER NOT NULL DEFAULT 600,
    "sttModel"             TEXT NOT NULL DEFAULT 'nova-3',
    "sttLanguage"          TEXT NOT NULL DEFAULT 'multi',
    "ttsVoice"             TEXT NOT NULL DEFAULT 'aura-asteria-en',
    "agentName"            TEXT NOT NULL DEFAULT 'AI Voice Agent',
    "agentSubtitle"        TEXT NOT NULL DEFAULT 'Incident Co-Agent • Powered by AI',
    "systemPrompt"         TEXT,
    "greetingTemplate"     TEXT,
    "toolUpdateField"      BOOLEAN NOT NULL DEFAULT true,
    "toolSuggestResolution" BOOLEAN NOT NULL DEFAULT true,
    "toolSuggestReply"     BOOLEAN NOT NULL DEFAULT true,
    "toolSearchIncidents"  BOOLEAN NOT NULL DEFAULT true,
    "toolSearchKb"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentAgentConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IncidentAgentConfig_tenantId_key" ON "IncidentAgentConfig"("tenantId");

ALTER TABLE "IncidentAgentConfig"
    ADD CONSTRAINT "IncidentAgentConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
