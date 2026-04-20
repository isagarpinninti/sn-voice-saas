'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ImpersonateBanner({ realUserEmail, targetUserEmail }: { realUserEmail?: string | null; targetUserEmail?: string | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function exitImpersonation() {
    setLoading(true)
    try {
      await fetch('/api/admin/impersonate', { method: 'DELETE' })
      router.push('/admin/tenants')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-between shadow">
      <div>
        <span className="font-semibold">Impersonating</span>
        {targetUserEmail && <span className="ml-2 opacity-90">{targetUserEmail}</span>}
        {realUserEmail && <span className="ml-4 opacity-75">as {realUserEmail}</span>}
      </div>
      <button
        onClick={exitImpersonation}
        disabled={loading}
        className="bg-white text-amber-700 font-medium px-3 py-1 rounded hover:bg-amber-50 disabled:opacity-50"
      >
        {loading ? 'Exiting…' : 'Exit impersonation'}
      </button>
    </div>
  )
}
