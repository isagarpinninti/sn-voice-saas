export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ConnectorToolSchema } from '@connector-schema'

type RouteContext = { params: Promise<{ id: string }> }

async function loadOwnedConnector(userId: string, connectorId: string) {
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (!tenant) return null
  const connector = await db.connector.findFirst({ where: { id: connectorId, tenantId: tenant.id } })
  return connector ? { tenant, connector } : null
}

function parseJsonField(value: unknown, fallback: unknown) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string') return value
  return JSON.parse(value)
}

export async function POST(req: Request, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const owned = await loadOwnedConnector(session.user.id, id)
  if (!owned) return NextResponse.json({ error: 'Connector not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  let params: unknown
  let bodyTemplate: unknown
  try {
    params = parseJsonField(body.params, [])
    bodyTemplate = parseJsonField(body.bodyTemplate, undefined)
  } catch {
    return NextResponse.json({ error: 'Params and static body fields must be valid JSON' }, { status: 400 })
  }

  const candidate = {
    connector_id: owned.connector.id,
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    method: body.method,
    path_template: String(body.pathTemplate || '').trim(),
    params,
    body_template: bodyTemplate,
    response_mapping: {
      success_path: String(body.successPath || '').trim(),
      template: String(body.template || '').trim(),
      error_template: String(body.errorTemplate || '').trim(),
    },
    timeout_ms: body.timeoutMs !== undefined ? Number(body.timeoutMs) : undefined,
    enabled: body.enabled !== undefined ? !!body.enabled : undefined,
  }

  const parsed = ConnectorToolSchema.safeParse(candidate)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid tool definition' }, { status: 400 })
  }

  try {
    const tool = await db.connectorTool.create({
      data: {
        connectorId: owned.connector.id,
        name: parsed.data.name,
        description: parsed.data.description,
        method: parsed.data.method,
        pathTemplate: parsed.data.path_template,
        params: parsed.data.params as Prisma.InputJsonValue,
        bodyTemplate: (parsed.data.body_template as Prisma.InputJsonValue) ?? undefined,
        authOverride: (parsed.data.auth_override as Prisma.InputJsonValue) ?? undefined,
        responseMapping: parsed.data.response_mapping as Prisma.InputJsonValue,
        timeoutMs: parsed.data.timeout_ms,
        enabled: parsed.data.enabled,
      },
    })
    return NextResponse.json({ id: tool.id })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return NextResponse.json({ error: 'A tool with this name already exists on this connector' }, { status: 409 })
    }
    throw err
  }
}
