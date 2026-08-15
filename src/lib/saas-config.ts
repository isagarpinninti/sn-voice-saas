/**
 * Fetch the singleton SaasConfig from the DB with sensible defaults.
 * Called from server components (layout, metadata) — result is not cached
 * between deploys; a full redeploy picks up name/logo/favicon changes.
 */
import { db } from '@/lib/db'

export interface SaasConfigData {
  saasName: string
  tagline: string
  logoUrl: string | null
  faviconUrl: string | null
  primaryColor: string
  darkBg: string
  supportEmail: string
}

const DEFAULTS: SaasConfigData = {
  saasName:     'ZeVox',
  tagline:      'Voice AI for Your Entire Stack',
  logoUrl:      null,
  faviconUrl:   null,
  primaryColor: '#10b981',
  darkBg:       '#000000',
  supportEmail: 'support@zevox.com',
}

export async function getSaasConfig(): Promise<SaasConfigData> {
  try {
    const cfg = await db.saasConfig.findUnique({ where: { id: 'default' } })
    if (!cfg) return DEFAULTS
    return {
      saasName:     cfg.saasName     || DEFAULTS.saasName,
      tagline:      cfg.tagline      || DEFAULTS.tagline,
      logoUrl:      cfg.logoUrl      || null,
      faviconUrl:   cfg.faviconUrl   || null,
      primaryColor: cfg.primaryColor || DEFAULTS.primaryColor,
      darkBg:       cfg.darkBg       || DEFAULTS.darkBg,
      supportEmail: cfg.supportEmail || DEFAULTS.supportEmail,
    }
  } catch {
    return DEFAULTS
  }
}
