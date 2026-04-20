import { db } from './db'
import { PLANS, PlanKey } from './plans'

export type PlanRecord = {
  key: string
  name: string
  price: number
  minutesPerMonth: number
  concurrentLimit: number
  maxAgents: number
  maxInstances: number
  overageRate: number | null
  oneTimeTrial: boolean
  features: string[]
  cta: string
  popular: boolean
  displayOrder: number
  active: boolean
}

let CACHE: { data: Record<string, PlanRecord>; expires: number } | null = null
const TTL_MS = 60_000

function fromHardcoded(): Record<string, PlanRecord> {
  const out: Record<string, PlanRecord> = {}
  const order: Record<string, number> = { FREE: 10, PRO: 20, ENTERPRISE: 30 }
  for (const [key, p] of Object.entries(PLANS)) {
    out[key] = {
      key,
      name: p.name,
      price: p.price,
      minutesPerMonth: p.minutesPerMonth,
      concurrentLimit: p.concurrentLimit,
      maxAgents: p.maxAgents,
      maxInstances: p.maxInstances,
      overageRate: (p as any).overageRate ?? null,
      oneTimeTrial: (p as any).oneTimeTrial ?? false,
      features: [...p.features],
      cta: p.cta,
      popular: (p as any).popular ?? false,
      displayOrder: order[key] ?? 100,
      active: true,
    }
  }
  return out
}

/**
 * Load plans — DB wins over hardcoded. DB misses fall back to PLANS constant,
 * so the app works even before the PlanDefinition table is seeded.
 * 60s in-process cache.
 */
export async function getPlans(options: { bypassCache?: boolean } = {}): Promise<Record<string, PlanRecord>> {
  if (!options.bypassCache && CACHE && CACHE.expires > Date.now()) return CACHE.data

  const hardcoded = fromHardcoded()
  try {
    const rows = await db.planDefinition.findMany({ orderBy: { displayOrder: 'asc' } })
    for (const r of rows) {
      hardcoded[r.key] = {
        key: r.key,
        name: r.name,
        price: r.price,
        minutesPerMonth: r.minutesPerMonth,
        concurrentLimit: r.concurrentLimit,
        maxAgents: r.maxAgents,
        maxInstances: r.maxInstances,
        overageRate: r.overageRate,
        oneTimeTrial: r.oneTimeTrial,
        features: (r.features as string[]) || [],
        cta: r.cta,
        popular: r.popular,
        displayOrder: r.displayOrder,
        active: r.active,
      }
    }
  } catch {
    // Table may not exist yet (pre-migration). Silent fallback to hardcoded.
  }

  CACHE = { data: hardcoded, expires: Date.now() + TTL_MS }
  return hardcoded
}

export async function getPlan(key: PlanKey | string): Promise<PlanRecord | null> {
  const all = await getPlans()
  return all[key] ?? null
}

/**
 * Ordered list of active plans — for pricing page / billing cards.
 */
export async function listActivePlans(): Promise<PlanRecord[]> {
  const all = await getPlans()
  return Object.values(all).filter(p => p.active).sort((a, b) => a.displayOrder - b.displayOrder)
}

export function invalidatePlansCache() {
  CACHE = null
}
