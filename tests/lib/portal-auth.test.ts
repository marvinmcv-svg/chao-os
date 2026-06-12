/**
 * TEST 6: portal-auth.test.ts
 *
 * Verifies the portal token generation and hashing functions used for
 * client portal authentication (when clients log in to view their
 * project status).
 *
 * Security properties tested:
 *  - Token is cryptographically random (32 bytes from crypto.randomBytes)
 *  - Hash uses SHA-256 (one-way, no token recovery)
 *  - Hash is deterministic for the same input
 *  - Tiny input changes produce wildly different hashes (avalanche)
 *  - Raw token is never returned in the hash
 */
import { describe, it, expect } from 'vitest'
import { generatePortalToken, hashPortalToken } from '@/lib/portal-auth'

describe('portal-auth', () => {
  describe('generatePortalToken', () => {
    it('returns a 64-character lowercase hex raw token (32 bytes)', () => {
      const { raw } = generatePortalToken()
      expect(raw).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns a unique token on every call (100 calls = 100 unique)', () => {
      const tokens = new Set<string>()
      for (let i = 0; i < 100; i++) {
        tokens.add(generatePortalToken().raw)
      }
      expect(tokens.size).toBe(100)
    })

    it('returns a 64-character lowercase hex hash (SHA-256)', () => {
      const { hash } = generatePortalToken()
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('raw token differs from its hash (hash is not pre-computed)', () => {
      const { raw, hash } = generatePortalToken()
      expect(raw).not.toBe(hash)
    })

    it('embedded hash matches hashPortalToken(raw) — no double-hashing', () => {
      const { raw, hash } = generatePortalToken()
      expect(hashPortalToken(raw)).toBe(hash)
    })
  })

  describe('hashPortalToken', () => {
    it('is deterministic — same input always returns same hash', () => {
      const token = 'fixed-token-for-determinism'
      expect(hashPortalToken(token)).toBe(hashPortalToken(token))
    })

    it('produces different hashes for different inputs (no collisions)', () => {
      expect(hashPortalToken('token-a')).not.toBe(hashPortalToken('token-b'))
    })

    it('returns 64-character hex (SHA-256 output size)', () => {
      expect(hashPortalToken('anything')).toMatch(/^[0-9a-f]{64}$/)
    })

    it('output is lowercase hex (Node crypto default, stable across runs)', () => {
      const result = hashPortalToken('test-input')
      expect(result).toBe(result.toLowerCase())
    })

    it('avalanche effect: tiny input change produces a wildly different hash', () => {
      const a = hashPortalToken('token-1')
      const b = hashPortalToken('token-2')
      let diffs = 0
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) diffs++
      }
      // SHA-256 avalanche: 1-bit input change flips ~50% of output bits.
      // In hex terms, that's typically 30-64 of 64 hex chars differing.
      // We just check "significantly different" (>20) — a weak hash would
      // produce only a handful of diffs.
      expect(diffs).toBeGreaterThan(20)
    })

    it('handles empty string without throwing', () => {
      // SHA-256("") is a well-known constant
      const empty = hashPortalToken('')
      expect(empty).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      )
    })
  })
})
