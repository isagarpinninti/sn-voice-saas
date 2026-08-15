'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'

interface AgentConnector {
  id: string
  name: string
  platform: string
  baseUrl: string
  toolCount: number
  enabled: boolean
}

/**
 * Per-agent connector enable/disable — which backends (ServiceNow, HaloITSM,
 * any REST API) this specific agent can call tools on. Toggling writes/deletes
 * an AgentConnector row; the forked voice-engine reads it via
 * config/connectors_config.py, unchanged from VoiceConnect's own version.
 */
export function AgentConnectorsSection({ agentId }: { agentId: string }) {
  const { toast } = useToast()
  const [connectors, setConnectors] = useState<AgentConnector[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/agents/${agentId}/connectors`)
      .then((r) => r.json())
      .then((d) => setConnectors(d.connectors || []))
      .catch(() => toast('Failed to load connectors', 'error'))
      .finally(() => setLoading(false))
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(connectorId: string, enabled: boolean) {
    setToggling(connectorId)
    try {
      const res = await fetch(`/api/agents/${agentId}/connectors`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId, enabled }),
      })
      if (res.ok) {
        setConnectors((prev) => prev.map((c) => c.id === connectorId ? { ...c, enabled } : c))
      } else {
        const data = await res.json()
        toast(data.error || 'Failed to update connector', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setToggling(null)
  }

  if (loading) return null

  return (
    <Section title="Connectors" description="Which backends this agent can call tools on — ServiceNow, HaloITSM, or any REST API you've connected.">
      {connectors.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No connectors yet.{' '}
          <Link href="/dashboard/connectors" className="underline underline-offset-4 hover:text-foreground">
            Create one
          </Link>{' '}
          to give this agent tools to call.
        </p>
      ) : (
        <div className="space-y-2">
          {connectors.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/connectors/${c.id}`} className="text-[13px] font-medium text-foreground hover:underline">
                      {c.name}
                    </Link>
                    <Badge variant="outline">{c.platform}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{c.toolCount} tool{c.toolCount !== 1 ? 's' : ''} · {c.baseUrl.replace(/^https?:\/\//, '')}</p>
                </div>
                <Switch
                  checked={c.enabled}
                  disabled={toggling === c.id}
                  onCheckedChange={(checked) => toggle(c.id, checked)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Section>
  )
}
