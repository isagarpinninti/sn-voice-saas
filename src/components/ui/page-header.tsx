import * as React from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  eyebrow?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-6 mb-8', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#555] font-semibold mb-2">{eyebrow}</p>
        )}
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-white">{title}</h1>
        {description && (
          <p className="text-[13px] text-[#555] mt-1.5 max-w-[580px] leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 mt-0.5">{actions}</div>}
    </div>
  )
}
