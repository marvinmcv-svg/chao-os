/**
 * requireAuth() — eliminates the duplicated auth check at the top of
 * every protected route handler.
 *
 * Before (in every route):
 *   const session = await auth()
 *   if (!session?.user) {
 *     return NextResponse.json(
 *       { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
 *       { status: 401 }
 *     )
 *   }
 *   const user = session.user
 *
 * After:
 *   const user = await requireAuth()
 *
 * The thrown `UnauthorizedError` is caught by `withApiHandler()` and
 * mapped to a 401 JSON response.
 */

import { auth } from './auth'
import { DomainError } from './result'

export class UnauthorizedError extends DomainError {
  constructor(message?: string) {
    super('UNAUTHORIZED', message ?? 'Authentication required')
  }
}

/**
 * Returns the current session user, or throws `UnauthorizedError`.
 * Use in any route handler that requires authentication.
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()
  return session.user
}
