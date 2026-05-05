import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Standardized page header used at the top of every dashboard page.
 * Linear/Vercel-style: optional eyebrow, title + description on the left,
 * optional actions on the right.
 */
type PageHeaderProps = {
  title: string
  description?: string
  /** Small uppercase label rendered above the title (e.g., section context). */
  eyebrow?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-6 mb-8 pb-6 border-b border-border', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80 font-semibold mb-2">{eyebrow}</p>
        )}
        <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-foreground">{title}</h1>
        {description && (
          <p className="text-[13px] text-muted-foreground mt-1.5 max-w-[640px] leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
