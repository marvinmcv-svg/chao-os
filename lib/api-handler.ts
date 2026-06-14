/**
 * withApiHandler() — wraps a route handler with:
 *   1. try/catch that converts thrown errors to JSON responses
 *   2. response envelope: `{ success: true, data }` on success
 *   3. error envelope:   `{ success: false, error: { code, message, field? } }`
 *   4. proper HTTP status codes per error type
 *
 * Before (in every route):
 *   export async function POST(req: NextRequest) {
 *     try {
 *       const body = Schema.parse(await req.json())
 *       const result = await service.doThing(body)
 *       return NextResponse.json({ success: true, data: result })
 *     } catch (err) {
 *       if (err instanceof ZodError) { ... 30 lines of error mapping ... }
 *       if (err instanceof DomainError) { ... }
 *       return NextResponse.json({ ... }, { status: 500 })
 *     }
 *   }
 *
 * After:
 *   export const POST = withApiHandler(async (req: NextRequest) => {
 *     const body = Schema.parse(await req.json())
 *     return service.doThing(body)
 *   })
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DomainError, ValidationError } from './result'
import { UnauthorizedError } from './require-auth'

interface ApiErrorBody {
  code: string
  message: string
  field?: string
}

/**
 * Wrap an async handler so its return value becomes a success response
 * and any thrown error becomes a typed error response.
 */
export function withApiHandler<TArgs extends unknown[], TResponse>(
  handler: (...args: TArgs) => Promise<TResponse>
): (...args: TArgs) => Promise<NextResponse> {
  return async (...args: TArgs) => {
    try {
      const data = await handler(...args)
      return NextResponse.json({ success: true, data })
    } catch (error) {
      return errorToResponse(error)
    }
  }
}

function errorToResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return body(
      { code: error.code, message: error.message },
      401
    )
  }

  if (error instanceof ZodError) {
    const first = error.errors[0]
    return body(
      {
        code: 'VALIDATION_ERROR',
        message: first?.message ?? 'Invalid input',
        field: first?.path.join('.') || undefined,
      },
      400
    )
  }

  if (error instanceof DomainError) {
    const errorBody: ApiErrorBody = { code: error.code, message: error.message }
    // Surface the `field` on ValidationError so the client knows which
    // input was bad (e.g. { field: 'email', code: 'VALIDATION_ERROR' }).
    if (error instanceof ValidationError && error.field) {
      errorBody.field = error.field
    }
    return body(errorBody, domainErrorStatus(error.code))
  }

  // Unknown error — log and return generic 500 (don't leak internals)
  console.error('[api] Unhandled error in route handler:', error)
  return body(
    { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    500
  )
}

function body(error: ApiErrorBody, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status })
}

/** Map domain error code -> HTTP status. */
function domainErrorStatus(code: string): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404
    case 'CONFLICT':
      return 409
    case 'FORBIDDEN':
      return 403
    case 'INVALID_STATE':
      return 422
    case 'VALIDATION_ERROR':
    case 'INSUFFICIENT_PAYMENTS':
      return 400
    default:
      return 400
  }
}
