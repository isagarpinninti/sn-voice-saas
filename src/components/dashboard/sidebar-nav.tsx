'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type NavGroup, type NavItem, NAV_GROUP_LABELS } from '@/lib/nav'
import { cn } from '@/lib/utils'

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (!pathname) return false
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Group items in declaration order
  const grouped: Record<NavGroup, NavItem[]> = { workspace: [], insights: [], account: [] }
  for (const item of items) grouped[item.group].push(item)

  const groupOrder: NavGroup[] = ['workspace', 'insights', 'account']

  return (
    <>
      {groupOrder.map((group) => {
        const groupItems = grouped[group]
        if (groupItems.length === 0) return null
        return (
          <div key={group} className="mb-5 last:mb-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] px-2.5 pt-1 pb-2 font-semibold">
              {NAV_GROUP_LABELS[group]}
            </p>
            <div className="space-y-[2px]">
              {groupItems.map((item) => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[13px] transition-all duration-150',
                      active
                        ? 'bg-card text-foreground font-medium shadow-[0_1px_2px_0_rgb(16_24_40/0.04)] border border-border'
                        : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent'
                    )}
                  >
                    {active && (
                      <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
                    )}
                    <svg
                      className={cn(
                        'w-[16px] h-[16px] shrink-0 transition-colors',
                        active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.75}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}
