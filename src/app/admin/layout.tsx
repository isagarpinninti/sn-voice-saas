export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { isUserAdmin } from '@/lib/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ADMIN_NAV } from '@/lib/admin-nav'
import { AdminSidebarNav } from '@/components/admin/admin-sidebar-nav'
import { TopBar } from '@/components/dashboard/top-bar'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { appHref } from '@/lib/urls'
import { CommandPalette } from '@/components/admin/command-palette'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth')
  if (!isUserAdmin(session)) redirect('/dashboard')

  return (
    <ToastProvider>
      <ConfirmProvider>
      <div className="min-h-screen flex bg-background text-foreground">
        {/* ── Sidebar ── */}
        <aside className="w-[228px] border-r border-sidebar-border bg-sidebar flex flex-col shrink-0 sticky top-0 h-screen">
          {/* Logo */}
          <div className="px-5 pt-5 pb-4">
            <Link href="/admin" className="flex items-center gap-2 group">
              <div className="w-6 h-6 rounded-md bg-destructive flex items-center justify-center transition-transform group-hover:scale-105">
                <svg className="w-3.5 h-3.5 text-destructive-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground group-hover:text-foreground transition-colors">
                  ZeVox
                </span>
                <span className="text-[9px] font-bold tracking-wider text-destructive">ADMIN</span>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 overflow-y-auto pt-1">
            <AdminSidebarNav items={ADMIN_NAV} />

            {/* Back to dashboard */}
            <div className="mb-4">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest px-2.5 pt-1 pb-1.5 font-medium">
                Back
              </p>
              <a
                href={appHref('/dashboard')}
                className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 transition-all duration-150"
              >
                <svg className="w-[16px] h-[16px] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                User Dashboard
                <svg className="ml-auto w-3 h-3 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="opens user app">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </nav>

          <div className="px-3 py-3 border-t border-sidebar-border">
            <div className="px-2.5 py-1.5">
              <p className="text-[12px] font-medium text-foreground truncate">Admin Console</p>
              <p className="text-[10px] text-muted-foreground">Operations only</p>
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar
            workspaceName="ZeVox"
            userEmail={session.user.email}
            userImage={session.user.image}
            variant="admin"
            rightSlot={<CommandPalette />}
          />
          <main className="flex-1">
            <div className="max-w-[1180px] mx-auto px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
