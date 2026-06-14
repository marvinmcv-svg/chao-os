/**
 * TEST: api-handler.test.ts
 *
 * Verifies withApiHandler() — the wrapper that turns a service-returning
 * handler into a route handler that:
 *   - returns { success: true, data } envelope on success
 *   - maps thrown errors to { success: false, error } with proper HTTP status
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ZodError } from 'zod'
import { withApiHandler } from '@/lib/api-handler'
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  InvalidStateError,
  InsufficientPaymentsError,
  ForbiddenError,
} from '@/lib/result'
import { UnauthorizedError } from '@/lib/require-auth'

// Suppress console.error for the unhandled-error test
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('withApiHandler — success path', () => {
  it('wraps the returned value in { success: true, data }', async () => {
    const handler = withApiHandler(async () => ({ id: '123', name: 'Test' }))
    const res = await handler()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { id: '123', name: 'Test' } })
  })

  it('propagates handler args to the inner function', async () => {
    const handler = withApiHandler(async (a: number, b: number) => a + b)
    const res = await handler(2, 3)
    const body = await res.json()
    expect(body.data).toBe(5)
  })
})

describe('withApiHandler — error mapping', () => {
  it('UnauthorizedError -> 401', async () => {
    const handler = withApiHandler(async () => {
      throw new UnauthorizedError()
    })
    const res = await handler()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    })
  })

  it('ZodError -> 400 with VALIDATION_ERROR and the first field path', async () => {
    const handler = withApiHandler(async () => {
      throw new ZodError([
        { code: 'invalid_type', path: ['email'], message: 'Invalid email' } as never,
      ])
    })
    const res = await handler()
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Invalid email')
    expect(body.error.field).toBe('email')
  })

  it('NotFoundError -> 404 with NOT_FOUND code', async () => {
    const handler = withApiHandler(async () => {
      throw new NotFoundError('Project', 'p1')
    })
    const res = await handler()
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toContain('Project')
  })

  it('ConflictError -> 409', async () => {
    const handler = withApiHandler(async () => {
      throw new ConflictError('Lead already converted')
    })
    const res = await handler()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('CONFLICT')
  })

  it('ForbiddenError -> 403 with FORBIDDEN code', async () => {
    const handler = withApiHandler(async () => {
      throw new ForbiddenError('Not allowed')
    })
    const res = await handler()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toBe('Not allowed')
  })

  it('InvalidStateError -> 422', async () => {
    const handler = withApiHandler(async () => {
      throw new InvalidStateError('Lead must be in WON stage')
    })
    const res = await handler()
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe('INVALID_STATE')
  })

  it('InsufficientPaymentsError -> 400 with INSUFFICIENT_PAYMENTS code', async () => {
    const handler = withApiHandler(async () => {
      throw new InsufficientPaymentsError(10000, 4000)
    })
    const res = await handler()
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('INSUFFICIENT_PAYMENTS')
  })

  it('ValidationError -> 400 (custom field included)', async () => {
    const handler = withApiHandler(async () => {
      throw new ValidationError('Bad input', 'projectId')
    })
    const res = await handler()
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.field).toBe('projectId')
  })

  it('unknown error -> 500 with INTERNAL_ERROR (does not leak internals)', async () => {
    const handler = withApiHandler(async () => {
      throw new Error('DB password is hunter2')
    })
    const res = await handler()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).toBe('An unexpected error occurred')
    // Sensitive info is NOT in the response
    expect(body.error.message).not.toContain('hunter2')
    // ...but IS in the server log
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled error'),
      expect.anything()
    )
  })
})
