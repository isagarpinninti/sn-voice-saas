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

  const tenant = session.user.id
    ? await db.tenant.findUnique({
        where: { userId: session.user.id },
        select: { company: true, plan: true },
      })
    : null

  const workspaceName = tenant?.company || session.user.name?.split(' ')[0] || 'ZeVox'
  const planLabel = tenant ? PLANS[tenant.plan as PlanKey]?.name || 'Free' : 'Free'
  const isPremium = tenant && ['PREMIUM', 'PRO_VOICE', 'ENTERPRISE', 'PRO', 'BUSINESS'].includes(tenant.plan)
  const adminUser = isUserAdmin(session)
  const initial = (session.user.email?.[0] || session.user.name?.[0] || '?').toUpperCase()

  return (
    <ToastProvider>
      <ConfirmProvider>
      {impersonationContext && (
        <ImpersonateBanner
          realUserEmail={impersonationContext.realEmail}
          targetUserEmail={impersonationContext.targetEmail}
        />
      )}
      <div className="flex h-screen overflow-hidden" style={{ background: '#000' }}>

        {/* ── Sidebar ── */}
        <aside className="w-[220px] shrink-0 flex flex-col border-r border-white/[0.06]" style={{ background: '#080808' }}>

          {/* Logo */}
          <div className="flex items-center gap-3 px-4 h-[52px] border-b border-white/[0.06] shrink-0">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div
                className="w-[26px] h-[26px] rounded-lg flex items-center justify-center transition-all duration-200 group-hover:scale-105"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  boxShadow: '0 0 16px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                <svg className="w-[13px] h-[13px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line strokeLinecap="round" x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </div>
              <span className="text-[14px] font-semibold tracking-tight text-white">ZeVox</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 overflow-y-auto py-4">
            <SidebarNav items={NAV} />

            {/* Resources */}
            <div className="mt-5">
              <p className="text-[10px] text-[#444] uppercase tracking-widest px-2.5 pb-2 font-semibold">
                Resources
              </p>
              <a
                href="/docs"
                target="_blank"
                className="group flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] text-[#555] hover:text-[#a1a1a1] hover:bg-white/4 transition-all duration-150"
              >
                <svg className="w-[15px] h-[15px] shrink-0 text-[#444] group-hover:text-[#777] transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                Documentation
              </a>
            </div>
          </nav>

          {/* Footer */}
          <div className="px-3 py-3 border-t border-white/[0.06] shrink-0 space-y-1.5">
            {/* Workspace + plan */}
            <Link
              href="/dashboard/billing"
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg transition-all duration-150 hover:bg-white/[0.04] group"
              style={{ border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-[22px] h-[22px] rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                  {workspaceName[0].toUpperCase()}
                </div>
                <span className="text-[12px] font-medium text-[#bbb] truncate group-hover:text-white transition-colors">
                  {workspaceName}
                </span>
              </div>
              <span
                className="text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded"
                style={{
                  background: isPremium ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  color: isPremium ? '#818cf8' : '#444',
                  border: isPremium ? '1px solid rgba(99,102,241,0.2)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {planLabel}
              </span>
            </Link>

            {/* User row */}
            <div className="flex items-center gap-2 px-2.5 py-1">
              <div
                className="w-[20px] h-[20px] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.18)' }}
              >
                {initial}
              </div>
              <p className="text-[11px] text-[#444] truncate flex-1 min-w-0">{session.user.email}</p>
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
                  className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[11px] font-semibold transition-colors"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}
                >
                  <ShieldCheck className="w-3 h-3" />
                  Admin
                </Link>
              ) : undefined
            }
          />
          <main className="flex-1 overflow-y-auto" style={{ background: '#000' }}>
            <div className="max-w-[1080px] mx-auto px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
      </ConfirmProvider>
    </ToastProvider>
  )
}
