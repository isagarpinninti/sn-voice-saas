export const PLANS = {
  FREE: {
    name: 'Free Trial',
    price: 0,
    minutesPerMonth: 50,
    oneTimeTrial: true,
    concurrentLimit: 1,
    maxAgents: 1,
    maxInstances: 1,
    overageRate: null,
    features: [
      '50 minutes total (one-time)',
      '1 ServiceNow instance',
      '1 voice agent',
      'Neural STT + TTS included',
      'ServiceNow tool execution',
      'Basic analytics',
    ],
    cta: 'Start free trial',
  },
  PRO: {
    name: 'Pro',
    price: 79,
    minutesPerMonth: 500,
    concurrentLimit: 5,
    maxAgents: 5,
    maxInstances: 3,
    overageRate: 0.15,
    popular: true,
    features: [
      '500 minutes per month',
      '3 ServiceNow instances',
      '5 voice agents',
      'All premium TTS voices',
      'Cross-session memory',
      'KB search integration',
      'Full analytics dashboard',
      'Priority email support',
    ],
    cta: 'Get started',
  },
  PREMIUM: {
    name: 'Premium',
    price: 199,
    minutesPerMonth: 2000,
    concurrentLimit: 25,
    maxAgents: -1,
    maxInstances: -1,
    overageRate: 0.10,
    features: [
      '2,000 minutes per month',
      'Dedicated inbound phone number',
      'Unlimited instances and agents',
      'BYOK TTS & STT option',
      'Cross-session memory + KB search',
      'Advanced guardrails & compliance',
      'SLA guarantee (99.9%)',
      'Priority support + onboarding',
    ],
    cta: 'Get started',
  },
} as const

export type PlanKey = keyof typeof PLANS

// Plans that include the dedicated inbound phone number feature.
// Includes legacy PRO_VOICE/ENTERPRISE so existing tenants keep working.
export const PHONE_ELIGIBLE_PLANS = new Set(['PREMIUM', 'PRO_VOICE', 'ENTERPRISE'])
