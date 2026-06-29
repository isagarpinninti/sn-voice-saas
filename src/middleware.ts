import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  // Protect all /api/admin/* routes — require authenticated admin session
  if (req.nextUrl.pathname.startsWith('/api/admin/')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(token as any).isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/admin/:path*'],
}
