import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Section wrapper for grouping settings/content under a labeled header.
 * Vercel pattern: small uppercase title + optional description + content body.
 */
type SectionProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-medium">{title}</h2>
          {description && <p className="text-[12px] text-muted-foreground/70 mt-0.5">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  )
}
