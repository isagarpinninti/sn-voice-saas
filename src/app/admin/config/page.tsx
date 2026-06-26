'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { useToast } from '@/components/ui/toast'
import { Loader2, Save, RotateCcw } from 'lucide-react'

interface SaasConfig {
  saasName: string
  tagline: string
  logoUrl: string
  faviconUrl: string
  primaryColor: string
  darkBg: string
  supportEmail: string
}

const DEFAULTS: SaasConfig = {
  saasName: 'ZeVox',
  tagline: 'AI Voice Agents for ServiceNow',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#10b981',
  darkBg: '#000000',
  supportEmail: 'support@zevox.com',
}

export default function SaasConfigPage() {
  const { toast } = useToast()
  const [config, setConfig] = useState<SaasConfig>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(d => {
        setConfig({
          saasName:     d.saasName     ?? DEFAULTS.saasName,
          tagline:      d.tagline      ?? DEFAULTS.tagline,
          logoUrl:      d.logoUrl      ?? '',
          faviconUrl:   d.faviconUrl   ?? '',
          primaryColor: d.primaryColor ?? DEFAULTS.primaryColor,
          darkBg:       d.darkBg       ?? DEFAULTS.darkBg,
          supportEmail: d.supportEmail ?? DEFAULTS.supportEmail,
        })
      })
      .catch(() => toast('Failed to load config', 'error'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function update(key: keyof SaasConfig, value: string) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        toast('Platform config saved — changes apply on next deploy/restart', 'success')
      } else {
        const d = await res.json()
        toast(d.error || 'Failed to save', 'error')
      }
    } catch {
      toast('Network error', 'error')
    }
    setSaving(false)
  }

  function handleReset() {
    setConfig(DEFAULTS)
    toast('Reset to defaults (not saved yet)', 'success')
  }

  // Live preview: apply primaryColor to --primary CSS var in this page
  const previewStyle = {
    '--preview-primary': config.primaryColor,
    '--preview-bg': config.darkBg,
  } as React.CSSProperties

  if (loading) return <p className="text-[13px] text-[#888]">Loading config...</p>

  return (
    <div style={previewStyle}>
      <PageHeader
        title="Platform Configuration"
        description="Branding, theme, and identity settings applied across the entire SaaS."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleReset} className="text-[#888] border-white/10 hover:border-white/20">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        }
      />

      <div className="max-w-2xl space-y-8">

        {/* Identity */}
        <Section title="Identity" description="Name and tagline shown in the dashboard, emails, and browser tab.">
          <Card className="border-white/8 bg-[#0a0a0a]">
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[#888] text-[11px]">SaaS name</Label>
                <Input
                  value={config.saasName}
                  onChange={e => update('saasName', e.target.value)}
                  placeholder="ZeVox"
                  className="bg-[#111] border-white/10 text-[#ededed]"
                />
                <p className="text-[10px] text-[#555]">Shown in the browser tab title, sidebar, and emails.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#888] text-[11px]">Tagline</Label>
                <Input
                  value={config.tagline}
                  onChange={e => update('tagline', e.target.value)}
                  placeholder="AI Voice Agents for ServiceNow"
                  className="bg-[#111] border-white/10 text-[#ededed]"
                />
                <p className="text-[10px] text-[#555]">Shown on the login page and marketing meta description.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#888] text-[11px]">Support email</Label>
                <Input
                  value={config.supportEmail}
                  onChange={e => update('supportEmail', e.target.value)}
                  placeholder="support@zevox.com"
                  type="email"
                  className="bg-[#111] border-white/10 text-[#ededed]"
                />
                <p className="text-[10px] text-[#555]">Used in deletion requests, contact links, and error messages.</p>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Branding */}
        <Section title="Branding" description="Logo and favicon URLs. Use a CDN or public image host.">
          <Card className="border-white/8 bg-[#0a0a0a]">
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[#888] text-[11px]">Logo URL</Label>
                <div className="flex items-center gap-3">
                  <Input
                    value={config.logoUrl}
                    onChange={e => update('logoUrl', e.target.value)}
                    placeholder="https://cdn.example.com/logo.svg"
                    className="flex-1 bg-[#111] border-white/10 text-[#ededed]"
                  />
                  {config.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.logoUrl} alt="Logo preview" className="h-8 w-auto rounded border border-white/10 shrink-0 object-contain" />
                  )}
                </div>
                <p className="text-[10px] text-[#555]">Shown in the sidebar and login page. Recommended: SVG or PNG, transparent background.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#888] text-[11px]">Favicon URL</Label>
                <div className="flex items-center gap-3">
                  <Input
                    value={config.faviconUrl}
                    onChange={e => update('faviconUrl', e.target.value)}
                    placeholder="https://cdn.example.com/favicon.ico"
                    className="flex-1 bg-[#111] border-white/10 text-[#ededed]"
                  />
                  {config.faviconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded border border-white/10 shrink-0 object-contain" />
                  )}
                </div>
                <p className="text-[10px] text-[#555]">Browser tab icon. Recommended: 32×32 ICO or PNG.</p>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* Theme */}
        <Section title="Theme" description="Colors applied globally via CSS variables. Changes take effect on next page load after saving.">
          <Card className="border-white/8 bg-[#0a0a0a]">
            <CardContent className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[#888] text-[11px]">Primary / accent color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={e => update('primaryColor', e.target.value)}
                      className="w-9 h-9 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                    <Input
                      value={config.primaryColor}
                      onChange={e => update('primaryColor', e.target.value)}
                      placeholder="#10b981"
                      className="font-mono text-[11px] bg-[#111] border-white/10 text-[#ededed]"
                    />
                  </div>
                  <p className="text-[10px] text-[#555]">Buttons, links, active states, progress bars.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[#888] text-[11px]">Background color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.darkBg}
                      onChange={e => update('darkBg', e.target.value)}
                      className="w-9 h-9 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                    <Input
                      value={config.darkBg}
                      onChange={e => update('darkBg', e.target.value)}
                      placeholder="#000000"
                      className="font-mono text-[11px] bg-[#111] border-white/10 text-[#ededed]"
                    />
                  </div>
                  <p className="text-[10px] text-[#555]">Main dashboard background (dark mode base).</p>
                </div>
              </div>

              {/* Live preview swatch */}
              <div className="rounded-lg border border-white/8 p-4 space-y-3">
                <p className="text-[11px] text-[#555] font-medium uppercase tracking-wider">Preview</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div
                    className="px-4 py-2 rounded-lg text-[12px] font-medium text-white"
                    style={{ backgroundColor: config.primaryColor }}
                  >
                    Primary button
                  </div>
                  <div
                    className="px-4 py-2 rounded-lg text-[12px] font-medium border"
                    style={{ borderColor: config.primaryColor, color: config.primaryColor }}
                  >
                    Outline button
                  </div>
                  <div
                    className="px-3 py-1 rounded-full text-[11px] font-medium"
                    style={{ backgroundColor: config.primaryColor + '22', color: config.primaryColor }}
                  >
                    Badge
                  </div>
                  <span
                    className="text-[12px] underline cursor-pointer"
                    style={{ color: config.primaryColor }}
                  >
                    Link text
                  </span>
                </div>
                <div
                  className="h-8 rounded-md"
                  style={{ backgroundColor: config.darkBg, border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="h-full w-1/3 rounded-md" style={{ backgroundColor: config.primaryColor }} />
                </div>
                <p className="text-[10px] text-[#555]">Progress bar on background</p>
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* How it applies */}
        <Card className="border-white/8 bg-[#0a0a0a]">
          <CardContent className="p-4">
            <p className="text-[11px] text-[#555] leading-relaxed">
              <span className="text-[#888] font-medium">How changes apply: </span>
              Config is stored in the database and read at server startup. After saving, trigger a Render redeploy
              (or restart the server) for logo, favicon, and name changes to appear in{' '}
              <code className="text-[#888]">&lt;head&gt;</code>. Color changes apply on next full page load without redeploy.
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
