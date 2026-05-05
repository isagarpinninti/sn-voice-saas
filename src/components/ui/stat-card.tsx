import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Compact stat card used in the dashboard stat rows.
 * Linear/Vercel-flavored: monochrome by default, label on top in caps,
 * large number, sub label, optional icon and inline content (sparkline).
 */
type StatCardProps = {
  label: string
  value: React.ReactNode
  sub?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Tinted with primary accent (used for one card per row max) */
  accent?: boolean
  /** Optional content rendered below the value (e.g., sparkline) */
  children?: React.ReactNode
  className?: string
}

export function StatCard({ label, value, sub, icon: Icon, accent, children, className }: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden group hover:border-border/80 transition-colors', className)}>
      {accent && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-primary/[0.02] to-transparent pointer-events-none" />
      )}
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] font-semibold">{label}</p>
          {Icon && (
            <div className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center transition-colors',
              accent ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground group-hover:text-foreground'
            )}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
        <p
          className={cn(
            'text-[26px] font-semibold tracking-[-0.025em] tabular-nums leading-none',
            accent ? 'text-primary' : 'text-foreground'
          )}
        >
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
        {children}
      </CardContent>
    </Card>
  )
}
