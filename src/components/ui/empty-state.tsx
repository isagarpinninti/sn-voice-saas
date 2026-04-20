import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Reusable empty state — icon + title + description + optional action.
 * Used wherever a list/data set is empty (Overview, Usage, Agents).
 */
type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-border bg-card/30 px-6 py-12',
        className
      )}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-lg bg-muted/50 border border-border flex items-center justify-center mb-4">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-[12px] text-muted-foreground mt-1 max-w-[420px]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
