import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Section wrapper for grouping settings/content under a labeled header.
 * Linear/Vercel pattern: small uppercase title + optional description + content body.
 */
type SectionProps = {
  title: string
  description?: string
  /** Inline count chip rendered after the title (e.g., 12 results). */
  count?: number | string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ title, description, count, actions, children, className }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">{title}</h2>
            {count !== undefined && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-secondary text-[10px] font-medium text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </div>
          {description && <p className="text-[12px] text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  )
}
