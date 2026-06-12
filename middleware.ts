import { auth } from '@/lib/auth'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware route logic, extracted as a pure function so it can be
 * unit-tested without the NextAuth Edge runtime wrapper.
 *
 * Contract:
 *  - `/api/auth/*`  — always allowed (NextAuth handles its own auth)
 *  - `/login`       — if logged in, redirect to /dashboard
 *  - `/api/*`       — if not logged in, return 401 JSON (NOT a redirect)
 *  - `/`            — public, always allowed
 *  - everything else — if not logged in, redirect to /login
 */
export function checkRoute(req: NextRequest & { auth: unknown }): NextResponse {
  const isLoggedIn = !!req.auth
  const path = req.nextUrl.pathname
  const isLoginPage = path === '/login'
  const isApiAuthRoute = path.startsWith('/api/auth')
  const isApiRoute = path.startsWith('/api/')
  const isPublicRoute = path === '/'

  // Allow NextAuth's own API routes
  if (isApiAuthRoute) {
    return NextResponse.next()
  }

  // Redirect logged-in users away from login page
  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Non-logged-in users hitting an API: return 401 JSON, not an HTML redirect.
  // (Bug #3 — fixed June 12, 2026)
  if (!isLoggedIn && isApiRoute) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
      { status: 401 }
    )
  }

  // Non-logged-in users hitting a protected non-API route: redirect to login
  if (!isLoginPage && !isLoggedIn && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export default auth(checkRoute)

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)'],
}