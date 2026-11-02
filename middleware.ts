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
 *  - `/portal/*`, `/api/portal/*` — public: clients authenticate with their
 *    own portal token (validated per request by PortalService), not a staff
 *    session. Previously these were gated behind staff login, so no client
 *    could ever open the portal.
 *  - everything else — if not logged in, redirect to /login
 */
export function checkRoute(req: NextRequest & { auth: unknown }): NextResponse {
  const isLoggedIn = !!req.auth
  const path = req.nextUrl.pathname
  const isLoginPage = path === '/login'
  const isApiAuthRoute = path.startsWith('/api/auth')
  const isApiRoute = path.startsWith('/api/')
  const isPublicRoute = path === '/'
  const isPortalRoute =
    path === '/portal' || path.startsWith('/portal/') || path.startsWith('/api/portal/')

  // Allow NextAuth's own API routes and the token-authenticated client portal
  if (isApiAuthRoute || isPortalRoute) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|robots\\.txt|sitemap\\.xml|icons/|.*\\.png$|.*\\.svg$).*)'],
}