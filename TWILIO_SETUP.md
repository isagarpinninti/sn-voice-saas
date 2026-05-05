# Twilio Phone Call Setup

End-to-end guide to turn the **Premium** tier on for a tenant. Currently MVP (v1-a): one phone number → one agent per tenant, no DTMF menus, inbound only.

## How it works

```
Caller dials +1-XXX-XXX-XXXX
  → Twilio POSTs to https://zevox-production.up.railway.app/api/phone/incoming
  → That webhook looks up the number, checks the tenant is on PREMIUM (or legacy PRO_VOICE/ENTERPRISE),
    and returns TwiML: <Connect><Stream url="wss://.../phone?phoneId=..."/>
  → Twilio opens a Media Streams WebSocket to our server
  → Our /phone handler bridges mulaw@8kHz audio into VoicePipeline
    (same pipeline the widget uses; Deepgram Nova-3 STT, Aura TTS, LLM loop)
  → Agent audio streams back to Twilio → caller hears the agent
```

## One-time account setup

### 1. Create a Twilio account
- Sign up at https://www.twilio.com/try-twilio
- Trial credit ($15) is enough to buy a number and run ~1,000 minutes

### 2. Add Twilio env vars to the `zevox` Railway service
*(Not the admin service — phone webhooks hit the user deploy.)*

```
TWILIO_ACCOUNT_SID=ACf4911df3d75d7bfb7cd8a89823266ffb
TWILIO_AUTH_TOKEN=db37881eb45d6936ceee45a49fd6f382
TWILIO_SIGNATURE_VALIDATION=true
```

**Do this via Railway dashboard → `zevox` service → Variables.** After saving, Railway will redeploy automatically.

`TWILIO_SIGNATURE_VALIDATION=true` enforces that incoming webhooks are signed by Twilio — prevents anyone from spoofing `/api/phone/incoming` to drain your minutes. Leave it off for initial local testing only.

## Per-number provisioning

### 3. Buy a phone number in Twilio

1. Twilio console → **Phone Numbers** → **Buy a number**
2. Filter: Country, capabilities = Voice
3. Buy one (~$1/month + per-minute usage)

### 4. Configure the Voice webhook on that number

1. Click the number in the Twilio console
2. Under **Voice Configuration**:
   - **A Call Comes In:** `Webhook`
   - **URL:** `https://zevox-production.up.railway.app/api/phone/incoming`
   - **Method:** `HTTP POST`
3. **Save**

### 5. Register the number in our admin console

1. Visit https://sn-voice-admin-production.up.railway.app/admin/phone-numbers
2. Click **Add number** and fill in:
   - **E.164:** `+14155550123` (the number you bought, with country code and +)
   - **Friendly name:** whatever helps you identify it
   - **Tenant ID:** paste from ⌘K search or `/admin/tenants`
   - **Agent:** pick the specific agent to bind this number to (or leave blank for orchestrator to decide)
   - **Twilio PN SID:** optional, from Twilio console (starts with `PN`)
3. **Add phone number**

The backend checks the tenant is on `PREMIUM` (or legacy `PRO_VOICE` / `ENTERPRISE`) — otherwise the row won't save.

## Testing

### End-to-end call test

1. Dial the number from any phone
2. Agent should greet you within ~1 second
3. Check:
   - `/admin/audit?action=phone.call` — `phone.call.accepted` event
   - `/admin/tenants/<id>` — Recent activity shows the call
   - `/admin/usage` — minutes tick up after hangup

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Call rings forever, no answer | Twilio webhook URL wrong, or webhook returning 4xx/5xx. Check Twilio console → Phone Numbers → your number → Request inspector. |
| Agent hangs up immediately | Tenant isn't on `PREMIUM` (or legacy `PRO_VOICE`/`ENTERPRISE`). Check the audit log — you'll see `phone.call.rejected` with the reason. |
| "Service unavailable" recorded voice | `TWILIO_AUTH_TOKEN` missing but `TWILIO_SIGNATURE_VALIDATION=true`. Set the token. |
| "Your ServiceNow instance is not configured" | The bound instance has no `snInstanceUrl`. Fix under `/dashboard/connection`. |
| Audio drops out or is garbled | Usually Deepgram STT having trouble with mulaw@8kHz. Check `/admin/logs` for `stt` errors. |
| Webhook returns 403 (in Twilio request inspector) | Signature validation failing. Confirm `TWILIO_AUTH_TOKEN` matches what's in Twilio, and that the request is actually coming from Twilio (not a replay). |

## Cost estimate

At current Twilio retail:
- Phone number: ~$1/month
- Inbound minutes: ~$0.013/minute
- Plus our pipeline costs (Deepgram STT+TTS + LLM)

Premium plan = $199/mo includes 2,000 min. At 2,000 min of inbound calls, Twilio cost alone = ~$27. Margin above that + STT/TTS/LLM costs is what funds the tier.

## What's NOT in this MVP (v1-a)

- **Multiple numbers per tenant** — one number → one agent is the shape. You can add multiple rows per tenant; first match by E.164 wins.
- **DTMF menus** — "press 1 for billing" not yet wired. Add in v1-b.
- **Outbound calls** — agent can't initiate calls yet. Planned for v1-c.
- **Call recording / transcripts** — audit log captures metadata only. Audio isn't persisted. Planned for v1-c.
- **Automated number provisioning** — we use Twilio manually. Self-service buy flow is Phase 2.
