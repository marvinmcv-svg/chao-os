// Auth helpers for tests.
// `mockSession()` is used by route handler tests to fake a logged-in user.
// `loginAsAdmin()` runs the real credentials flow against the DB.

import { vi } from 'vitest'
import type { UserRole } from '@prisma/client'

export interface MockSession {
  user: {
    id: string
    email: string
    name: string
    role: UserRole
    avatarInitials: string
  }
}

/**
 * Mock the `auth` function from `@/lib/auth` to return a faked session.
 * Usage:
 *   const session = mockSession({ id: 'u1', role: 'ADMIN', ... })
 *   vi.mock('@/lib/auth', () => ({ auth: vi.fn().mockResolvedValue(session) }))
 */
export function mockSession(overrides: Partial<MockSession['user']> & { id: string }): MockSession {
  return {
    user: {
      id: overrides.id,
      email: overrides.email ?? 'test@chaoarquitectura.bo',
      name: overrides.name ?? 'Test User',
      role: overrides.role ?? 'ARCHITECT',
      avatarInitials: overrides.avatarInitials ?? 'TU',
    },
  }
}

/**
 * Run the real `authorizeCredentials` against the test DB.
 * Used by TEST 1 (auth.test.ts) to verify the full credentials flow.
 */
export async function loginAsAdmin() {
  const { authorizeCredentials } = await import('@/lib/auth')
  return authorizeCredentials('admin@chaoarquitectura.bo', 'Cha0Admin2025!')
}
