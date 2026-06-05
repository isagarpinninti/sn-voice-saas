/**
 * Supabase client utilities.
 *
 * Three exports:
 *  - supabase          — browser/client-side client (uses publishable key)
 *  - createServerClient — server-side client factory (uses service_role key for
 *                         admin-level access; call inside Server Components / Route Handlers)
 *  - createBrowserClient — lightweight alias for client components
 *
 * Usage in a Server Component or Route Handler:
 *   import { createServerClient } from '@/lib/supabase'
 *   const sb = createServerClient()
 *   const { data } = await sb.from('my_table').select('*')
 *
 * Usage in a Client Component:
 *   import { supabase } from '@/lib/supabase'
 *   const { data } = await supabase.from('my_table').select('*')
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

// ── Browser / client-side client (publishable key — safe to expose) ──
// Singleton so all client components share one connection.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

export function createBrowserClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
}

// ── Server-side client (service_role key — bypasses Row Level Security) ──
// Creates a new client per call so it is safe to use in concurrent requests.
// Throws at runtime (not build time) if SUPABASE_SERVICE_ROLE_KEY is missing
// so the app still builds without it.
export function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your environment variables for server-side Supabase access.'
    )
  }
  return createClient(SUPABASE_URL, serviceKey, {
    auth: {
      // Service role clients should never persist sessions
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
