// Vitest setup file — runs before any test file is loaded.
// Critical: must set process.env BEFORE the first import of lib/prisma.ts,
// because lib/prisma.ts creates the PrismaClient at module-load time.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '..', '.env.test')

try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // Strip surrounding quotes (single or double)
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
} catch (err) {
  throw new Error(
    `[setup] Failed to load .env.test at ${envPath}.\n` +
    `Copy .env.test.example to .env.test and adjust DATABASE_URL.\n` +
    `Underlying error: ${(err as Error).message}`
  )
}

// Hard-fail if the test DB is not the chao_os_test database.
// This prevents accidentally running tests against dev/prod.
if (!process.env.DATABASE_URL?.includes('chao_os_test')) {
  throw new Error(
    `[setup] DATABASE_URL must point to chao_os_test, got: ${process.env.DATABASE_URL}\n` +
    `Tests will refuse to run against any other database.`
  )
}
