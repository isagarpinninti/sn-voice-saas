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
import { isUserAdmin } from '@/lib/admin'
import { ImpersonateBanner } from '@/components/admin/impersonate-banner'
import { adminHref } from '@/lib/urls'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth')

  const isAdmin = isUserAdmin(session)
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

  return (
    <ToastProvider>
      <ConfirmProvider>
      {impersonationContext && (
        <ImpersonateBanner
          realUserEmail={impersonationContext.realEmail}
          targetUserEmail={impersonationContext.targetEmail}
        />
      )}
      <div className="min-h-screen flex bg-background text-foreground">
        {/* ── Sidebar ── */}
        <aside className="w-[228px] border-r border-sidebar-border bg-sidebar flex flex-col shrink-0 sticky top-0 h-screen">
          {/* Logo */}
          <div className="px-5 pt-5 pb-4">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center transition-transform group-hover:scale-105">
                <svg className="w-3.5 h-3.5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                </svg>
              </div>
              <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground group-hover:text-foreground transition-colors">
                ZeVox
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 overflow-y-auto pt-1">
            <SidebarNav items={NAV} />

            {/* Resources (always shown) */}
            <div className="mb-4 last:mb-0">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest px-2.5 pt-1 pb-1.5 font-medium">
                Resources
              </p>
              <a
                href="/docs"
                target="_blank"
                className="group flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 transition-all duration-150"
              >
                <svg className="w-[16px] h-[16px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                Documentation
              </a>
            </div>

            {/* Admin section (only for admin emails) */}
            {isAdmin && (
              <div className="mb-4">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest px-2.5 pt-1 pb-1.5 font-medium">
                  Admin
                </p>
                <a
                  href={adminHref('/admin')}
                  className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-all duration-150"
                >
                  <svg className="w-[16px] h-[16px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Admin Console
                  <svg className="ml-auto w-3 h-3 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="opens admin app">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </nav>

          {/* Workspace footer (replaces user card — user moved to top bar dropdown) */}
          <div className="px-3 py-3 border-t border-sidebar-border">
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md">
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-foreground truncate">{workspaceName}</p>
                <p className="text-[10px] text-muted-foreground">{planLabel} plan</p>
              </div>
              <Link
                href="/dashboard/billing"
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Manage
              </Link>
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar
            workspaceName={workspaceName}
            userEmail={session.user.email}
            userImage={session.user.image}
          />
          <main className="flex-1">
            <div className="max-w-[1100px] mx-auto px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
