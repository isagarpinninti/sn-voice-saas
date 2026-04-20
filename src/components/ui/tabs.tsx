'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Minimal accessible tabs primitive. No Radix dependency.
 *
 * Usage:
 *   const [tab, setTab] = useState('embed')
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabsList>
 *       <TabsTrigger value="embed">Embed</TabsTrigger>
 *       <TabsTrigger value="appearance">Appearance</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="embed">…</TabsContent>
 *     <TabsContent value="appearance">…</TabsContent>
 *   </Tabs>
 */
type TabsContextValue = {
  value: string
  setValue: (v: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error('Tabs subcomponents must be used inside <Tabs>')
  return ctx
}

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string
  onValueChange: (v: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 border-b border-border w-full mb-6',
        className
      )}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  const { value: active, setValue } = useTabs()
  const isActive = active === value
  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      onClick={() => setValue(value)}
      className={cn(
        'relative px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px',
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
      {isActive && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-foreground rounded-full" />}
    </button>
  )
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: React.ReactNode
  className?: string
}) {
  const { value: active } = useTabs()
  if (active !== value) return null
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  )
}
