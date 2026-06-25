export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { RC_PRODUCTS } from '@/lib/revenuecat'
import { getPlan } from '@/lib/plans-db'

/**
 * Create a checkout session for upgrading/downgrading plans
 *
 * For RevenueCat Web Billing:
 * - We generate a RevenueCat checkout URL
 * - User is redirected to Stripe-powered checkout
 * - On success, RevenueCat fires a webhook back to us
 *
 * For now (before RevenueCat is fully configured):
 * - We provide a direct upgrade path that can be connected to RevenueCat later
 */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await req.json()

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id } })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Handle downgrade to FREE
  if (plan === 'FREE') {
    const free = await getPlan('FREE')
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        plan: 'FREE',
        minutes_per_month: free?.minutesPerMonth ?? 50,
        concurrent_limit: free?.concurrentLimit ?? 1,
        max_agents: free?.maxAgents ?? 1,
        subscription_id: null,
        plan_expires_at: null,
      },
    })
    return NextResponse.json({ message: 'Downgraded to Free plan' })
  }

  // Validate plan — only the active sellable tiers
  const validPlans = ['PRO', 'PREMIUM'] as const
  if (!validPlans.includes(plan as any)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const rcApiKey = process.env.REVENUECAT_API_KEY
  const rcProjectId = process.env.REVENUECAT_PROJECT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (rcApiKey && rcProjectId) {
    // RevenueCat Web Billing — generate checkout URL via API
    try {
      const productId = RC_PRODUCTS[plan as keyof typeof RC_PRODUCTS]

      // Create/get RevenueCat customer
      const customerId = tenant.revenuecat_id || session.user.id

      // Generate checkout session via RevenueCat API
      const rcResponse = await fetch(`https://api.revenuecat.com/v2/projects/${rcProjectId}/customers/${customerId}/checkout_sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${rcApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          success_url: `${appUrl}/dashboard/billing?success=true`,
          cancel_url: `${appUrl}/dashboard/billing?cancelled=true`,
        }),
      })

      if (rcResponse.ok) {
        const rcData = await rcResponse.json()
        // Update tenant with RevenueCat customer ID
        await db.tenant.update({
          where: { id: tenant.id },
          data: { revenuecat_id: customerId },
        })
        return NextResponse.json({ checkoutUrl: rcData.url || rcData.checkout_url })
      }

      // If RevenueCat API fails, fall back to manual upgrade
      console.warn('RevenueCat checkout failed, using manual upgrade')
    } catch (err) {
      console.error('RevenueCat error:', err)
    }
  }

  // Dev-only manual upgrade — ONLY when RevenueCat is not configured AND we're
  // explicitly in development. In production (or any time BILLING_DEV_BYPASS is
  // not 'true'), return a clear error instead of silently granting the plan.
  const allowDevBypass =
    process.env.NODE_ENV !== 'production' &&
    process.env.BILLING_DEV_BYPASS === 'true'

  if (!allowDevBypass) {
    return NextResponse.json(
      {
        error: 'Billing not configured',
        message:
          'Payment integration is not configured on this environment. Set REVENUECAT_API_KEY (and RC_PROJECT_ID) to enable checkout, or set BILLING_DEV_BYPASS=true in a dev environment to skip payment.',
      },
      { status: 503 },
    )
  }

  const target = await getPlan(plan)
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      plan: plan,
      minutes_per_month: target?.minutesPerMonth ?? 0,
      concurrent_limit: target?.concurrentLimit ?? 1,
      max_agents: target?.maxAgents ?? 1,
      plan_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  return NextResponse.json({
    message: `[DEV] Upgraded to ${plan} plan without payment (BILLING_DEV_BYPASS=true).`,
  })
}
