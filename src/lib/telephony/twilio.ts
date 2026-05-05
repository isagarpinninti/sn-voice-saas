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
import { ProvisioningNotSupportedError } from './types'

const twilio = require('twilio')

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' } as Record<string, string>)[c]!,
  )
}

export class TwilioProvider implements TelephonyProvider {
  readonly name: TelephonyProviderName = 'twilio'

  validateSignature(req: WebhookRequest): { valid: boolean; reason?: string } {
    if (process.env.TWILIO_SIGNATURE_VALIDATION !== 'true') {
      return { valid: true }
    }
    const token = process.env.TWILIO_AUTH_TOKEN || ''
    if (!token) return { valid: false, reason: 'TWILIO_AUTH_TOKEN missing but validation enabled' }
    const sig = req.headers['x-twilio-signature'] || ''
    const valid: boolean = twilio.validateRequest(token, sig, req.url, req.params)
    return valid ? { valid: true } : { valid: false, reason: 'signature mismatch' }
  }

  parseInboundCall(params: Record<string, string>): InboundCall {
    return {
      providerCallId: (params.CallSid || '').trim(),
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

    switch (msg?.event) {
      case 'connected':
        return { type: 'connected', protocol: msg.protocol }
      case 'start': {
        const streamSid: string = msg.start?.streamSid || msg.streamSid || ''
        const customParameters: Record<string, string> = {}
        const src = msg.start?.customParameters || {}
        for (const [k, v] of Object.entries(src)) {
          customParameters[k] = v == null ? '' : String(v)
        }
        return {
          type: 'start',
          streamSid,
          callId: msg.start?.callSid,
          customParameters,
        }
      }
      case 'media': {
        const streamSid: string = msg.streamSid || ''
        const payload = msg.media?.payload
        if (typeof payload !== 'string') return { type: 'unknown' }
        return { type: 'media', streamSid, audio: Buffer.from(payload, 'base64') }
      }
      case 'stop':
        return { type: 'stop', streamSid: msg.streamSid || '' }
      case 'mark':
        return { type: 'mark', streamSid: msg.streamSid || '', name: msg.mark?.name }
      default:
        return { type: 'unknown' }
    }
  }

  encodeAudioFrame(streamSid: string, audio: Buffer): string {
    return JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: audio.toString('base64') },
    })
  }

  // ── Provisioning (not yet implemented for Twilio — admins buy in console) ──

  async searchAvailableNumbers(_criteria: NumberSearchCriteria): Promise<AvailableNumber[]> {
    throw new ProvisioningNotSupportedError(this.name)
  }
  async purchaseNumber(_e164: string): Promise<PurchasedNumber> {
    throw new ProvisioningNotSupportedError(this.name)
  }
  async bindNumberToApp(_providerNumberId: string): Promise<void> {
    throw new ProvisioningNotSupportedError(this.name)
  }
  async releaseNumber(_providerNumberId: string): Promise<void> {
    throw new ProvisioningNotSupportedError(this.name)
  }

  async startOutboundCall(opts: OutboundCallOptions): Promise<OutboundCall> {
    const sid = process.env.TWILIO_ACCOUNT_SID || ''
    const token = process.env.TWILIO_AUTH_TOKEN || ''
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set')
    const urlWithParams = appendQuery(opts.connectUrl, opts.customParameters)
    const form = new URLSearchParams()
    form.set('To', opts.to)
    form.set('From', opts.from)
    form.set('Url', urlWithParams)
    form.set('Method', 'POST')

    const basicAuth = Buffer.from(`${sid}:${token}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    )
    const text = await res.text()
    let body: any
    try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
    if (!res.ok) {
      const detail = body?.message || body?.detail || `HTTP ${res.status}`
      throw new Error(`Twilio outbound call failed: ${detail}`)
    }
    return { providerCallId: body?.sid || '', to: opts.to, from: opts.from }
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
