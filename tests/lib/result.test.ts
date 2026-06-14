/**
 * TEST: result.test.ts
 *
 * Verifies the Result<T, E> type and helpers used by all services,
 * plus the DomainError hierarchy mapped by withApiHandler().
 */
import { describe, it, expect } from 'vitest'
import {
  ok,
  err,
  isOk,
  isErr,
  type Result,
  DomainError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InvalidStateError,
  InsufficientPaymentsError,
} from '@/lib/result'

describe('ok / err / isOk / isErr', () => {
  it('ok() creates a success result with the value', () => {
    const r = ok({ id: '123' })
    expect(r).toEqual({ ok: true, value: { id: '123' } })
  })

  it('err() creates an error result with the error', () => {
    const r = err(new Error('boom'))
    expect(r).toEqual({ ok: false, error: new Error('boom') })
  })

  it('isOk narrows to success branch', () => {
    const r = ok(42)
    if (isOk(r)) {
      // TypeScript should know r.value exists here
      expect(r.value).toBe(42)
    } else {
      throw new Error('should be ok')
    }
  })

  it('isErr narrows to error branch', () => {
    const r: Result<string, Error> = err(new Error('x'))
    if (isErr(r)) {
      expect(r.error.message).toBe('x')
    } else {
      throw new Error('should be err')
    }
  })

  it('isOk returns false for error results', () => {
    expect(isOk(err('x'))).toBe(false)
  })

  it('isErr returns false for success results', () => {
    expect(isErr(ok('x'))).toBe(false)
  })
})

describe('DomainError', () => {
  it('stores code and message', () => {
    const e = new DomainError('SOME_CODE', 'some message')
    expect(e.code).toBe('SOME_CODE')
    expect(e.message).toBe('some message')
  })

  it('is an Error subclass with name = "DomainError"', () => {
    const e = new DomainError('X', 'Y')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('DomainError')
  })
})

describe('NotFoundError', () => {
  it('formats message with id', () => {
    const e = new NotFoundError('Project', 'abc123')
    expect(e.code).toBe('NOT_FOUND')
    expect(e.message).toBe('Project with id "abc123" not found')
  })

  it('formats message without id', () => {
    const e = new NotFoundError('Project')
    expect(e.message).toBe('Project not found')
  })
})

describe('ConflictError', () => {
  it('stores code CONFLICT and the given message', () => {
    const e = new ConflictError('Lead already converted')
    expect(e.code).toBe('CONFLICT')
    expect(e.message).toBe('Lead already converted')
  })
})

describe('ValidationError', () => {
  it('stores code, message, and optional field', () => {
    const e = new ValidationError('Invalid email', 'email')
    expect(e.code).toBe('VALIDATION_ERROR')
    expect(e.message).toBe('Invalid email')
    expect(e.field).toBe('email')
  })

  it('field is undefined when not provided', () => {
    const e = new ValidationError('Bad input')
    expect(e.field).toBeUndefined()
  })
})

describe('InvalidStateError', () => {
  it('stores code INVALID_STATE and the message', () => {
    const e = new InvalidStateError('Lead must be in WON stage')
    expect(e.code).toBe('INVALID_STATE')
    expect(e.message).toBe('Lead must be in WON stage')
  })
})

describe('InsufficientPaymentsError', () => {
  it('formats message with required and received amounts', () => {
    const e = new InsufficientPaymentsError(10000, 4000)
    expect(e.code).toBe('INSUFFICIENT_PAYMENTS')
    expect(e.message).toBe('Invoice requires 10000 in payments, only 4000 received')
  })
})
