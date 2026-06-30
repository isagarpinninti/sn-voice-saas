export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { db } from '@/lib/db'

type Check = {
  name: string
  category: 'storage' | 'voice' | 'llm' | 'billing' | 'auth' | 'telephony'
  status: 'ok' | 'warn' | 'error'
  latencyMs?: number
  detail: string
}

async function pingDb(): Promise<Check> {
  const start = Date.now()
  try {
    await db.$queryRawUnsafe('SELECT 1')
    const latency = Date.now() - start
    return {
      name: 'Postgres',
      category: 'storage',
      status: latency < 500 ? 'ok' : 'warn',
      latencyMs: latency,
      detail: latency < 500 ? 'Connected' : 'Slow response',
    }
  } catch (err) {
    return {
      name: 'Postgres',
      category: 'storage',
      status: 'error',
      detail: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

function envCheck(
  name: string,
  category: Check['category'],
  envKey: string,
  required = true,
): Check {
  const present = !!process.env[envKey]
  if (present) return { name, category, status: 'ok', detail: 'Configured' }
  return {
    name,
    category,
    status: required ? 'error' : 'warn',
    detail: required ? `Missing ${envKey}` : `${envKey} not set (optional)`,
  }
}

async function countRecent(): Promise<Check> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const rows = await db.usageLog.count({ where: { date: { gte: since } } })
    return {
      name: 'Usage ingest (24h)',
      category: 'storage',
      status: 'ok',
      detail: `${rows} usage rows written`,
    }
  } catch (err) {
    return {
      name: 'Usage ingest (24h)',
      category: 'storage',
      status: 'error',
      detail: err instanceof Error ? err.message : 'Query failed',
    }
  }
}

export async function GET() {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const checks: Check[] = await Promise.all([
    pingDb(),
    countRecent(),
    Promise.resolve(envCheck('Deepgram STT+TTS', 'voice', 'DEEPGRAM_API_KEY')),
    Promise.resolve(envCheck('OpenAI LLM', 'llm', 'OPENAI_API_KEY', false)),
    Promise.resolve(envCheck('Groq LLM', 'llm', 'GROQ_API_KEY', false)),
    Promise.resolve(envCheck('RevenueCat webhook', 'billing', 'REVENUECAT_WEBHOOK_SECRET', false)),
    Promise.resolve(envCheck('Razorpay', 'billing', 'RAZORPAY_KEY_ID', false)),
    Promise.resolve(envCheck('NextAuth secret', 'auth', 'NEXTAUTH_SECRET')),
    Promise.resolve(envCheck('Google OAuth', 'auth', 'GOOGLE_CLIENT_ID', false)),
    Promise.resolve(
      (() => {
        const selected = (process.env.TELEPHONY_PROVIDER || 'twilio').trim().toLowerCase()
        return {
          name: 'Active telephony provider',
          category: 'telephony' as const,
          status: 'ok' as const,
          detail: selected + ' (auto-detected from webhook headers; env default = ' + selected + ')',
        }
      })(),
    ),
    Promise.resolve(envCheck('Twilio account', 'telephony', 'TWILIO_ACCOUNT_SID', false)),
    Promise.resolve(envCheck('Twilio auth token', 'telephony', 'TWILIO_AUTH_TOKEN', false)),
    Promise.resolve(
      process.env.TWILIO_SIGNATURE_VALIDATION === 'true'
        ? { name: 'Twilio signature validation', category: 'telephony' as const, status: 'ok' as const, detail: 'Enforced' }
        : { name: 'Twilio signature validation', category: 'telephony' as const, status: 'warn' as const, detail: 'Disabled (set TWILIO_SIGNATURE_VALIDATION=true in production)' },
    ),
  ])

  const overall: Check['status'] = checks.some((c) => c.status === 'error')
    ? 'error'
    : checks.some((c) => c.status === 'warn')
    ? 'warn'
    : 'ok'

  return NextResponse.json({
    overall,
    checkedAt: new Date().toISOString(),
    checks,
  })
}
