import { TwilioProvider } from './twilio'
import type { TelephonyProvider, TelephonyProviderName } from './types'

const cache: Partial<Record<TelephonyProviderName, TelephonyProvider>> = {}

function instantiate(name: TelephonyProviderName): TelephonyProvider {
  switch (name) {
    case 'twilio':
    case 'freeswitch':
      return new TwilioProvider()
  }
}

export function getTelephonyProvider(name?: TelephonyProviderName): TelephonyProvider {
  const resolved: TelephonyProviderName =
    name ||
    ((process.env.TELEPHONY_PROVIDER || '').trim().toLowerCase() as TelephonyProviderName) ||
    'twilio'
  const final: TelephonyProviderName =
    resolved === 'freeswitch' ? 'freeswitch' : 'twilio'
  if (!cache[final]) cache[final] = instantiate(final)
  return cache[final]!
}

export function detectTelephonyProvider(
  headers: Record<string, string>,
): TelephonyProvider {
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
