'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type AdminNavGroup, type AdminNavItem, ADMIN_NAV_GROUP_LABELS } from '@/lib/admin-nav'
import { cn } from '@/lib/utils'

export function AdminSidebarNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (!pathname) return false
    if (href === '/admin') return pathname === '/admin'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const grouped: Record<AdminNavGroup, AdminNavItem[]> = { operations: [], manage: [] }
  for (const item of items) grouped[item.group].push(item)

  const groupOrder: AdminNavGroup[] = ['operations', 'manage']

  return (
    <>
      {groupOrder.map((group) => {
        const groupItems = grouped[group]
        if (groupItems.length === 0) return null
        return (
          <div key={group} className="mb-5 last:mb-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.12em] px-2.5 pt-1 pb-2 font-semibold">
              {ADMIN_NAV_GROUP_LABELS[group]}
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
                      <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-destructive" />
                    )}
                    <svg
                      className={cn(
                        'w-[16px] h-[16px] shrink-0 transition-colors',
                        active ? 'text-destructive' : 'text-muted-foreground group-hover:text-foreground'
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
