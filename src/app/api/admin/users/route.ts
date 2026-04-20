/**
 * Admin Users API
 *  GET   — list all users with their tenant + admin status
 *  PATCH — toggle isAdmin on another user (cannot self-demote, cannot demote env-granted)
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isUserAdmin, isEnvGrantedAdmin } from '@/lib/admin'

export async function GET() {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const users = await db.user.findMany({
    include: {
      tenant: { select: { plan: true, createdAt: true, _count: { select: { instances: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({
    currentUserId: session?.user?.id ?? null,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      isAdmin: u.isAdmin,
      envGranted: isEnvGrantedAdmin(u.email),
      createdAt: u.createdAt,
      plan: u.tenant?.plan ?? null,
      connected: (u.tenant?._count?.instances ?? 0) > 0,
    })),
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!isUserAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.userId !== 'string' || typeof body.isAdmin !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Self-protection: cannot demote yourself
  if (body.userId === session?.user?.id) {
    return NextResponse.json(
      { error: 'You cannot change your own admin status' },
      { status: 400 }
    )
  }

  // Env-granted users: the env var trumps the DB flag, so toggling is meaningless.
  // Reject explicitly to avoid confusion.
  const target = await db.user.findUnique({
    where: { id: body.userId },
    select: { email: true },
  })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if (isEnvGrantedAdmin(target.email)) {
    return NextResponse.json(
      { error: 'This user is granted admin via ADMIN_EMAILS env var. Update the env var to change their status.' },
      { status: 400 }
    )
  }

  const updated = await db.user.update({
    where: { id: body.userId },
    data: { isAdmin: body.isAdmin },
    select: { id: true, isAdmin: true, email: true },
  })

  return NextResponse.json({ success: true, user: updated })
}
