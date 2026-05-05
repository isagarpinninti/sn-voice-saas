import { createPublicKey, verify as cryptoVerify } from 'crypto'
import type {
  AvailableNumber,
  InboundCall,
  NumberSearchCriteria,
  OutboundCall,
  OutboundCallOptions,
  ProviderResponse,
  PurchasedNumber,
  StreamEvent,
  StreamResponseOptions,
  TelephonyProvider,
  TelephonyProviderName,
  WebhookRequest,
} from './types'

const TELNYX_API_BASE = 'https://api.telnyx.com/v2'

async function telnyxFetch(path: string, init: RequestInit = {}): Promise<any> {
  const key = process.env.TELNYX_API_KEY || ''
  if (!key) throw new Error('TELNYX_API_KEY is not set')
  const res = await fetch(TELNYX_API_BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let body: any
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || `HTTP ${res.status}`
    throw new Error(`Telnyx ${init.method || 'GET'} ${path} failed: ${detail}`)
  }
  return body
}

// Telnyx webhook signing: Ed25519 over `<timestamp>|<raw_body>`. Public key is
// fetched once from the Telnyx portal (Account → Security) and stored in env.
// Accepts the key as base64 (32 bytes — "raw" Ed25519 public key) or as PEM.
// We wrap the 32-byte form in a minimal DER prefix so Node's crypto.createPublicKey
// can consume it.
const ED25519_DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex') // SPKI prefix for Ed25519
const TELNYX_TIMESTAMP_TOLERANCE_SEC = 5 * 60

function loadPublicKey(raw: string): ReturnType<typeof createPublicKey> | null {
  try {
    const trimmed = raw.trim()
    if (trimmed.startsWith('-----BEGIN')) {
      return createPublicKey({ key: trimmed, format: 'pem' })
    }
    const bytes = Buffer.from(trimmed, 'base64')
    if (bytes.length === 32) {
      return createPublicKey({ key: Buffer.concat([ED25519_DER_PREFIX, bytes]), format: 'der', type: 'spki' })
    }
    // Assume DER-encoded SPKI if not 32 bytes and not PEM
    return createPublicKey({ key: bytes, format: 'der', type: 'spki' })
  } catch {
    return null
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' } as Record<string, string>)[c]!,
  )
}

export class TelnyxProvider implements TelephonyProvider {
  readonly name: TelephonyProviderName = 'telnyx'

  validateSignature(req: WebhookRequest): { valid: boolean; reason?: string } {
    const pubKeyRaw = process.env.TELNYX_PUBLIC_KEY || ''
    if (!pubKeyRaw) {
      // Skip validation when no key configured — mirrors Twilio's dev-mode skip.
      // Production deploys must set TELNYX_PUBLIC_KEY; the health endpoint flags
      // missing keys.
      return { valid: true }
    }
    const sig = req.headers['telnyx-signature-ed25519'] || ''
    const ts = req.headers['telnyx-timestamp'] || ''
    const body = req.headers['x-raw-body'] || '' // route handler stashes raw body here
    if (!sig || !ts) return { valid: false, reason: 'missing telnyx-signature-ed25519 or telnyx-timestamp' }

    const tsNum = Number(ts)
    if (!Number.isFinite(tsNum)) return { valid: false, reason: 'invalid timestamp' }
    const ageSec = Math.abs(Date.now() / 1000 - tsNum)
    if (ageSec > TELNYX_TIMESTAMP_TOLERANCE_SEC) return { valid: false, reason: 'timestamp outside tolerance window' }

    const pubKey = loadPublicKey(pubKeyRaw)
    if (!pubKey) return { valid: false, reason: 'TELNYX_PUBLIC_KEY could not be parsed' }

    const payload = Buffer.from(`${ts}|${body}`, 'utf8')
    const sigBytes = Buffer.from(sig, 'base64')
    try {
      const valid = cryptoVerify(null, payload, pubKey, sigBytes)
      return valid ? { valid: true } : { valid: false, reason: 'signature mismatch' }
    } catch (e: any) {
      return { valid: false, reason: 'verify error: ' + (e?.message || 'unknown') }
    }
  }

  parseInboundCall(params: Record<string, string>): InboundCall {
    // Telnyx TeXML sends Twilio-compatible form fields for inbound call webhooks.
    return {
      providerCallId: (params.CallSid || params.CallSidLegacy || '').trim(),
      to: (params.To || '').trim(),
      from: (params.From || '').trim(),
    }
  }

  buildStreamResponse(opts: StreamResponseOptions): ProviderResponse {
    const paramTags = Object.entries(opts.customParameters || {})
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `      <Parameter name="${escapeXml(k)}" value="${escapeXml(String(v))}" />`)
      .join('\n')

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(opts.wsUrl)}">
${paramTags}
    </Stream>
  </Connect>
