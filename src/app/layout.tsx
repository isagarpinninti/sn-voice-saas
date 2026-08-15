export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { getSaasConfig } from '@/lib/saas-config'

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getSaasConfig()
  return {
    title: `${cfg.saasName} | ${cfg.tagline}`,
    description: cfg.tagline,
    icons: cfg.faviconUrl
      ? [{ rel: 'icon', url: cfg.faviconUrl }]
      : undefined,
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cfg = await getSaasConfig()

  // Convert hex to HSL for Tailwind CSS variables
  function hexToHsl(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0
    const l = (max + min) / 2
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
  }

  const primaryHsl = hexToHsl(cfg.primaryColor.startsWith('#') ? cfg.primaryColor : '#10b981')
  const bgHsl      = hexToHsl(cfg.darkBg.startsWith('#')       ? cfg.darkBg       : '#000000')

  const cssVars = `
    --primary: ${primaryHsl};
    --primary-foreground: 0 0% 100%;
    --background: ${bgHsl};
  `.trim()

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full`} style={{ colorScheme: 'dark' }}>
      <head>
        {cfg.faviconUrl && <link rel="icon" href={cfg.faviconUrl} />}
        <style>{`:root { ${cssVars} }`}</style>
      </head>
      <body className="min-h-full flex flex-col bg-black text-[#ededed] antialiased">
        {children}
      </body>
    </html>
  )
}
