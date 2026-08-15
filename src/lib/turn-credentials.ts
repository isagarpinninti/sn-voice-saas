import 'server-only'

const NTS_TTL_SECONDS = 120

export type IceServer = {
  urls: string
  username?: string
  credential?: string
}

/**
 * Time-limited ICE servers via Twilio's Network Traversal Service (NTS).
 * ZeVox has never needed WebRTC/TURN before this merge (see M6 of the merge
 * plan) — NTS was chosen over standing up coturn because ZeVox already has
 * live Twilio credentials for phone calling, and coturn is a stateful UDP
 * service whose fit on the current host is unverified.
 *
 * Falls back to STUN-only when Twilio isn't configured (mirrors
 * VoiceConnect's own turn-credentials.ts degrading to STUN-only when
 * TURN_URL/TURN_SECRET are unset) so local dev without Twilio creds still
 * gets a working — if occasionally NAT-blocked — ICE list rather than a
 * hard failure.
 */
export async function generateIceServers(): Promise<IceServer[]> {
  const stun: IceServer = { urls: 'stun:stun.l.google.com:19302' }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return [stun]
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ Ttl: String(NTS_TTL_SECONDS) }),
  })

  if (!response.ok) {
    // A misconfigured/expired Twilio token shouldn't take the whole call
    // path down — degrade to STUN-only, same as the "not configured" case.
    return [stun]
  }

  const data = (await response.json()) as { ice_servers?: Array<{ url?: string; urls?: string; username?: string; credential?: string }> }
  const servers = (data.ice_servers ?? [])
    .map((s) => ({ urls: s.urls ?? s.url ?? '', username: s.username, credential: s.credential }))
    .filter((s) => s.urls)

  return servers.length > 0 ? servers : [stun]
}
