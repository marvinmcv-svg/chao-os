import { randomBytes, createHash } from 'crypto'

// Generate a secure portal token for a client, returning raw token + hash
export function generatePortalToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex')
  return { raw, hash: hashPortalToken(raw) }
}

// Hash a portal token with SHA-256
export function hashPortalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}