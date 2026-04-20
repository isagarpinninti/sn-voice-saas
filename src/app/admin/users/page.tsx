'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { Users as UsersIcon } from 'lucide-react'

interface AdminUserRow {
  id: string
  name: string | null
  email: string | null
  image: string | null
  isAdmin: boolean
  envGranted: boolean
  createdAt: string
  plan: string | null
  connected: boolean
}

export default function UsersPage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      setUsers(data.users || [])
      setCurrentUserId(data.currentUserId ?? null)
    } catch {
      toast('Failed to load users', 'error')
    }
    setLoading(false)
  }

  async function toggleAdmin(userId: string, isAdmin: boolean) {
    setUpdating(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isAdmin }),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isAdmin } : u)))
        toast(isAdmin ? 'Admin granted' : 'Admin revoked', 'success')
      } else {
        toast(data.error || 'Failed to update', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setUpdating(null)
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="All users on the platform. Toggle admin access to grant or revoke console permissions."
      />

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading users...</p>
      ) : users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" description="Users will appear here as they sign up." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">User</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Plan</th>
                <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Joined</th>
                <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-widest font-medium text-muted-foreground/80">Admin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = currentUserId === u.id
                const locked = isSelf || u.envGranted
                const isUpdating = updating === u.id
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.image} alt="" className="w-7 h-7 rounded-full" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                            {u.name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate flex items-center gap-1.5">
                            {u.name || 'Unnamed'}
                            {isSelf && (
                              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-medium">you</span>
                            )}
                            {u.envGranted && (
                              <span className="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                env grant
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full text-[10px] font-medium px-1.5 py-0.5 tracking-wide ${
                          u.plan === 'ENTERPRISE'
                            ? 'bg-primary/10 text-primary'
                            : u.plan === 'PRO'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {u.plan || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleAdmin(u.id, !u.isAdmin)}
                        disabled={locked || isUpdating}
                        aria-pressed={u.isAdmin || u.envGranted}
                        title={
                          isSelf
                            ? 'You cannot change your own admin status'
                            : u.envGranted
                            ? 'Granted via ADMIN_EMAILS env var'
                            : u.isAdmin
                            ? 'Revoke admin'
                            : 'Grant admin'
                        }
                        className={`w-9 h-5 rounded-full transition-all ${
                          u.isAdmin || u.envGranted ? 'bg-destructive' : 'bg-muted'
                        } ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
                          isUpdating ? 'opacity-50' : ''
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full bg-white transition-all mx-0.5 ${
                            u.isAdmin || u.envGranted ? 'translate-x-4' : ''
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground/70 mt-4">
        Users with the <span className="text-amber-400">env grant</span> badge are admins via the
        <code className="mx-1 px-1 py-px rounded bg-muted/40 text-foreground">ADMIN_EMAILS</code>
        environment variable. Their toggle is locked — update the env var to change their status.
      </p>
    </div>
  )
}
