'use client'

/**
 * Minimal toast system — no portal lib, no shadcn dependency.
 * Renders a fixed-position stack in the bottom-right that auto-dismisses.
 */
import { createContext, useCallback, useContext, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type ToastVariant = 'default' | 'success' | 'error'
type Toast = { id: number; message: string; variant: ToastVariant }

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, variant: ToastVariant = 'default') => {
    const id = nextId++
    setToasts(prev => [...prev, { id, message, variant }])
  }, [])

  // Auto-dismiss after 3s. Cleared when toasts list changes.
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map(t =>
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3000)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`pointer-events-auto min-w-[240px] max-w-[360px] rounded-xl border px-4 py-3 text-[13px] shadow-lg backdrop-blur ${
                t.variant === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300'
                  : t.variant === 'error'
                  ? 'border-destructive/30 bg-destructive/[0.08] text-destructive'
                  : 'border-border bg-card/95 text-foreground'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {t.variant === 'success' && (
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
                {t.variant === 'error' && (
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                )}
                <span>{t.message}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
