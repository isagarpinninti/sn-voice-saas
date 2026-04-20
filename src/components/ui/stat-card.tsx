import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Compact stat card used in the dashboard stat rows.
 * Vercel-flavored: monochrome by default, label on top in caps,
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
    <Card className={cn('relative overflow-hidden', className)}>
      {accent && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] to-transparent pointer-events-none" />
      )}
      <CardContent className="p-5 relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-medium">{label}</p>
          {Icon && <Icon className={cn('w-3.5 h-3.5', accent ? 'text-primary' : 'text-muted-foreground/60')} />}
        </div>
        <p
          className={cn(
            'text-[24px] font-semibold tracking-tight tabular-nums',
            accent ? 'text-primary' : 'text-foreground'
          )}
        >
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        {children}
      </CardContent>
    </Card>
  )
}
