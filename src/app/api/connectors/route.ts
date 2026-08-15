export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createConnectorCredential } from '@/lib/connector-credentials'
import { AuthConfigSchema } from '@connector-schema'

async function getTenant(userId: string) {
  return db.tenant.findUnique({ where: { userId } })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenant = await getTenant(session.user.id)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const connectors = await db.connector.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { tools: true } } },
  })

  return NextResponse.json({
    connectors: connectors.map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      baseUrl: c.baseUrl,
      authType: (c.authConfig as { type?: string })?.type || 'none',
      toolCount: c._count.tools,
      createdAt: c.createdAt,
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenant = await getTenant(session.user.id)
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const name = String(body.name || '').trim()
  const platform = String(body.platform || '').trim()
  const baseUrl = String(body.baseUrl || '').trim()
  const authType = String(body.authType || 'none')

  if (!name || !platform || !baseUrl) {
    return NextResponse.json({ error: 'Name, platform, and base URL are required' }, { status: 400 })
  }
  try {
    new URL(baseUrl)
  } catch {
    return NextResponse.json({ error: 'Base URL must be a valid URL' }, { status: 400 })
  }

  let authConfig: Record<string, unknown>
  let secretValue: string | null = null
  let credentialKind = ''

  if (authType === 'none') {
    authConfig = { type: 'none' }
  } else if (authType === 'api_key') {
    const headerName = String(body.headerName || '').trim()
    const apiKey = String(body.apiKey || '').trim()
    if (!headerName || !apiKey) return NextResponse.json({ error: 'Header name and API key are required' }, { status: 400 })
    authConfig = { type: 'api_key', header_name: headerName }
    secretValue = apiKey
    credentialKind = 'api_key'
  } else if (authType === 'basic_auth') {
    const username = String(body.username || '').trim()
    const password = String(body.password || '').trim()
    if (!username || !password) return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    authConfig = { type: 'basic_auth' }
    secretValue = JSON.stringify({ username, password })
    credentialKind = 'basic_auth'
  } else if (authType === 'oauth2_client_credentials') {
    const tokenUrl = String(body.tokenUrl || '').trim()
    const clientId = String(body.clientId || '').trim()
    const clientSecret = String(body.clientSecret || '').trim()
    if (!tokenUrl || !clientId || !clientSecret) {
      return NextResponse.json({ error: 'Token URL, client ID, and client secret are required' }, { status: 400 })
    }
    authConfig = { type: 'oauth2_client_credentials', token_url: tokenUrl }
    secretValue = JSON.stringify({ client_id: clientId, client_secret: clientSecret })
    credentialKind = 'oauth2_client_secret'
  } else {
    return NextResponse.json({ error: 'Unsupported auth type' }, { status: 400 })
  }

  if (secretValue !== null) {
    authConfig.credential_ref = await createConnectorCredential(tenant.id, credentialKind, secretValue)
  }

  const parsedAuth = AuthConfigSchema.safeParse(authConfig)
  if (!parsedAuth.success) {
    return NextResponse.json({ error: `Invalid auth config: ${parsedAuth.error.issues[0]?.message}` }, { status: 400 })
  }

  const connector = await db.connector.create({
    data: { tenantId: tenant.id, name, platform, baseUrl, authConfig: parsedAuth.data },
  })

  return NextResponse.json({ id: connector.id })
}
