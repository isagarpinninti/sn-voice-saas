"""Phone-call authorization gate for the LiveKit path.

Ports the plan-gate / allowlist-gate / audit-log logic that used to live in
`/api/phone/incoming` (Twilio Media Streams webhook, now removed). LiveKit
SIP calls never touch ZeVox's Next.js app at call-setup time — the carrier's
SIP trunk connects straight into livekit-sip — so this check has to happen
here, against the same Postgres tables, before the bot joins the room.

Queries the same tables the Next.js route did (PhoneNumber, Tenant,
AllowedCaller, AuditLog). "Tenant" and friends are unmapped Prisma models
(see M1), so columns are Postgres-default-cased and must be double-quoted.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from voice_engine.config.db import get_pool

# PREMIUM is the active phone-eligible tier; PRO_VOICE/ENTERPRISE remain for
# legacy tenants who haven't migrated. Mirrors VOICE_AGENT_PLANS in the
# (removed) /api/phone/incoming route.
PHONE_ELIGIBLE_PLANS = {"PREMIUM", "PRO_VOICE", "ENTERPRISE"}


@dataclass
class CallerContext:
    name: str | None
    email: str | None
    employee_id: str | None
    sn_user_sys_id: str | None


@dataclass
class CallAuthorization:
    allowed: bool
    reason: str | None
    phone_id: str | None
    tenant_id: str | None
    instance_id: str | None
    caller: CallerContext | None


async def authorize_call(to_e164: str, from_e164: str, call_id: str) -> CallAuthorization:
    pool = await get_pool()
    async with pool.acquire() as conn:
        phone = await conn.fetchrow(
            """
            select p.id, p."tenantId", p."instanceId", p.active,
                   t.plan, t.plan_expires_at
            from "PhoneNumber" p
            join "Tenant" t on t.id = p."tenantId"
            where p.e164 = $1
            """,
            to_e164,
        )

        if phone is None or not phone["active"]:
            return await _reject(conn, None, None, "number_inactive", to_e164, from_e164, call_id)

        tenant_id = phone["tenantId"]

        if phone["plan"] not in PHONE_ELIGIBLE_PLANS:
            return await _reject(conn, phone["id"], tenant_id, "plan_not_phone_eligible", to_e164, from_e164, call_id, plan=phone["plan"])

        if phone["plan_expires_at"] is not None:
            import datetime

            if phone["plan_expires_at"] < datetime.datetime.now(datetime.timezone.utc):
                return await _reject(conn, phone["id"], tenant_id, "subscription_expired", to_e164, from_e164, call_id)

        allowlist_count = await conn.fetchval(
            'select count(*) from "AllowedCaller" where "tenantId" = $1 and active = true',
            tenant_id,
        )

        caller = None
        if allowlist_count and allowlist_count > 0:
            row = await conn.fetchrow(
                """
                select name, email, "employeeId", "snUserSysId"
                from "AllowedCaller"
                where "tenantId" = $1 and active = true and "phoneE164" = $2
                """,
                tenant_id,
                from_e164,
            )
            if row is None:
                return await _reject(conn, phone["id"], tenant_id, "caller_not_on_allowlist", to_e164, from_e164, call_id)
            caller = CallerContext(
                name=row["name"], email=row["email"],
                employee_id=row["employeeId"], sn_user_sys_id=row["snUserSysId"],
            )

        await conn.execute(
            """
            insert into "AuditLog" (id, "tenantId", "actorType", action, "targetType", "targetId", metadata)
            values ($1, $2, 'system', 'phone.call.accepted', 'PhoneNumber', $3, $4)
            """,
            f"c{uuid.uuid4().hex[:24]}",
            tenant_id,
            phone["id"],
            json.dumps({
                "from": from_e164, "to": to_e164, "callId": call_id,
                "callerName": caller.name if caller else None,
                "callerEmployeeId": caller.employee_id if caller else None,
                "allowlistMode": "enforced" if allowlist_count else "open",
            }),
        )

        return CallAuthorization(
            allowed=True, reason=None, phone_id=phone["id"], tenant_id=tenant_id,
            instance_id=phone["instanceId"], caller=caller,
        )


async def _reject(conn, phone_id, tenant_id, reason, to_e164, from_e164, call_id, **extra_metadata) -> CallAuthorization:
    if tenant_id is not None:
        await conn.execute(
            """
            insert into "AuditLog" (id, "tenantId", "actorType", action, "targetType", "targetId", metadata)
            values ($1, $2, 'system', 'phone.call.rejected', 'PhoneNumber', $3, $4)
            """,
            f"c{uuid.uuid4().hex[:24]}",
            tenant_id,
            phone_id,
            json.dumps({"reason": reason, "from": from_e164, "to": to_e164, "callId": call_id, **extra_metadata}),
        )
    return CallAuthorization(
        allowed=False, reason=reason, phone_id=phone_id, tenant_id=tenant_id,
        instance_id=None, caller=None,
    )
