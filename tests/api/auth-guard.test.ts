/**
 * TEST 2: auth-guard.test.ts
 *
 * Verifies the middleware's `checkRoute` function (extracted from
 * middleware.ts so it can be tested in isolation).
 *
 * This is the regression test for **Bug #3** (June 12, 2026):
 * `/api/*` paths without a session were returning 307 redirects
 * to the login page (HTML) instead of 401 JSON.
 *
 * Coverage:
 *  - /api/* without session → 401 JSON
 *  - /api/* with session → next (passes through)
 *  - /api/auth/* → always allowed (NextAuth handles its own auth)
 *  - /login with session → 307 to /dashboard
 *  - /login without session → next
 *  - / (root) → always allowed (public route)
 *  - /dashboard without session → 307 to /login
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { checkRoute } from '@/middleware'

function makeReq(path: string, auth: unknown = null) {
  const req = new NextRequest(`http://localhost:3000${path}`)
  // The real NextAuth middleware attaches `req.auth` before calling checkRoute.
  ;(req as NextRequest & { auth: unknown }).auth = auth
  return req as NextRequest & { auth: unknown }
}

describe('checkRoute (middleware)', () => {
  describe('API routes', () => {
    it('returns 401 JSON for /api/projects without session (Bug #3 regression)', async () => {
      const res = checkRoute(makeReq('/api/projects'))
      expect(res.status).toBe(401)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      const body = await res.json()
      expect(body).toEqual({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No autenticado' },
      })
    })

    it('returns 401 JSON for every protected API path (sampling 5 routes)', async () => {
      const protectedPaths = [
        '/api/leads',
        '/api/invoices',
        '/api/dashboard/kpis',
        '/api/finance/pnl',
        '/api/team',
      ]
      for (const path of protectedPaths) {
        const res = checkRoute(makeReq(path))
        expect(res.status, `expected 401 for ${path}`).toBe(401)
        expect(res.headers.get('content-type'), `${path} should be JSON`).toMatch(/application\/json/)
      }
    })

    it('returns 401 (not redirect) for /api/* — content-type must be JSON', async () => {
      // Critical: this catches the bug where the middleware returned a
      // 307 redirect (with HTML body) for API routes.
      const res = checkRoute(makeReq('/api/clients'))
      expect(res.status).not.toBe(307) // NOT a redirect
      expect(res.status).not.toBe(302) // NOT a redirect
      const text = await res.clone().text()
      expect(text).not.toMatch(/<html/i) // NOT HTML
    })

    it('passes through /api/* with a valid session', () => {
      const fakeSession = { user: { id: 'u1', email: 'a@b.c' } }
      const res = checkRoute(makeReq('/api/projects', fakeSession))
      expect(res.status).toBe(200) // NextResponse.next() returns 200
    })
  })

  describe('NextAuth routes', () => {
    it('always allows /api/auth/* even without session', () => {
      const res = checkRoute(makeReq('/api/auth/csrf'))
      expect(res.status).toBe(200)
    })

    it('always allows /api/auth/callback/*', () => {
      const res = checkRoute(makeReq('/api/auth/callback/credentials'))
      expect(res.status).toBe(200)
    })
  })

  describe('Login page', () => {
    it('redirects logged-in users from /login to /dashboard', () => {
      const fakeSession = { user: { id: 'u1' } }
      const res = checkRoute(makeReq('/login', fakeSession))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard')
    })

    it('allows /login through when not logged in', () => {
      const res = checkRoute(makeReq('/login'))
      expect(res.status).toBe(200)
    })
  })

  describe('Public route (/)', () => {
    it('allows / through even without session', () => {
      const res = checkRoute(makeReq('/'))
      expect(res.status).toBe(200)
    })
  })

  describe('Protected non-API routes', () => {
    it('redirects /dashboard to /login without session', () => {
      const res = checkRoute(makeReq('/dashboard'))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe('http://localhost:3000/login')
    })

    it('redirects /projects to /login without session', () => {
      const res = checkRoute(makeReq('/projects'))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe('http://localhost:3000/login')
    })

    it('allows /projects through with session', () => {
      const fakeSession = { user: { id: 'u1' } }
      const res = checkRoute(makeReq('/projects', fakeSession))
      expect(res.status).toBe(200)
    })
  })
})
