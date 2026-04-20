'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { LogOut, Trash2, ArrowRight } from 'lucide-react'

export default function SettingsPage() {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [company, setCompany] = useState('')

  useEffect(() => {
    fetch('/api/tenants/settings').then(r => r.json()).then(d => { setCompany(d.company || '') })
  }, [])

  async function saveCompany() {
    setSaving(true)
    try {
      const res = await fetch('/api/tenants/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company }),
      })
      if (res.ok) toast('Company name saved', 'success')
      else toast('Failed to save', 'error')
    } catch { toast('Network error', 'error') }
    setSaving(false)
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account, API tokens, and workspace preferences."
      />

      <div className="max-w-2xl space-y-10">
        {/* Profile */}
        <Section title="Profile" description="Workspace identity used across the dashboard.">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company">Company name</Label>
                <div className="flex gap-2">
                  <Input
                    id="company"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="Acme Inc."
                    className="flex-1"
                  />
                  <Button onClick={saveCompany} disabled={saving} size="sm">
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* API Tokens — now per-agent */}
        <Section
          title="API Tokens"
          description="Embed tokens are per-agent. Manage them on each agent's Embed code tab."
        >
          <Card>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-foreground">View tokens on the Agents page</p>
                <p className="text-[11px] text-muted-foreground">
                  Each agent has its own embed token. Open an agent and switch to the Embed code tab.
                </p>
              </div>
              <Link
                href="/dashboard/agents"
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
              >
                Manage agents
                <ArrowRight className="w-3 h-3" />
              </Link>
            </CardContent>
          </Card>
        </Section>

        {/* Danger zone */}
        <Section title="Danger zone" description="Irreversible actions. Proceed with care.">
          <Card className="border-destructive/20 bg-destructive/[0.02]">
            <CardContent className="p-5 divide-y divide-destructive/10">
              <div className="flex items-center justify-between pb-4">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Sign out</p>
                  <p className="text-[11px] text-muted-foreground">End your session on this device.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="w-3 h-3" />
                  Sign out
                </Button>
              </div>
              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-[13px] font-medium text-foreground">Delete account</p>
                  <p className="text-[11px] text-muted-foreground">Permanently delete your account, tenants, and call data.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}
