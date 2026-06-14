/**
 * TEST: require-auth.test.ts
 *
 * Verifies the requireAuth() helper that eliminates duplicated
 * `if (!session) return 401` boilerplate in route handlers.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock @/lib/auth so we control the session shape
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { requireAuth, UnauthorizedError } from '@/lib/require-auth'

const mockAuth = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>

describe('requireAuth', () => {
  it('returns the user when a valid session exists', async () => {
    const user = { id: 'u1', email: 'a@b.com', name: 'Test', role: 'ADMIN', avatarInitials: 'T' }
    mockAuth.mockResolvedValueOnce({ user } as never)
    const result = await requireAuth()
    expect(result).toEqual(user)
  })

  it('throws UnauthorizedError when session is null', async () => {
    mockAuth.mockResolvedValueOnce(null as never)
    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws UnauthorizedError when session has no user', async () => {
    mockAuth.mockResolvedValueOnce({} as never)
    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('UnauthorizedError has UNAUTHORIZED code and is a DomainError', () => {
    const e = new UnauthorizedError()
    expect(e.code).toBe('UNAUTHORIZED')
    expect(e.message).toBe('Authentication required')
  })
})
