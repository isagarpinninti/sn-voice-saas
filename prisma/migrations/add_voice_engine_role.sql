-- Narrow Postgres role for the forked voice-engine (VoiceConnect merge, Phase 1).
-- Mirrors VoiceConnect's own voice_engine_role pattern (see
-- /Users/sagarpinninti/Projects/VoiceConnect/supabase/migrations/0001_init.sql)
-- adapted for ZeVox's plain (non-Supabase, non-RLS) Postgres: table-level GRANTs
-- are the whole story here, there is no RLS layer in this database.
--
-- Deliberately scoped to only what config/agent_config_zevox.py and
-- config/connectors_config.py (ported from VoiceConnect) touch. Everything
-- else — "User", "Instance" (plaintext snUsername/snPassword today — see M11),
-- "TwilioConnection", "ApiToken", etc. — stays inaccessible to this role by
-- simply never being granted. ("PhoneNumber"/"Tenant"/"AllowedCaller"/
-- "AuditLog" are granted separately in add_voice_engine_role_phone_gate.sql,
-- for the LiveKit phone-call authorization gate.)
--
-- NOLOGIN here deliberately: no password is ever committed to version control.
-- Production sets a LOGIN password out-of-band via a secrets-managed deploy
-- step. Local dev sets one manually (see prisma/README-scratch-db.md) and
-- never commits it.

create role zevox_voice_engine_role nologin noinherit;
grant usage on schema public to zevox_voice_engine_role;

-- Agent config lookup (config/agent_config_zevox.py)
grant select on "Agent" to zevox_voice_engine_role;

-- Connector/tool config lookup (config/connectors_config.py — unchanged from VoiceConnect)
grant select on connectors, connector_tools, agent_connectors to zevox_voice_engine_role;

-- Credential resolution (connectors/credentials.py's ZeVoxEncryptedCredentialResolver, see M4)
grant select on "ConnectorCredential" to zevox_voice_engine_role;

-- Call session persistence (config/call_sessions.py — unchanged from VoiceConnect)
grant select, insert, update on call_sessions to zevox_voice_engine_role;
