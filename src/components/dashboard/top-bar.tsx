'use client'

/**
 * Slim top bar above the dashboard content.
 * Left: workspace name + breadcrumb (Workspace / Current page)
 * Right: backend connection status pill (ServiceNow instance or generic
 * connector, either counts) + user dropdown
 */
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ChevronDown } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/connection': 'Connection',
  '/dashboard/connectors': 'Connectors',
  '/dashboard/embed': 'Widget',
  '/dashboard/agents': 'Agents',
  '/dashboard/usage': 'Usage',
  '/dashboard/billing': 'Billing',
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
}

export function TopBar({ workspaceName, userEmail, userImage, variant = 'dashboard', rightSlot }: TopBarProps) {
  const pathname = usePathname()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (variant === 'admin') return
    // "Connected" means the tenant has at least one working backend — a
    // ServiceNow instance (Instance table) or a generic connector
    // (Connector table). Either satisfies it; this isn't ServiceNow-only.
    Promise.all([
      fetch('/api/instances').then((r) => r.json()).catch(() => null),
      fetch('/api/connectors').then((r) => r.json()).catch(() => null),
    ]).then(([instancesRes, connectorsRes]) => {
      const instances = Array.isArray(instancesRes?.instances) ? instancesRes.instances : []
      const hasInstance = instances.some((i: { active?: boolean; snInstanceUrl?: string | null }) => i.active !== false && !!i.snInstanceUrl)
      const hasConnector = Array.isArray(connectorsRes?.connectors) && connectorsRes.connectors.length > 0
      setConnected(hasInstance || hasConnector)
    })
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
    <header className="sticky top-0 z-40 h-13 border-b border-white/8 bg-[#0a0a0a] shrink-0">
      <div className="h-full px-5 flex items-center justify-between">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
          <span className="text-[#a1a1a1] font-medium tracking-tight">{workspaceName}</span>
          {variant === 'admin' && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider bg-destructive/10 text-destructive border border-destructive/20">
              ADMIN
            </span>
          )}
          <svg className="w-3 h-3 text-[#666]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[#666]">{pageLabel}</span>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {rightSlot}
          {/* Connection status — dashboard only */}
          {variant === 'dashboard' && connected !== null && (
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium bg-white/4 border-white/8 ${
                connected ? 'text-[#22c55e]' : 'text-[#f59e0b]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#22c55e]' : 'bg-[#f59e0b]'}`}
              />
              {connected ? 'Backend connected' : 'Not connected'}
            </div>
          )}

          {/* User dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-white/6 transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar src={userImage} name={userEmail} size={28} />
              <ChevronDown className="w-3.5 h-3.5 text-[#666]" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-white/10 bg-[#111] shadow-[0_8px_24px_-4px_rgba(0,0,0,0.6)] overflow-hidden"
              >
                <div className="px-3 py-3 border-b border-white/8 bg-white/3">
                  <p className="text-[12px] font-medium text-[#ededed] truncate">{userEmail || 'Account'}</p>
                  <p className="text-[10px] text-[#666] mt-0.5">Signed in</p>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="w-full text-left px-3 py-2.5 text-[12px] text-[#ededed] hover:bg-white/6 transition-colors flex items-center gap-2"
                >
                  <svg className="w-3.5 h-3.5 text-[#666]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
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
