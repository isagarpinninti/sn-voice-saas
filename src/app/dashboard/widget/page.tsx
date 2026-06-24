'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/toast'
import { Card, CardContent } from '@/components/ui/card'
import { 
  Mic, 
  Check, 
  Copy, 
  Settings, 
  Sparkles, 
  Layout, 
  Loader2, 
  Save, 
  Eye, 
  HelpCircle,
  Undo2
} from 'lucide-react'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zevox.onrender.com'

interface Agent {
  id: string
  name: string
  snAgentId: string | null
  active: boolean
  token: string | null
  
  // Widget customization fields
  widgetColor: string
  widgetPosition: string
  widgetVoiceOnly: boolean
  widgetAutoOpen: boolean
  widgetGreeting: string
  widgetAgentName: string
  widgetShowBranding: boolean
  widgetLogoUrl: string
  widgetBorderRadius: string
}

const COLOR_PRESETS = [
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Red', hex: '#ef4444' },
]

export default function WidgetPage() {
  const { toast } = useToast()
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [fetchingAgent, setFetchingAgent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Form states
  const [widgetColor, setWidgetColor] = useState('#10b981')
  const [widgetPosition, setWidgetPosition] = useState('right')
  const [widgetVoiceOnly, setWidgetVoiceOnly] = useState(false)
  const [widgetAutoOpen, setWidgetAutoOpen] = useState(false)
  const [widgetGreeting, setWidgetGreeting] = useState('')
  const [widgetAgentName, setWidgetAgentName] = useState('')
  const [widgetShowBranding, setWidgetShowBranding] = useState(true)
  const [widgetLogoUrl, setWidgetLogoUrl] = useState('')
  const [widgetBorderRadius, setWidgetBorderRadius] = useState('full')

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => {
        const list = d.agents || []
        setAgents(list)
        if (list.length > 0) {
          loadAgentDetails(list[0].id)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const loadAgentDetails = async (agentId: string) => {
    setFetchingAgent(true)
    try {
      const res = await fetch(`/api/agents/${agentId}`)
      if (!res.ok) throw new Error('Failed to load details')
      const agent: Agent = await res.json()
      
      setSelectedAgent(agent)
      
      // Populate form
      setWidgetColor(agent.widgetColor || '#10b981')
      setWidgetPosition(agent.widgetPosition || 'right')
      setWidgetVoiceOnly(!!agent.widgetVoiceOnly)
      setWidgetAutoOpen(!!agent.widgetAutoOpen)
      setWidgetGreeting(agent.widgetGreeting || '')
      setWidgetAgentName(agent.widgetAgentName || '')
      setWidgetShowBranding(agent.widgetShowBranding !== false)
      setWidgetLogoUrl(agent.widgetLogoUrl || '')
      setWidgetBorderRadius(agent.widgetBorderRadius || 'full')
    } catch (err: any) {
      toast('Failed to load agent settings', 'error')
    } finally {
      setFetchingAgent(false)
    }
  }

  const handleSave = async () => {
    if (!selectedAgent) return
    setSaving(true)
    
    const payload = {
      widgetColor,
      widgetPosition,
      widgetVoiceOnly,
      widgetAutoOpen,
      widgetGreeting,
      widgetAgentName,
      widgetShowBranding,
      widgetLogoUrl,
      widgetBorderRadius,
    }

    try {
      const res = await fetch(`/api/agents/${selectedAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      
      if (!res.ok) throw new Error('Failed to save settings')
      
      toast('Widget settings saved successfully', 'success')
      
      // Update local selected agent
      setSelectedAgent({
        ...selectedAgent,
        ...payload
      })
    } catch (err: any) {
      toast(err.message || 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyCode = () => {
    if (!selectedAgent?.token) return
    const code = `<!-- ZeVox Voice Agent Widget -->
<script>
  window.ZEVOX_TOKEN = "${selectedAgent.token}";
</script>
<script src="${APP_URL}/widget.js"></script>`

    navigator.clipboard.writeText(code)
    setCopied(true)
    toast('Snippet copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Widget Customizer"
        description="Customize the appearance, behavior, and branding of the voice widget on a per-agent basis, then copy the embed code."
      />

      {loading && (
        <div className="flex items-center gap-2 text-text-secondary text-sm py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          Loading agents...
        </div>
      )}

      {!loading && agents.length === 0 && (
        <div className="rounded-xl border border-white/8 bg-surface-1 p-8 text-center max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-full bg-white/4 flex items-center justify-center mx-auto mb-4 border border-white/8">
            <Mic className="w-5 h-5 text-text-secondary" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">No active agents</p>
          <p className="text-xs text-text-secondary mb-5">
            Sync or create active agents in the ServiceNow App and SaaS to generate API tokens before configuring their widgets.
          </p>
        </div>
      )}

      {agents.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ── Left column: Agent selector & Settings ── */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Agent Selector Card */}
            <Card className="border-white/8 bg-surface-1">
              <CardContent className="p-5">
                <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-secondary mb-3">
                  Select Agent to Customize
                </label>
                <div className="flex flex-wrap gap-2">
                  {agents.map(a => {
                    const active = selectedAgent?.id === a.id
                    return (
                      <button
                        key={a.id}
                        onClick={() => loadAgentDetails(a.id)}
                        className={[
                          'px-4 py-2 rounded-lg border text-[13px] font-medium transition-all duration-150 flex items-center gap-2',
                          active
                            ? 'bg-primary/10 border-primary text-primary shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                            : 'border-white/8 bg-white/3 text-text-secondary hover:border-white/12 hover:text-text-primary'
                        ].join(' ')}
                      >
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: active ? widgetColor : '#444' }}
                        />
                        {a.name}
                        {!a.active && <span className="text-[10px] opacity-60">(Inactive)</span>}
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Customizer settings */}
            {selectedAgent && (
              <Card className="border-white/8 bg-surface-1 relative overflow-hidden">
                {fetchingAgent && (
                  <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                )}
                
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-white/8 pb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                        <Settings className="w-4 h-4 text-primary" />
                        Widget Settings
                      </h3>
                      <p className="text-[11px] text-text-secondary mt-0.5">Configured specifically for {selectedAgent.name}</p>
                    </div>
                    
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary hover:bg-primary/90 text-white text-[12.5px] font-semibold transition-colors shadow-[0_0_12px_rgba(99,102,241,0.35)] disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Save Settings
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Theme Color */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium text-text-secondary flex items-center gap-1">
                        Theme Accent Color
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={widgetColor}
                          onChange={e => setWidgetColor(e.target.value)}
                          className="w-10 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer overflow-hidden p-0 shrink-0"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {COLOR_PRESETS.map(p => (
                            <button
                              key={p.hex}
                              title={p.name}
                              type="button"
                              onClick={() => setWidgetColor(p.hex)}
                              className="w-6 h-6 rounded-full border border-white/10 relative transition-transform hover:scale-110 shrink-0"
                              style={{ backgroundColor: p.hex }}
                            >
                              {widgetColor.toLowerCase() === p.hex.toLowerCase() && (
                                <Check className="w-3.5 h-3.5 absolute inset-0 m-auto text-white stroke-[3px]" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Border Radius */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium text-text-secondary">
                        Widget Border Radius
                      </label>
                      <select
                        value={widgetBorderRadius}
                        onChange={e => setWidgetBorderRadius(e.target.value)}
                        className="w-full h-9 rounded-lg border border-white/8 bg-white/3 px-3 text-[12.5px] text-text-primary focus:outline-none focus:border-primary transition-colors"
                      >
                        <option value="full" className="bg-surface-2 text-text-primary">Full (Rounded Circular)</option>
                        <option value="lg" className="bg-surface-2 text-text-primary">Large (Modern Rounded)</option>
                        <option value="md" className="bg-surface-2 text-text-primary">Medium (Standard)</option>
                        <option value="none" className="bg-surface-2 text-text-primary">Square (No rounding)</option>
                      </select>
                    </div>

                    {/* Agent Display Name */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium text-text-secondary">
                        Agent Custom Name
                      </label>
                      <input
                        type="text"
                        value={widgetAgentName}
                        onChange={e => setWidgetAgentName(e.target.value)}
                        placeholder="e.g. Nova, AI Support Agent"
                        className="w-full h-9 rounded-lg border border-white/8 bg-white/3 px-3 text-[12.5px] text-text-primary focus:outline-none focus:border-primary transition-colors placeholder:text-text-tertiary"
                      />
                    </div>

                    {/* Logo URL */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium text-text-secondary">
                        Custom Logo/Avatar URL
                      </label>
                      <input
                        type="url"
                        value={widgetLogoUrl}
                        onChange={e => setWidgetLogoUrl(e.target.value)}
                        placeholder="e.g. https://domain.com/avatar.png"
                        className="w-full h-9 rounded-lg border border-white/8 bg-white/3 px-3 text-[12.5px] text-text-primary focus:outline-none focus:border-primary transition-colors placeholder:text-text-tertiary"
                      />
                    </div>

                    {/* Greeting Message */}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[12px] font-medium text-text-secondary">
                        Widget Greeting Prompt Subtitle
                      </label>
                      <input
                        type="text"
                        value={widgetGreeting}
                        onChange={e => setWidgetGreeting(e.target.value)}
                        placeholder="e.g. Click to start a neural voice session"
                        className="w-full h-9 rounded-lg border border-white/8 bg-white/3 px-3 text-[12.5px] text-text-primary focus:outline-none focus:border-primary transition-colors placeholder:text-text-tertiary"
                      />
                    </div>

                    {/* Widget Corner Position */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium text-text-secondary">
                        Floating Widget Position
                      </label>
                      <select
                        value={widgetPosition}
                        onChange={e => setWidgetPosition(e.target.value)}
                        className="w-full h-9 rounded-lg border border-white/8 bg-white/3 px-3 text-[12.5px] text-text-primary focus:outline-none focus:border-primary transition-colors"
                      >
                        <option value="right" className="bg-surface-2 text-text-primary">Bottom Right Corner</option>
                        <option value="left" className="bg-surface-2 text-text-primary">Bottom Left Corner</option>
                      </select>
                    </div>

                    {/* Toggle: Show Branding */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/2">
                      <div>
                        <p className="text-[12.5px] font-semibold text-text-primary">Show Branding</p>
                        <p className="text-[10px] text-text-secondary">Render 'Powered by ZeVox' in card footer.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={widgetShowBranding}
                        onChange={e => setWidgetShowBranding(e.target.checked)}
                        className="w-4 h-4 border-white/8 rounded bg-white/3 accent-primary cursor-pointer"
                      />
                    </div>

                    {/* Toggle: Auto Open */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/2">
                      <div>
                        <p className="text-[12.5px] font-semibold text-text-primary">Auto-Open Prompt</p>
                        <p className="text-[10px] text-text-secondary">Slide open the welcome prompt card on page load.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={widgetAutoOpen}
                        onChange={e => setWidgetAutoOpen(e.target.checked)}
                        className="w-4 h-4 border-white/8 rounded bg-white/3 accent-primary cursor-pointer"
                      />
                    </div>

                    {/* Toggle: Voice Only */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/2">
                      <div>
                        <p className="text-[12.5px] font-semibold text-text-primary">Voice-Only Mode</p>
                        <p className="text-[10px] text-text-secondary">Hide text logs inside the widget, purely audio-driven.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={widgetVoiceOnly}
                        onChange={e => setWidgetVoiceOnly(e.target.checked)}
                        className="w-4 h-4 border-white/8 rounded bg-white/3 accent-primary cursor-pointer"
                      />
                    </div>

                  </div>
                </CardContent>
              </Card>
            )}

            {/* Embed Code Snippet */}
            {selectedAgent?.token && (
              <Card className="border-white/8 bg-surface-1">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">Embed Code Snippet</h4>
                      <p className="text-[11px] text-text-secondary">Paste this snippet before the &lt;/body&gt; tag in your HTML or ServiceNow Portal widget.</p>
                    </div>
                    
                    <button
                      onClick={handleCopyCode}
                      className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-white/8 bg-white/3 hover:bg-white/6 hover:border-white/12 text-text-secondary hover:text-text-primary text-[11px] font-semibold transition-all"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-success stroke-[2.5px]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy Code
                    </button>
                  </div>

                  <pre className="bg-black/50 rounded-xl border border-white/6 p-4 text-[11px] font-mono text-text-secondary leading-relaxed overflow-x-auto select-all">
{`<!-- ZeVox Voice Agent Widget -->
<script>
  window.ZEVOX_TOKEN = "${selectedAgent.token}";
</script>
<script src="${APP_URL}/widget.js"></script>`}
                  </pre>
                </CardContent>
              </Card>
            )}

          </div>

          {/* ── Right column: Real-time Live Mockup Preview ── */}
          <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-[74px]">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary flex items-center gap-1.5 px-1">
              <Eye className="w-3.5 h-3.5 text-primary" />
              Live Visual Preview
            </h4>

            {/* Float Mode Mockup */}
            <div className="relative rounded-2xl border border-white/8 bg-zinc-955 p-6 min-h-[360px] flex flex-col justify-between overflow-hidden shadow-inner">
              {/* Background grid representation */}
              <div 
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.1) 0%, transparent 60%)',
                  backgroundSize: '24px 24px'
                }}
              />
              
              <div className="relative flex items-center justify-between text-[10px] text-text-tertiary border-b border-white/5 pb-2">
                <span>Page Layout Preview</span>
                <span className="bg-white/4 px-1.5 py-0.5 rounded border border-white/5">Floating Portal</span>
              </div>

              {/* Centered static Card preview representation (as if expanded) */}
              <div className="relative z-10 max-w-[260px] mx-auto bg-surface-1 border border-white/8 rounded-2xl p-4 flex flex-col items-center gap-3 text-center shadow-2xl animate-fade-up">
                
                {/* Customizer Subheader / Agent label */}
                <span className="text-[9px] font-bold tracking-widest uppercase text-text-tertiary bg-white/4 px-2 py-0.5 rounded-full border border-white/5">
                  Voice Assistant
                </span>

                {/* Orb with custom colors/gradient + logo */}
                <div 
                  className="w-14 h-14 rounded-full flex items-center justify-center relative shadow-lg"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, ${widgetColor}, ${widgetColor} 40%, #0d1117 100%)`,
                    boxShadow: `0 0 0 2px ${widgetColor}26, 0 6px 20px ${widgetColor}60`
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none" />
                  {widgetLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={widgetLogoUrl} 
                      alt="" 
                      className="w-14 h-14 object-cover rounded-full relative z-10" 
                      onError={(e) => { (e.target as HTMLImageElement).src = '' }} 
                    />
                  ) : (
                    <Mic className="w-5 h-5 text-white relative z-10" />
                  )}
                </div>

                {/* Status & labels */}
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">
                    {widgetAgentName || selectedAgent?.name || 'Voice Assistant'}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    {widgetGreeting || 'Click to start a neural voice session'}
                  </p>
                </div>

                {/* Custom waveform dots */}
                <div className="flex gap-1 items-center h-4 py-1.5 opacity-60">
                  <span className="w-1 h-3 rounded-full" style={{ backgroundColor: widgetColor }} />
                  <span className="w-1 h-4 rounded-full" style={{ backgroundColor: widgetColor }} />
                  <span className="w-1 h-2 rounded-full" style={{ backgroundColor: widgetColor }} />
                  <span className="w-1 h-1.5 rounded-full" style={{ backgroundColor: widgetColor }} />
                </div>

                {/* Safe Syncing Disclaimer */}
                {widgetShowBranding && (
                  <p className="text-[9px] text-text-tertiary border-t border-white/5 pt-2 w-full">
                    Powered by <span className="font-medium text-text-secondary">ZeVox</span>
                  </p>
                )}
              </div>

              {/* Static corner orb (when collapsed) in bottom corner */}
              <div className={`w-full flex items-center border-t border-white/5 pt-3 ${widgetPosition === 'left' ? 'justify-start' : 'justify-end'}`}>
                <div className="flex items-center gap-2 bg-surface-1 border border-white/8 rounded-full p-1.5 pr-3 shadow-lg">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center relative"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, ${widgetColor}, ${widgetColor} 40%, #0d1117 100%)`,
                      boxShadow: `0 0 0 1px ${widgetColor}26, 0 2px 8px ${widgetColor}40`
                    }}
                  >
                    {widgetLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={widgetLogoUrl} alt="" className="w-8 h-8 object-cover rounded-full relative z-10" />
                    ) : (
                      <Mic className="w-3 h-3 text-white relative z-10" />
                    )}
                  </div>
                  <span className="text-[10.5px] font-semibold text-text-primary">Start a call</span>
                </div>
              </div>

            </div>

            {/* Customization Details card */}
            <div className="rounded-xl border border-white/8 bg-surface-1 p-4 text-[11.5px] text-text-secondary leading-relaxed space-y-2">
              <p className="font-semibold text-text-primary flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Theme Synchronization
              </p>
              <p>
                Widget customization is completely self-contained. The client-side <code>widget.js</code> dynamically resolves these settings from the database in real-time when loaded.
              </p>
              <p className="text-text-tertiary">
                No ServiceNow code changes or updates are needed on your portal to reflect layout, name, or color styling modifications!
              </p>
            </div>

          </div>

        </div>
      )}
    </div>
  )
}
