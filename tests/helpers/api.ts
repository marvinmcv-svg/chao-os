// API route invocation helpers.
// Direct invocation (no HTTP server) is faster and more deterministic.

import { NextRequest } from 'next/server'

/**
 * Build a NextRequest for direct route handler invocation.
 * Usage:
 *   const req = makeRequest('GET', 'http://localhost:3000/api/projects?status=ACTIVE')
 *   const res = await GET(req)
 */
export function makeRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  options: {
    body?: unknown
    headers?: Record<string, string>
  } = {}
): NextRequest {
  const init: RequestInit = { method, headers: options.headers ?? {} }
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    init.headers = { 'content-type': 'application/json', ...init.headers }
  }
  return new NextRequest(url, init)
}

/**
 * Parse a Response as JSON. Throws if the response is not JSON.
 */
export async function parseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      `Response was not JSON (status ${res.status}): ${text.slice(0, 200)}`
    )
  }
}

/**
 * Standard envelope from all route handlers:
 *   success: { success: true,  data: T, meta?: ... }
 *   error:   { success: false, error: { code, message, field? } }
 */
export interface ApiSuccess<T> {
  success: true
  data: T
  meta?: Record<string, unknown>
}
export interface ApiError {
  success: false
  error: { code: string; message: string; field?: string }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError
