/**
 * Voice preview endpoint — synthesizes a short sample line for the given Aura voice
 * via Deepgram's REST TTS endpoint and returns audio/mpeg.
 *
 * - Auth-gated (NextAuth session) so anonymous traffic can't burn credits.
 * - In-memory cache: samples are immutable per voice id, so a Map with no TTL is fine.
 * - Browser cache: long immutable Cache-Control on the response.
 */
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { findVoice } from '@/lib/voices'

// Module-level cache — survives across requests in the same Node process.
const sampleCache = new Map<string, Buffer>()

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const voiceId = url.searchParams.get('voice') || ''
  const voice = findVoice(voiceId)
  if (!voice) {
    return NextResponse.json({ error: 'Unknown voice' }, { status: 400 })
  }

  // Cache hit — return immediately
  const cached = sampleCache.get(voice.id)
  if (cached) {
    return new Response(new Uint8Array(cached), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Cache': 'HIT',
      },
    })
  }

  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 500 })
  }

  // Hit Deepgram REST TTS — single request, returns the full audio file.
  const dgRes = await fetch(
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice.id)}&encoding=mp3`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: voice.sampleText }),
    }
  )

  if (!dgRes.ok) {
    const errText = await dgRes.text().catch(() => '')
    return NextResponse.json(
      { error: 'TTS upstream failed', status: dgRes.status, detail: errText.substring(0, 200) },
      { status: 502 }
    )
  }

  const arrayBuf = await dgRes.arrayBuffer()
  const buf = Buffer.from(arrayBuf)
  sampleCache.set(voice.id, buf)

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Cache': 'MISS',
    },
  })
}
