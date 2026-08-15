-- Extends zevox_voice_engine_role (see add_voice_engine_role.sql) for the
-- LiveKit phone-call authorization gate (config/call_gate_zevox.py).
--
-- LiveKit SIP calls never touch the Next.js app at call-setup time, so the
-- plan-gate / allowlist-gate / audit-log checks that used to live in
-- /api/phone/incoming (removed) now run here, against these same tables.

grant select on "PhoneNumber" to zevox_voice_engine_role;
grant select on "Tenant" to zevox_voice_engine_role;
grant select on "AllowedCaller" to zevox_voice_engine_role;
grant select, insert on "AuditLog" to zevox_voice_engine_role;
