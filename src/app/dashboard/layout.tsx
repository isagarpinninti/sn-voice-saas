export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NAV } from '@/lib/nav'
import { SidebarNav } from '@/components/dashboard/sidebar-nav'
import { TopBar } from '@/components/dashboard/top-bar'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { PLANS, PlanKey } from '@/lib/plans'
import { ImpersonateBanner } from '@/components/admin/impersonate-banner'
import { isUserAdmin } from '@/lib/admin'
import { ShieldCheck } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth')

  const impersonating = (session.user as any).impersonating === true
  const realUserId = (session.user as any).realId as string | undefined
  let impersonationContext: { realEmail?: string | null; targetEmail?: string | null } | null = null
  if (impersonating) {
    const [real, target] = await Promise.all([
      realUserId ? db.user.findUnique({ where: { id: realUserId }, select: { email: true } }) : null,
      db.user.findUnique({ where: { id: session.user.id! }, select: { email: true } }),
    ])
    impersonationContext = { realEmail: real?.email, targetEmail: target?.email }
  }

  // Load tenant for the workspace name + plan badge in the sidebar footer
  const tenant = session.user.id
    ? await db.tenant.findUnique({
        where: { userId: session.user.id },
        select: { company: true, plan: true },
      })
    : null

  const workspaceName = tenant?.company || session.user.name?.split(' ')[0] || 'ZeVox'
  const planLabel = tenant ? PLANS[tenant.plan as PlanKey]?.name || 'Free' : 'Free'
  const adminUser = isUserAdmin(session)

  return (
    <ToastProvider>
      <ConfirmProvider>
      {impersonationContext && (
        <ImpersonateBanner
          realUserEmail={impersonationContext.realEmail}
          targetUserEmail={impersonationContext.targetEmail}
        />
      )}
      <div className="flex h-screen overflow-hidden bg-black">
        {/* ── Sidebar ── */}
        <aside className="w-56 shrink-0 flex flex-col border-r border-white/8 bg-[#0a0a0a]">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-4 h-13 border-b border-white/8 shrink-0">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div
                className="w-6 h-6 rounded-md bg-[#6366f1] flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ boxShadow: '0 0 12px rgba(99,102,241,0.45)' }}
              >
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                </svg>
              </div>
              <span className="text-[13px] font-semibold tracking-tight text-[#ededed] group-hover:text-white transition-colors">
                ZeVox
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 overflow-y-auto py-3">
            <SidebarNav items={NAV} />

            {/* Resources (always shown) */}
            <div className="mb-4 last:mb-0">
              <p className="text-[10px] text-[#666] uppercase tracking-widest px-2.5 pt-1 pb-1.5 font-medium">
                Resources
              </p>
              <a
                href="/docs"
                target="_blank"
                className="group flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] text-[#666] hover:text-[#a1a1a1] hover:bg-white/4 transition-all duration-150"
              >
                <svg className="w-[16px] h-[16px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                Documentation
              </a>
            </div>
          </nav>

          {/* Sidebar footer */}
          <div className="px-3 py-3 border-t border-white/8 space-y-2 shrink-0">
            {/* Plan badge */}
            <Link
              href="/dashboard/billing"
              className="flex items-center justify-between px-2.5 py-1.5 rounded-md border border-white/8 bg-white/3 hover:bg-white/5 transition-colors"
            >
              <span className="text-[12px] font-medium text-[#ededed] truncate">{workspaceName}</span>
              <span className="text-[10px] text-[#666] ml-2 shrink-0">{planLabel}</span>
            </Link>

            {/* User row with initials avatar */}
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <div className="w-6 h-6 rounded-full bg-[#6366f1]/20 flex items-center justify-center text-[#6366f1] text-[10px] font-bold shrink-0 ring-1 ring-[#6366f1]/20">
                {session.user.email?.[0]?.toUpperCase() || '?'}
              </div>
              <p className="text-[11px] text-[#a1a1a1] truncate flex-1 min-w-0">{session.user.email}</p>
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <TopBar
            workspaceName={workspaceName}
            userEmail={session.user.email}
            userImage={session.user.image}
            rightSlot={
              adminUser ? (
                <Link
                  href="/admin/subscriptions"
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-destructive/10 border border-destructive/20 text-[12px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin Portal
                </Link>
              ) : undefined
            }
          />
          <main className="flex-1 bg-black overflow-y-auto">
            <div className="max-w-[1100px] mx-auto px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