</Response>`

    return { contentType: 'text/xml; charset=utf-8', body }
  }

  buildHangupResponse(message: string): ProviderResponse {
    // TeXML supports <Say> + <Hangup/>; Polly voices are honored in Telnyx too.
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Matthew">${escapeXml(message)}</Say><Hangup/></Response>`
    return { contentType: 'text/xml; charset=utf-8', body }
  }

  parseStreamEvent(raw: string | Buffer): StreamEvent {
    let msg: any
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
    } catch {
      return { type: 'unknown' }
    }

    // Telnyx Media Streaming — closely mirrors Twilio but with snake_case keys
    // and `stream_id` instead of `streamSid`.
    switch (msg?.event) {
      case 'connected':
        return { type: 'connected', protocol: msg.version }
      case 'start': {
        const streamSid: string = msg.stream_id || msg.streamId || ''
        const customParameters: Record<string, string> = {}
        // TeXML <Parameter> tags arrive as custom_parameters (with snake_case;
        // some older accounts may use customParameters — accept both).
        const src = msg.start?.custom_parameters || msg.start?.customParameters || {}
        for (const [k, v] of Object.entries(src)) {
          customParameters[k] = v == null ? '' : String(v)
        }
        return {
          type: 'start',
          streamSid,
          callId: msg.start?.call_control_id || msg.start?.call_session_id,
          customParameters,
        }
      }
      case 'media': {
        const streamSid: string = msg.stream_id || ''
        const payload = msg.media?.payload
        if (typeof payload !== 'string') return { type: 'unknown' }
        return { type: 'media', streamSid, audio: Buffer.from(payload, 'base64') }
      }
      case 'stop':
        return { type: 'stop', streamSid: msg.stream_id || '' }
      case 'mark':
        return { type: 'mark', streamSid: msg.stream_id || '', name: msg.mark?.name }
      default:
        return { type: 'unknown' }
    }
  }

  encodeAudioFrame(_streamSid: string, audio: Buffer): string {
    // Telnyx bidirectional media frames omit the stream identifier — the
    // WebSocket connection already uniquely identifies the stream.
    return JSON.stringify({
      event: 'media',
      media: { payload: audio.toString('base64') },
    })
  }

  // ── Provisioning ──

  async searchAvailableNumbers(criteria: NumberSearchCriteria): Promise<AvailableNumber[]> {
    const q = new URLSearchParams()
    q.set('filter[country_code]', criteria.country)
    if (criteria.areaCode) q.set('filter[national_destination_code]', criteria.areaCode)
    if (criteria.contains) q.set('filter[phone_number][contains]', criteria.contains)
    for (const f of criteria.features || ['voice']) q.append('filter[features][]', f)
    q.set('filter[limit]', String(criteria.limit ?? 10))

    const body = await telnyxFetch(`/available_phone_numbers?${q.toString()}`)
    const data: any[] = Array.isArray(body?.data) ? body.data : []
    return data.map((n) => ({
      e164: n.phone_number,
      country: n.country_code || criteria.country,
      features: (n.features || []).map((f: any) => f.name || f),
      monthlyCost: n.cost_information?.monthly_cost,
      upfrontCost: n.cost_information?.upfront_cost,
    }))
  }

  async purchaseNumber(e164: string): Promise<PurchasedNumber> {
    // Order creates the number; it takes effect immediately for phone_number resources.
    const order = await telnyxFetch('/number_orders', {
      method: 'POST',
      body: JSON.stringify({ phone_numbers: [{ phone_number: e164 }] }),
    })
    const orderedPhone = order?.data?.phone_numbers?.[0]
    // Order response carries the phone_number resource id directly, but the
    // documented shape varies — fall back to a lookup by E.164 if missing.
    let providerNumberId: string = orderedPhone?.id || ''
    if (!providerNumberId) {
      const lookup = await telnyxFetch(
        `/phone_numbers?filter%5Bphone_number%5D=${encodeURIComponent(e164)}`,
      )
      providerNumberId = lookup?.data?.[0]?.id || ''
    }
    if (!providerNumberId) {
      throw new Error(`Telnyx purchase succeeded for ${e164} but resource id could not be resolved`)
    }
    return { e164, providerNumberId }
  }

  async bindNumberToApp(providerNumberId: string): Promise<void> {
    const appId = process.env.TELNYX_TEXML_APP_ID || ''
    if (!appId) throw new Error('TELNYX_TEXML_APP_ID is not set — cannot bind number to app')
    await telnyxFetch(`/phone_numbers/${encodeURIComponent(providerNumberId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ connection_id: appId }),
    })
  }

  async releaseNumber(providerNumberId: string): Promise<void> {
    await telnyxFetch(`/phone_numbers/${encodeURIComponent(providerNumberId)}`, {
      method: 'DELETE',
    })
  }

  async startOutboundCall(opts: OutboundCallOptions): Promise<OutboundCall> {
    const appId = process.env.TELNYX_TEXML_APP_ID || ''
    if (!appId) throw new Error('TELNYX_TEXML_APP_ID is not set — cannot place outbound call')
    const urlWithParams = appendQuery(opts.connectUrl, opts.customParameters)
    const form = new URLSearchParams()
    form.set('From', opts.from)
    form.set('To', opts.to)
    form.set('Url', urlWithParams)

    // Telnyx's Twilio-compatible TeXML outbound endpoint. Form-urlencoded (not JSON)
    // to match the Twilio REST API shape.
    const key = process.env.TELNYX_API_KEY || ''
    if (!key) throw new Error('TELNYX_API_KEY is not set')
    const res = await fetch(`${TELNYX_API_BASE}/texml/calls/${encodeURIComponent(appId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const text = await res.text()
    let body: any
    try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
    if (!res.ok) {
      const detail = body?.errors?.[0]?.detail || body?.errors?.[0]?.title || `HTTP ${res.status}`
      throw new Error(`Telnyx outbound call failed: ${detail}`)
    }
    // TeXML-compat response uses Twilio shape: { sid, ... }
    const providerCallId: string = body?.sid || body?.data?.sid || body?.data?.call_control_id || ''
    return { providerCallId, to: opts.to, from: opts.from }
  }
}

function appendQuery(url: string, params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return url
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    u.searchParams.set(k, String(v))
  }
  return u.toString()
}
