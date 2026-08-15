import { z } from "zod";

/**
 * Canonical definition of a single callable "tool" a connector exposes.
 * This is the ONLY shape the LLM tool-calling layer and the admin UI's
 * connector-config form ever see, regardless of which backend platform
 * (HaloITSM, ServiceNow, or any future platform) it targets.
 *
 * ZeVox fork: mirrored from VoiceConnect's packages/connector-schema (see
 * the merge plan) with one change — id/connector_id/tenant_id use
 * z.string().min(1) instead of z.string().uuid(). ZeVox's Prisma ids are
 * cuids, not UUIDs; VoiceConnect's own Supabase ids are real UUIDs, so its
 * copy of this file keeps .uuid(). Keep both in sync for everything else.
 */

export const ParamLocation = z.enum(["path", "query", "body", "header"]);
export type ParamLocation = z.infer<typeof ParamLocation>;

export const ParamType = z.enum(["string", "number", "boolean", "enum"]);
export type ParamType = z.infer<typeof ParamType>;

export const ToolParamSchema = z
  .object({
    name: z.string().min(1),
    location: ParamLocation,
    type: ParamType,
    description: z.string().optional(),
    required: z.boolean().default(false),
    enum_values: z.array(z.string()).optional(),
  })
  .refine((p) => p.type !== "enum" || (p.enum_values && p.enum_values.length > 0), {
    message: "enum params must declare at least one enum_value",
    path: ["enum_values"],
  });
export type ToolParam = z.infer<typeof ToolParamSchema>;

export const AuthConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
  }),
  z.object({
    type: z.literal("api_key"),
    header_name: z.string().min(1),
    credential_ref: z.string().min(1), // e.g. "vault:<connector_id>:<secret_name>"
  }),
  z.object({
    type: z.literal("oauth2_client_credentials"),
    token_url: z.string().url(),
    scope: z.string().optional(),
    credential_ref: z.string().min(1), // resolves to {client_id, client_secret}
  }),
  z.object({
    type: z.literal("basic_auth"),
    credential_ref: z.string().min(1), // resolves to {username, password}
  }),
]);
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export const ResponseMappingSchema = z.object({
  // JMESPath expression evaluated against the parsed JSON response body.
  success_path: z.string().min(1),
  // Template string, e.g. "Ticket #{id} created." — fields resolved from success_path result.
  template: z.string().min(1),
  // Rendered when the HTTP call fails (non-2xx, timeout, network error).
  error_template: z.string().min(1),
});
export type ResponseMapping = z.infer<typeof ResponseMappingSchema>;

export const HttpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const ConnectorToolSchema = z.object({
  id: z.string().min(1).optional(), // absent when defining a new tool client-side
  connector_id: z.string().min(1),
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "tool name must be snake_case, matching LLM function-name rules"),
  description: z.string().min(1).max(500),
  method: HttpMethod,
  path_template: z.string().min(1), // e.g. "/api/Tickets/{ticket_id}"
  params: z.array(ToolParamSchema).default([]),
  body_template: z.record(z.string(), z.unknown()).optional(), // static fields merged into the body
  // Optional: absent means "inherit the connector's own auth" (the common
  // case — most tools on a connector share one auth config). Only set this
  // when a specific tool genuinely needs different credentials/auth than
  // the rest of the connector. See executor.py's `tool.get("auth_override")
  // or connector["auth"]` fallback — that's the runtime half of this contract.
  auth_override: AuthConfigSchema.optional(),
  response_mapping: ResponseMappingSchema,
  timeout_ms: z.number().int().positive().max(30_000).default(8_000),
  enabled: z.boolean().default(true),
});
export type ConnectorTool = z.infer<typeof ConnectorToolSchema>;

export const ConnectorSchema = z.object({
  id: z.string().min(1).optional(),
  tenant_id: z.string().min(1),
  platform: z.string().min(1), // free-form: "halo_itsm", "servicenow", future platforms
  name: z.string().min(1),
  base_url: z.string().url(),
  auth: AuthConfigSchema, // default/inherited auth; individual tools may override
  tools: z.array(ConnectorToolSchema).default([]),
});
export type Connector = z.infer<typeof ConnectorSchema>;

/** Params exposed to the LLM never include header/auth-injected params — see litellm_tools mapping (voice-engine). */
export function llmVisibleParams(tool: ConnectorTool): ToolParam[] {
  return tool.params.filter((p) => p.location !== "header");
}
