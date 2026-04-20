export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { listActivePlans } from '@/lib/plans-db'

/**
 * Public GET — plan cards for landing / billing pages.
 */
export async function GET() {
  const plans = await listActivePlans()
  return NextResponse.json({ plans })
}
