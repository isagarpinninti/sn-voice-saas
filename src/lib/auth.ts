import { NextAuthOptions, getServerSession } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db } from './db'
import type { Adapter } from 'next-auth/adapters'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      // GitHub returns an `iss` parameter on the OAuth callback; next-auth
      // rejects it unless the matching issuer is configured here.
      issuer: 'https://github.com/login/oauth',
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as { id: string }).id = user.id

        // Auto-create tenant on first login. Agents are synced from ServiceNow.
        try {
          const existing = await db.tenant.findUnique({
            where: { userId: user.id },
          })

          if (!existing) {
            await db.tenant.create({
              data: {
                userId: user.id,
                plan: 'FREE',
                minutes_per_month: 50,
                concurrent_limit: 1,
                max_agents: 1,
                max_instances: 1,
              },
            })
          }
        } catch {
          // Race condition — safe to ignore. The next login will reconcile.
        }

        // Load isAdmin flag + auto-promote.
        // Promotion criteria (any one is enough):
        //   1. DB flag already true
        //   2. They are the only user in the system (first signup)
        //   3. Their email is in the ADMIN_EMAILS env var
        // Idempotent: once isAdmin=true in DB, subsequent logins are a no-op read.
        try {
          const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
            .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
          const dbUser = await db.user.findUnique({
            where: { id: user.id },
            select: { isAdmin: true, email: true },
          })
          let isAdmin = dbUser?.isAdmin ?? false
          if (!isAdmin) {
            const total = await db.user.count()
            const emailMatch = dbUser?.email && ADMIN_EMAILS.includes(dbUser.email.toLowerCase())
            if (total === 1 || emailMatch) {
              await db.user.update({ where: { id: user.id }, data: { isAdmin: true } })
              isAdmin = true
            }
          }
          ;(session.user as { isAdmin: boolean }).isAdmin = isAdmin
        } catch {
          ;(session.user as { isAdmin: boolean }).isAdmin = false
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/auth',
  },
}

export async function auth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return session

  // Impersonation override: if an admin has a valid impersonation cookie,
  // swap session.user.id to the target so all downstream tenant queries see
  // the target's data. The original admin id is preserved on
  // session.user.realId for audit logging and the UI banner.
  try {
    const { readImpersonationCookie } = await import('./impersonation')
    const imp = await readImpersonationCookie()
    if (imp && imp.realUserId === (session.user as { id: string }).id) {
      // Only honor the cookie when it was signed for the actually logged-in admin.
      const realId = imp.realUserId
      // Load target user so name/email/image reflect the impersonated identity in the UI.
      const target = await db.user.findUnique({
        where: { id: imp.targetUserId },
        select: { id: true, name: true, email: true, image: true },
      })
      ;(session.user as any).realId = realId
      ;(session.user as any).realName = session.user.name
      ;(session.user as any).realEmail = session.user.email
      ;(session.user as any).id = imp.targetUserId
      ;(session.user as any).impersonating = true
      if (target) {
        session.user.name = target.name
        session.user.email = target.email
        session.user.image = target.image
      }
    }
  } catch { /* ignore — fall through as normal session */ }

  return session
}
