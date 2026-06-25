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
import { CommandPalette } from '@/components/admin/command-palette'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth')
  if (!isUserAdmin(session)) redirect('/dashboard')

  return (
    <ToastProvider>
      <ConfirmProvider>
      <div className="flex h-screen overflow-hidden bg-black text-[#ededed]">
        {/* ── Sidebar ── */}
        <aside className="w-56 shrink-0 flex flex-col border-r border-white/8 bg-[#0a0a0a]">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-4 h-13 border-b border-white/8 shrink-0">
            <Link href="/admin" className="flex items-center gap-2.5 group">
              <div className="w-6 h-6 rounded-md bg-[#ef4444] flex items-center justify-center transition-transform group-hover:scale-105">
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold tracking-tight text-[#ededed]">ZeVox</span>
                <span className="text-[9px] font-bold tracking-wider text-[#ef4444]">ADMIN</span>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 overflow-y-auto py-3">
            <AdminSidebarNav items={ADMIN_NAV} />
          </nav>

          <div className="px-3 py-3 border-t border-white/8 shrink-0">
            <div className="px-2.5 py-1.5">
              <p className="text-[12px] font-medium text-[#ededed]">Admin Console</p>
              <p className="text-[10px] text-[#666]">Operations only</p>
            </div>
          </div>
        </aside>

        {/* ── Main column ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <TopBar
            workspaceName="ZeVox"
            userEmail={session.user.email}
            userImage={session.user.image}
            variant="admin"
            rightSlot={<CommandPalette />}
          />
          <main className="flex-1 bg-black overflow-y-auto">
            <div className="max-w-[1180px] mx-auto px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
