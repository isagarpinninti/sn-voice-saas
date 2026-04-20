import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Standardized page header used at the top of every dashboard page.
 * Vercel-style: title + description on the left, optional actions on the right.
 */
type PageHeaderProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-6 mb-8', className)}>
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-foreground">{title}</h1>
        {description && (
          <p className="text-[13px] text-muted-foreground mt-1 max-w-[640px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
