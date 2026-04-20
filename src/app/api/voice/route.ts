export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

// This route provides info about the voice WebSocket endpoint
// The actual WebSocket is handled by the custom server (server.ts)
export async function GET() {
  return NextResponse.json({
    status: 'Voice gateway active',
    websocket: 'ws://[host]/api/voice/ws',
    usage: 'Connect via WebSocket with ?token=YOUR_API_TOKEN',
  })
}
