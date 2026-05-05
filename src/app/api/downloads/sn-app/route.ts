export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { auth } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { db } from '@/lib/db'

export const SN_APP_VERSION = '1.0.2'
const FILE_NAME = `ai-voice-agent-v${SN_APP_VERSION}.zip`
const FILE_PATH = path.join(process.cwd(), 'private-downloads', FILE_NAME)

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let buf: Buffer
  let size: number
  try {
    const s = await stat(FILE_PATH)
    size = s.size
    buf = await readFile(FILE_PATH)
  } catch {
    return NextResponse.json({ error: 'Release artifact missing on server' }, { status: 503 })
  }

  const tenant = await db.tenant.findUnique({ where: { userId: session.user.id }, select: { id: true } })
  if (tenant) {
    await logAudit({
      tenantId: tenant.id,
      actorId: session.user.id,
      actorType: 'user',
      action: 'sn_app.download',
      metadata: { version: SN_APP_VERSION, sizeBytes: size },
    })
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${FILE_NAME}"`,
      'Cache-Control': 'no-store',
    },
  })
}
