export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createConnectorCredential, updateConnectorCredential } from '@/lib/connector-credentials'
import { AuthConfigSchema } from '@connector-schema'

type RouteContext = { params: Promise<{ id: string }> }

async function loadOwnedConnector(userId: string, connectorId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const connector = await db.connector.findFirst({
    where: { id: connectorId, tenantId: tenant.id },
    include: { tools: { orderBy: { createdAt: 'asc' } } },
  })
  return connector ? { tenant, connector } : null
}

export async function GET(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedConnector(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { connector } = owned
  return NextResponse.json({
    id: connector.id,
    name: connector.name,
    platform: connector.platform,
    baseUrl: connector.baseUrl,
    authType: (connector.authConfig as { type?: string })?.type || 'none',
    tools: connector.tools.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      method: t.method,
      pathTemplate: t.pathTemplate,
      params: t.params,
      bodyTemplate: t.bodyTemplate,
      responseMapping: t.responseMapping,
      timeoutMs: t.timeoutMs,
      enabled: t.enabled,
    })),
  })
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedConnector(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { tenant, connector } = owned

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.platform === 'string' && body.platform.trim()) data.platform = body.platform.trim()
  if (typeof body.baseUrl === 'string' && body.baseUrl.trim()) {
    try {
      new URL(body.baseUrl)
    } catch {
      return NextResponse.json({ error: 'Base URL must be a valid URL' }, { status: 400 })
    }
    data.baseUrl = body.baseUrl.trim()
  }

  // Re-authing (authType present) replaces the whole auth_config, same rules as create.
  if (typeof body.authType === 'string') {
    const authType = body.authType
    const existingAuth = connector.authConfig as Record<string, unknown>
    let authConfig: Record<string, unknown>
    let secretValue: string | null = null
    let credentialKind = ''

    if (authType === 'none') {
      authConfig = { type: 'none' }
    } else if (authType === 'api_key') {
      const headerName = String(body.headerName || '').trim()
      if (!headerName) return NextResponse.json({ error: 'Header name is required' }, { status: 400 })
      authConfig = { type: 'api_key', header_name: headerName }
      if (body.apiKey) { secretValue = String(body.apiKey).trim(); credentialKind = 'api_key' }
    } else if (authType === 'basic_auth') {
      authConfig = { type: 'basic_auth' }
      if (body.username || body.password) {
        if (!body.username || !body.password) return NextResponse.json({ error: 'Username and password are both required to update credentials' }, { status: 400 })
        secretValue = JSON.stringify({ username: String(body.username).trim(), password: String(body.password).trim() })
        credentialKind = 'basic_auth'
      }
    } else if (authType === 'oauth2_client_credentials') {
      const tokenUrl = String(body.tokenUrl || '').trim()
      if (!tokenUrl) return NextResponse.json({ error: 'Token URL is required' }, { status: 400 })
      authConfig = { type: 'oauth2_client_credentials', token_url: tokenUrl }
      if (body.clientId || body.clientSecret) {
        if (!body.clientId || !body.clientSecret) return NextResponse.json({ error: 'Client ID and secret are both required to update credentials' }, { status: 400 })
        secretValue = JSON.stringify({ client_id: String(body.clientId).trim(), client_secret: String(body.clientSecret).trim() })
        credentialKind = 'oauth2_client_secret'
      }
    } else {
      return NextResponse.json({ error: 'Unsupported auth type' }, { status: 400 })
    }

    const existingRef = typeof existingAuth.credential_ref === 'string' ? existingAuth.credential_ref : null
    const sameAuthType = existingAuth.type === authType

    if (secretValue !== null) {
      if (existingRef && sameAuthType && existingRef.startsWith('local:')) {
        await updateConnectorCredential(existingRef.slice('local:'.length), tenant.id, secretValue)
        authConfig.credential_ref = existingRef
      } else {
        authConfig.credential_ref = await createConnectorCredential(tenant.id, credentialKind, secretValue)
      }
    } else if (authType !== 'none' && sameAuthType && existingRef) {
      // Keep the existing credential — same auth type, no new secret submitted.
      authConfig.credential_ref = existingRef
    } else if (authType !== 'none') {
      return NextResponse.json({ error: 'Credentials are required when changing auth type' }, { status: 400 })
    }

    const parsedAuth = AuthConfigSchema.safeParse(authConfig)
    if (!parsedAuth.success) {
      return NextResponse.json({ error: `Invalid auth config: ${parsedAuth.error.issues[0]?.message}` }, { status: 400 })
    }
    data.authConfig = parsedAuth.data
  }

  await db.connector.update({ where: { id: connector.id }, data })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedConnector(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cascades to connector_tools and agent_connectors (Prisma onDelete: Cascade).
  await db.connector.delete({ where: { id: owned.connector.id } })
  return NextResponse.json({ success: true })
}
