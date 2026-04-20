export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPlan } from '@/lib/plans-db'

/**
 * RevenueCat Webhook Handler
 * Called by RevenueCat whenever a subscription event occurs:
 * - INITIAL_PURCHASE — new subscription
 * - RENEWAL — subscription renewed
 * - CANCELLATION — subscription cancelled (still active until period end)
 * - EXPIRATION — subscription expired (no longer active)
 * - BILLING_ISSUE_DETECTED — payment failed
 * - SUBSCRIBER_ALIAS — customer alias updated
 *
 * Docs: https://www.revenuecat.com/docs/integrations/webhooks
 */
export async function POST(req: Request) {
  // Verify webhook authorization. Fail closed: if the secret isn't configured,
  // refuse all webhook traffic — never accept unauthenticated billing events.
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured on server' },
      { status: 503 }
    )
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const event = body.event

    if (!event) {
      return NextResponse.json({ error: 'No event in payload' }, { status: 400 })
    }

    const eventType = event.type
    const appUserId = event.app_user_id // This is our user ID
    const productId = event.product_id
    const expirationDate = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null

    console.log(`[RevenueCat] Event: ${eventType} for user: ${appUserId}, product: ${productId}`)

    // Find the tenant by RevenueCat customer ID or user ID
    let tenant = await db.tenant.findFirst({
      where: {
        OR: [
          { revenuecat_id: appUserId },
          { user: { id: appUserId } },
          { user: { email: appUserId } },
        ],
      },
    })

    if (!tenant) {
      console.warn(`[RevenueCat] Tenant not found for: ${appUserId}`)
      return NextResponse.json({ status: 'tenant_not_found' })
    }

    // Determine plan from product ID
    const plan = productIdToPlan(productId)

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE': {
        // Activate/update subscription
        const target = await getPlan(plan)
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            plan,
            revenuecat_id: appUserId,
            subscription_id: event.transaction_id || event.id,
            plan_expires_at: expirationDate,
            minutes_per_month: target?.minutesPerMonth ?? 0,
            concurrent_limit: target?.concurrentLimit ?? 1,
            max_agents: target?.maxAgents ?? 1,
          },
        })
        console.log(`[RevenueCat] Activated plan ${plan} for tenant ${tenant.id}`)
        break
      }

      case 'CANCELLATION': {
        // User cancelled but still has access until expiration
        // Don't downgrade yet — just log
        console.log(`[RevenueCat] Cancellation for tenant ${tenant.id}. Expires: ${expirationDate}`)
        break
      }

      case 'EXPIRATION': {
        // Subscription expired — downgrade to FREE
        const freePlan = await getPlan('FREE')
        await db.tenant.update({
          where: { id: tenant.id },
          data: {
            plan: 'FREE',
            subscription_id: null,
            plan_expires_at: null,
            minutes_per_month: freePlan?.minutesPerMonth ?? 50,
            concurrent_limit: freePlan?.concurrentLimit ?? 1,
            max_agents: freePlan?.maxAgents ?? 1,
          },
        })
        console.log(`[RevenueCat] Expired — downgraded tenant ${tenant.id} to FREE`)
        break
      }

      case 'BILLING_ISSUE_DETECTED': {
        // Payment failed — log it, RevenueCat will retry
        console.warn(`[RevenueCat] Billing issue for tenant ${tenant.id}`)
        break
      }

      default:
        console.log(`[RevenueCat] Unhandled event type: ${eventType}`)
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err: any) {
    console.error('[RevenueCat] Webhook error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function productIdToPlan(productId: string): 'FREE' | 'PRO' | 'ENTERPRISE' {
  if (productId?.includes('pro')) return 'PRO'
  if (productId?.includes('enterprise')) return 'ENTERPRISE'
  return 'FREE'
}
