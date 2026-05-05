// Provider-neutral telephony abstraction. Twilio-specific details (TwiML shape,
// `X-Twilio-Signature`, Media Streams JSON envelope) live behind implementations
// of TelephonyProvider; callers deal only in these types.

export type TelephonyProviderName = 'twilio' | 'telnyx' | 'freeswitch'

export interface WebhookRequest {
  url: string
  headers: Record<string, string>
  params: Record<string, string>
}

export interface InboundCall {
  providerCallId: string
  to: string
  from: string
}

export interface StreamResponseOptions {
  wsUrl: string
  customParameters?: Record<string, string>
}

export interface ProviderResponse {
  contentType: string
  body: string
}

export type StreamEvent =
  | { type: 'connected'; protocol?: string }
  | {
      type: 'start'
      streamSid: string
      callId?: string
      customParameters: Record<string, string>
    }
  | { type: 'media'; streamSid: string; audio: Buffer }
  | { type: 'stop'; streamSid: string }
  | { type: 'mark'; streamSid: string; name?: string }
  | { type: 'unknown' }

// ── Provisioning (optional capability) ──
// Providers that can buy / manage numbers via API expose these. Providers that
// don't (Twilio currently, FreeSWITCH always) throw ProvisioningNotSupported.

export interface NumberSearchCriteria {
  country: string // ISO-2, e.g. 'US'
  areaCode?: string // national destination code, e.g. '415'
  contains?: string // digit substring match
  features?: Array<'voice' | 'sms' | 'fax'>
  limit?: number // default 10
}

export interface AvailableNumber {
  e164: string
  country: string
  features: string[]
  monthlyCost?: string
  upfrontCost?: string
}

export interface PurchasedNumber {
  e164: string
  providerNumberId: string // Telnyx phone_number resource id
}

export interface OutboundCallOptions {
  to: string // E.164 target
  from: string // E.164 of our owned number (must be on this provider's account)
  connectUrl: string // URL the provider fetches when the call is answered (returns Connect/Stream TeXML)
  customParameters?: Record<string, string> // encoded into connectUrl as query string
}

export interface OutboundCall {
  providerCallId: string // Telnyx call_control_id or Twilio CallSid
  to: string
  from: string
}

export class ProvisioningNotSupportedError extends Error {
  constructor(provider: string) {
    super(`${provider} provider does not support automatic number provisioning`)
    this.name = 'ProvisioningNotSupportedError'
  }
}

export interface TelephonyProvider {
  readonly name: TelephonyProviderName

  validateSignature(req: WebhookRequest): { valid: boolean; reason?: string }
  parseInboundCall(params: Record<string, string>): InboundCall

  buildStreamResponse(opts: StreamResponseOptions): ProviderResponse
  buildHangupResponse(message: string): ProviderResponse

  parseStreamEvent(raw: string | Buffer): StreamEvent
  encodeAudioFrame(streamSid: string, audio: Buffer): string

  // Provisioning (optional — throw ProvisioningNotSupportedError when unsupported).
  searchAvailableNumbers(criteria: NumberSearchCriteria): Promise<AvailableNumber[]>
  purchaseNumber(e164: string): Promise<PurchasedNumber>
  bindNumberToApp(providerNumberId: string): Promise<void>
  releaseNumber(providerNumberId: string): Promise<void>

  // Outbound calling — initiate a call to `to` from `from`; when answered, the
  // provider fetches `connectUrl` for TeXML that bridges into our media stream.
  startOutboundCall(opts: OutboundCallOptions): Promise<OutboundCall>
}
