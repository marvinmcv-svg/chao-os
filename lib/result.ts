/**
 * Result<T, E> — type-safe domain error handling.
 *
 * Services return `Result<T, E>` instead of throwing, so route handlers
 * can pattern-match on the outcome. `withApiHandler()` then maps
 * `DomainError` instances to proper HTTP status codes.
 *
 * Example:
 *   const result = await projectService.create(input)
 *   if (!result.ok) return handleError(result.error)
 *   return result.value
 *
 * Inspired by Rust's `Result<T, E>` and TypeScript's neverthrow library,
 * but kept minimal — just the four primitives below.
 */

export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/** Wrap a success value. Returned type is `Result<T, never>`. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/** Wrap an error value. Returned type is `Result<never, E>`. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/** Type guard: narrows to the success branch. */
export function isOk<T, E>(r: Result<T, E>): r is { ok: true; value: T } {
  return r.ok
}

/** Type guard: narrows to the error branch. */
export function isErr<T, E>(r: Result<T, E>): r is { ok: false; error: E } {
  return !r.ok
}

// ─── Domain error hierarchy ───────────────────────────────────────────────

/**
 * Base class for all expected, typed business errors. Services throw
 * these (or return them in a Result) when a known business rule fails.
 * `withApiHandler()` maps `code` to an HTTP status.
 */
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Resource not found (HTTP 404). */
export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id "${id}" not found`
      : `${resource} not found`
    super('NOT_FOUND', message)
  }
}

/** Business-rule conflict, e.g. converting a lead twice (HTTP 409). */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super('CONFLICT', message)
  }
}

/** Input failed schema or business validation (HTTP 400). */
export class ValidationError extends DomainError {
  constructor(message: string, public readonly field?: string) {
    super('VALIDATION_ERROR', message)
  }
}

/** State machine error, e.g. converting a lead not in WON stage (HTTP 422). */
export class InvalidStateError extends DomainError {
  constructor(message: string) {
    super('INVALID_STATE', message)
  }
}

/** Invoice-specific: PAID status requires payments >= amount (HTTP 400). */
export class InsufficientPaymentsError extends DomainError {
  constructor(required: number, received: number) {
    super(
      'INSUFFICIENT_PAYMENTS',
      `Invoice requires ${required} in payments, only ${received} received`
    )
  }
}

/**
 * Authenticated but lacks permission for this resource (HTTP 403).
 *
 * Distinct from UnauthorizedError (401 = "who are you?").
 * Use this when the caller IS authenticated but is trying to access
 * a resource they don't own (e.g. client trying to view another
 * client's project, or employee without the right role).
 */
export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super('FORBIDDEN', message)
  }
}
