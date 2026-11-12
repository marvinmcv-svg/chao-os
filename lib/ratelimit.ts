// Simple in-memory rate limiter for auth endpoints
// In production, use Redis-based rate limiting with Upstash

const attempts = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_ATTEMPTS = 5

export function checkRateLimit(ip: string, max: number = MAX_ATTEMPTS): { success: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const record = attempts.get(ip)

  // Clean up expired entries
  if (record && record.resetAt < now) {
    attempts.delete(ip)
  }

  const current = attempts.get(ip)

  if (!current) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { success: true, remaining: max - 1, resetIn: WINDOW_MS }
  }

  if (current.count >= max) {
    return { success: false, remaining: 0, resetIn: current.resetAt - now }
  }

  current.count++
  return { success: true, remaining: max - current.count, resetIn: current.resetAt - now }
}