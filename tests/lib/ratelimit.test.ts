/**
 * TEST 7: ratelimit.test.ts
 *
 * Verifies the in-memory rate limiter used on auth endpoints
 * (login, password reset) to prevent brute force attacks.
 *
 * Spec (from lib/ratelimit.ts):
 *  - WINDOW_MS = 60_000 (1 minute)
 *  - MAX_ATTEMPTS = 5
 *  - First call: success, remaining = 4
 *  - Calls 2-5: success, remaining decreases
 *  - Call 6+: blocked (success = false, remaining = 0)
 *  - Window expires after 60s, count resets
 *
 * Test isolation strategy:
 *  - Each test uses a unique IP (Map keyed by IP, so no cross-pollution)
 *  - Time is mocked with vi.useFakeTimers() to test window expiry
 *    without sleeping for 60 seconds
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit } from '@/lib/ratelimit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Pin to a known start time so resetIn assertions are deterministic
    vi.setSystemTime(new Date('2026-06-12T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('first call: success, remaining = 4, resetIn = 60_000', () => {
    const result = checkRateLimit('1.1.1.1')
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
    expect(result.resetIn).toBe(60_000)
  })

  it('counts decrement from 4 to 0 over 5 calls', () => {
    const ip = '2.2.2.2'
    expect(checkRateLimit(ip).remaining).toBe(4)
    expect(checkRateLimit(ip).remaining).toBe(3)
    expect(checkRateLimit(ip).remaining).toBe(2)
    expect(checkRateLimit(ip).remaining).toBe(1)
    expect(checkRateLimit(ip).remaining).toBe(0)
  })

  it('5th call still returns success (remaining = 0 is the boundary, not blocked)', () => {
    const ip = '3.3.3.3'
    for (let i = 0; i < 4; i++) checkRateLimit(ip)
    const result = checkRateLimit(ip)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('6th call: blocked (success = false, remaining = 0)', () => {
    const ip = '4.4.4.4'
    for (let i = 0; i < 5; i++) checkRateLimit(ip)
    const result = checkRateLimit(ip)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('different IPs are tracked independently (one IP blocked does not affect another)', () => {
    const ipA = '5.5.5.5'
    const ipB = '6.6.6.6'
    for (let i = 0; i < 5; i++) checkRateLimit(ipA)
    expect(checkRateLimit(ipA).success).toBe(false)
    // IP B is still fresh
    const bResult = checkRateLimit(ipB)
    expect(bResult.success).toBe(true)
    expect(bResult.remaining).toBe(4)
  })

  it('blocked call still returns a positive resetIn (time until unblock)', () => {
    const ip = '7.7.7.7'
    for (let i = 0; i < 5; i++) checkRateLimit(ip)
    const result = checkRateLimit(ip)
    expect(result.success).toBe(false)
    expect(result.resetIn).toBeGreaterThan(0)
    expect(result.resetIn).toBeLessThanOrEqual(60_000)
  })

  it('resetIn decreases as time passes within the window', () => {
    const ip = '8.8.8.8'
    const first = checkRateLimit(ip)
    expect(first.resetIn).toBe(60_000)
    vi.advanceTimersByTime(10_000)
    const second = checkRateLimit(ip)
    expect(second.resetIn).toBe(50_000)
  })

  it('after window expires (60s+1ms), count resets to fresh state', () => {
    const ip = '9.9.9.9'
    for (let i = 0; i < 5; i++) checkRateLimit(ip)
    expect(checkRateLimit(ip).success).toBe(false)
    vi.advanceTimersByTime(60_001) // 1 minute + 1ms
    const result = checkRateLimit(ip)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4) // fresh window
    expect(result.resetIn).toBe(60_000)
  })

  it('blocked call does NOT extend the window — timer keeps ticking down', () => {
    const ip = '10.10.10.10'
    for (let i = 0; i < 5; i++) checkRateLimit(ip)
    const blocked1 = checkRateLimit(ip)
    expect(blocked1.resetIn).toBe(60_000)
    vi.advanceTimersByTime(5_000)
    const blocked2 = checkRateLimit(ip)
    expect(blocked2.resetIn).toBe(55_000)
  })
})
