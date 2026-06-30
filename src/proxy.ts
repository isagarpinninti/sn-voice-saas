import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_MODE = process.env.ADMIN_MODE === 'true'

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Note: /api/admin/* route-level auth is handled in each individual route handler
  // via isUserAdmin(session). A middleware-level JWT guard was removed because this
  // app uses database sessions (PrismaAdapter), not JWT, so getToken() always returns
  // null and would block all authenticated admin requests with 401.

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

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$).*)',
  ],
}
