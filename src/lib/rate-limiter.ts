import { db } from './db'
import { getPlan } from './plans-db'

/**
 * Check if a tenant can start a new call based on their plan limits
 * Free plan: 50 minutes TOTAL (one-time, not recurring)
 * Paid plans: minutes reset monthly
 */
export async function checkRateLimit(tenantId: string): Promise<{
  allowed: boolean
  reason?: string
  usage?: { minutes: number; limit: number }
}> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      usageLogs: true, // Get ALL logs for free plan (lifetime check)
    },
  })

  if (!tenant) return { allowed: false, reason: 'Tenant not found' }

  if (tenant.plan !== 'FREE' && tenant.plan_expires_at && tenant.plan_expires_at < new Date()) {
    return { allowed: false, reason: 'Subscription expired' }
  }

  const plan = await getPlan(tenant.plan)
  const limit = tenant.minutes_per_month || plan?.minutesPerMonth || 0

  let usedMinutes: number

  if (tenant.plan === 'FREE') {
    // Free plan: check TOTAL lifetime minutes (one-time 50 min)
    usedMinutes = tenant.usageLogs.reduce((sum, log) => sum + log.minutes, 0)
  } else {
    // Paid plans: check current month only
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    usedMinutes = tenant.usageLogs
      .filter(log => new Date(log.date) >= monthStart)
      .reduce((sum, log) => sum + log.minutes, 0)
  }

  if (usedMinutes >= limit) {
    if (tenant.plan === 'FREE') {
      return {
        allowed: false,
        reason: 'Your free trial of 50 minutes has been used. Upgrade to Pro for 500 minutes per month.',
        usage: { minutes: Math.round(usedMinutes * 10) / 10, limit },
      }
    }
    if (!plan?.overageRate) {
      return { allowed: false, reason: 'Monthly minute limit reached.', usage: { minutes: Math.round(usedMinutes * 10) / 10, limit } }
    }
  }

  return { allowed: true, usage: { minutes: Math.round(usedMinutes * 10) / 10, limit } }
}

/**
 * Record usage after a call
 */
export async function recordUsage(tenantId: string, minutes: number, inputTokens: number, outputTokens: number, toolCalls: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  await db.usageLog.upsert({
    where: { tenantId_date: { tenantId, date: today } },
    update: {
      calls: { increment: 1 },
      minutes: { increment: minutes },
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
      toolCalls: { increment: toolCalls },
    },
    create: {
      tenantId,
      date: today,
      calls: 1,
      minutes,
      inputTokens,
      outputTokens,
      toolCalls,
    },
  })
}
