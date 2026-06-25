import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_MODE = process.env.ADMIN_MODE === 'true'

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname

  if (ADMIN_MODE) {
    if (path === '/') {
      return NextResponse.redirect(new URL('/admin', req.url))
    }
    const allowed =
      path.startsWith('/admin') ||
      path.startsWith('/api/admin') ||
      path.startsWith('/api/auth') ||
      path.startsWith('/auth') ||
      path.startsWith('/_next') ||
      path === '/favicon.ico'
    if (allowed) return NextResponse.next()
    return new NextResponse('Not found', { status: 404 })
  }

  if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
    return new NextResponse('Not found', { status: 404 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$).*)',
  ],
}
