'use client'

/**
 * Slim top bar above the dashboard content.
 * Left: workspace name + breadcrumb (Workspace / Current page)
 * Right: ServiceNow connection status pill + user dropdown
 */
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ChevronDown } from 'lucide-react'

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/connection': 'Connection',
  '/dashboard/embed': 'Widget',
  '/dashboard/agents': 'Agents',
  '/dashboard/usage': 'Usage',
  '/dashboard/billing': 'Billing',
  '/dashboard/incident-agent': 'Incident AI Agent',
  '/dashboard/settings': 'Settings',
  '/admin': 'Overview',
  '/admin/health': 'System Health',
  '/admin/logs': 'Live Logs',
  '/admin/audit': 'Audit Log',
  '/admin/tenants': 'Tenants',
  '/admin/phone-numbers': 'Phone Numbers',
  '/admin/usage': 'Usage',
  '/admin/users': 'Users',
  '/admin/subscriptions': 'Subscriptions',
  '/admin/plans': 'Plan Editor',
  '/admin/revenue': 'Revenue',
  '/admin/flags': 'Feature Flags',
}

type TopBarProps = {
  workspaceName: string
  userEmail?: string | null
  userImage?: string | null
  /** When 'admin', shows an ADMIN badge and skips the connection-status pill. */
  variant?: 'dashboard' | 'admin'
  /** Optional node rendered on the right of the top bar (before the user menu). */
  rightSlot?: React.ReactNode
  /** Show the Admin Console link in the user dropdown. */
  isAdmin?: boolean
}

export function TopBar({ workspaceName, userEmail, userImage, variant = 'dashboard', rightSlot, isAdmin }: TopBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (variant === 'admin') return
    // SN connection lives on the Instance table now (one tenant → many instances).
    // We're "connected" if at least one active instance has a snInstanceUrl set.
    fetch('/api/instances')
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.instances) ? d.instances : []
        setConnected(list.some((i: { active?: boolean; snInstanceUrl?: string | null }) => i.active !== false && !!i.snInstanceUrl))
      })
      .catch(() => setConnected(false))
  }, [variant])

  // Close the menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  const pageLabel = (pathname && PAGE_LABELS[pathname]) || 'Dashboard'

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
          <span className="text-foreground font-semibold tracking-tight">{workspaceName}</span>
          {variant === 'admin' && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider bg-destructive/10 text-destructive border border-destructive/20">
              ADMIN
            </span>
          )}
          <svg className="w-3 h-3 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-muted-foreground">{pageLabel}</span>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {rightSlot}
          {/* Connection status — dashboard only */}
          {variant === 'dashboard' && connected !== null && (
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${
                connected
                  ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700'
                  : 'border-amber-500/25 bg-amber-500/[0.08] text-amber-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              {connected ? 'ServiceNow connected' : 'Not connected'}
            </div>
          )}

          {/* User dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-secondary transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userImage} alt="" className="w-7 h-7 rounded-full ring-1 ring-border" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary text-[11px] font-bold ring-1 ring-primary/20">
                  {userEmail?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover shadow-[0_8px_24px_-4px_rgb(16_24_40/0.12)] overflow-hidden"
              >
                <div className="px-3 py-3 border-b border-border bg-secondary/40">
                  <p className="text-[12px] font-medium text-foreground truncate">{userEmail || 'Account'}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Signed in</p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); router.push('/admin') }}
                    className="w-full text-left px-3 py-2.5 text-[12px] text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2 border-b border-border"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    Admin Console
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="w-full text-left px-3 py-2.5 text-[12px] text-foreground hover:bg-secondary transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
