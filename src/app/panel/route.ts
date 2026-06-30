export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'X-Frame-Options': 'ALLOWALL',
  'Content-Security-Policy': "frame-ancestors *",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const token = url.searchParams.get('token') || ''
  const agent = url.searchParams.get('agent') || ''
  const table = url.searchParams.get('table') || ''
  const sysId = url.searchParams.get('sys_id') || ''
  const display = url.searchParams.get('display') || ''
  const gw = url.origin

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZeVox</title>
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#fff}</style>
</head>
<body>
<script>
window.ZEVOX_TOKEN=${JSON.stringify(token)};
window.ZEVOX_AGENT=${JSON.stringify(agent)};
</script>
<script src="${gw}/panel.js?token=${encodeURIComponent(token)}&agent=${encodeURIComponent(agent)}&table=${encodeURIComponent(table)}&sys_id=${encodeURIComponent(sysId)}&display=${encodeURIComponent(display)}&gw=${encodeURIComponent(gw)}&_t=${Date.now()}"></script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
  })
}
