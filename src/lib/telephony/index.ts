import { TwilioProvider } from './twilio'
import { TelnyxProvider } from './telnyx'
import type { TelephonyProvider, TelephonyProviderName } from './types'

const cache: Partial<Record<TelephonyProviderName, TelephonyProvider>> = {}

function instantiate(name: TelephonyProviderName): TelephonyProvider {
  switch (name) {
    case 'twilio':
      return new TwilioProvider()
    case 'telnyx':
      return new TelnyxProvider()
    case 'freeswitch':
      // Placeholder — Phase 3 lands FreeSWITCH-on-SIP-trunk. Until then,
      // selecting this name falls back to Twilio so misconfigured deploys
      // still service calls.
      return new TwilioProvider()
  }
}

export function getTelephonyProvider(name?: TelephonyProviderName): TelephonyProvider {
  const resolved: TelephonyProviderName =
    name ||
    ((process.env.TELEPHONY_PROVIDER || '').trim().toLowerCase() as TelephonyProviderName) ||
    'twilio'
  const final: TelephonyProviderName =
    resolved === 'twilio' || resolved === 'telnyx' || resolved === 'freeswitch' ? resolved : 'twilio'
  if (!cache[final]) cache[final] = instantiate(final)
  return cache[final]!
}

// Detect the provider that sent this request. Used on the inbound webhook so
// both providers can target the same endpoint and self-identify by their
// signature header. Falls back to TELEPHONY_PROVIDER env / twilio default.
export function detectTelephonyProvider(
  headers: Record<string, string>,
): TelephonyProvider {
  const lower = (k: string) => headers[k] || headers[k.toLowerCase()] || ''
  if (lower('telnyx-signature-ed25519')) return getTelephonyProvider('telnyx')
  if (lower('x-twilio-signature')) return getTelephonyProvider('twilio')
  return getTelephonyProvider()
}

export type {
  InboundCall,
  ProviderResponse,
  StreamEvent,
  StreamResponseOptions,
  TelephonyProvider,
  TelephonyProviderName,
  WebhookRequest,
} from './types'
