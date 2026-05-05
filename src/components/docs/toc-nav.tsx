'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export type TocItem = { id: string; num: string; title: string }

export function TocNav({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')

  useEffect(() => {
    if (items.length === 0) return

    // Track which section is most prominent in the viewport. We pick the
    // section whose top is closest to the top of the visible area while still
    // being on screen — feels right when scrolling slowly.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-80px 0px -65% 0px',
        threshold: [0, 0.2, 0.5],
      }
    )

    items.forEach((it) => {
      const el = document.getElementById(it.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label="Documentation sections" className="space-y-0.5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-semibold mb-3 px-2">
        On this page
      </p>
      {items.map((it) => {
        const active = it.id === activeId
        return (
          <a
            key={it.id}
            href={`#${it.id}`}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'group flex items-baseline gap-2.5 px-2 py-1.5 rounded-md text-[12.5px] transition-colors',
              active
                ? 'text-foreground font-medium bg-secondary/60'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
            )}
          >
            <span
              className={cn(
                'text-[10px] font-mono tabular-nums shrink-0 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground/50'
              )}
            >
              {it.num}
            </span>
            <span className="leading-snug">{it.title}</span>
          </a>
        )
      })}
    </nav>
  )
}
