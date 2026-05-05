import { Purchases } from '@revenuecat/purchases-js'

export const RC_PRODUCTS = {
  PRO: 'zevox_pro_monthly',
  PREMIUM: 'zevox_premium_monthly',
} as const

export const PLAN_LIMITS = {
  FREE: { minutes: 50, concurrent: 1, agents: 1 },
  PRO: { minutes: 500, concurrent: 5, agents: 5 },
  PREMIUM: { minutes: 2000, concurrent: 25, agents: -1 },
} as const

export function initRevenueCat(userId: string) {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY
  if (!apiKey) return null
  return Purchases.configure(apiKey, userId)
}

export async function getOfferings(rc: Purchases) {
  try {
    const offerings = await rc.getOfferings()
    return offerings.current?.availablePackages || []
  } catch { return [] }
}

export async function purchasePackage(rc: Purchases, pkg: any) {
  try {
    const result = await rc.purchase({ rcPackage: pkg })
    return { success: true, customerInfo: result.customerInfo }
  } catch (err: any) {
    if (err.userCancelled) return { success: false, cancelled: true }
    return { success: false, error: err.message }
  }
}
