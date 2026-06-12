/**
 * TEST 5: seed.test.ts
 *
 * Regression test for Bug #1 (June 12, 2026): `prisma/seed.ts` was
 * missing the `title` field on Notification creates, which crashed
 * the seed on a clean database.
 *
 * Verifies:
 *  - `npm run db:seed` completes without throwing on a fresh DB
 *  - The admin user is created with the documented credentials
 *  - Expected entity counts are seeded (matches the seed script's
 *    own log output)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { truncateAll, prisma } from '../helpers/db'

describe('prisma/seed.ts', () => {
  beforeAll(async () => {
    await truncateAll()
  })

  it('completes without throwing on a clean database', () => {
    // The seed script reads .env (not .env.test), so the seed writes
    // to the DEV database. We run it against an explicit DATABASE_URL
    // pointing to the test DB to keep tests isolated.
    expect(() => {
      execSync('npx tsx prisma/seed.ts', {
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL!,
        },
        stdio: 'pipe',
        timeout: 60_000,
      })
    }).not.toThrow()
  }, 90_000)

  it('creates the admin user with documented credentials', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@chaoarquitectura.bo' },
    })
    expect(admin).not.toBeNull()
    expect(admin?.name).toBe('Administrador')
    expect(admin?.role).toBe('ADMIN')
    // The password hash must exist (we don't verify the hash here —
    // that's covered by auth.test.ts)
    expect(admin?.passwordHash).toBeTruthy()
    expect(admin?.passwordHash.length).toBeGreaterThan(20) // bcrypt hashes are 60 chars
  })

  it('seeds the expected entity counts (matching the seed script log)', async () => {
    // These counts are the exact values the seed script reports.
    // If the seed file changes these counts, this test must be updated.
    const [
      users,
      clients,
      projects,
      leads,
      invoices,
      tasks,
      timeEntries,
      notifications,
      expenses,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.client.count(),
      prisma.project.count(),
      prisma.lead.count(),
      prisma.invoice.count(),
      prisma.task.count(),
      prisma.timeEntry.count(),
      prisma.notification.count(),
      prisma.expense.count(),
    ])

    expect(users).toBe(7)        // 1 admin + 6 team
    expect(clients).toBe(7)
    expect(projects).toBe(7)
    expect(leads).toBe(8)
    expect(invoices).toBe(5)
    expect(tasks).toBe(7)
    expect(timeEntries).toBe(5)
    expect(notifications).toBe(4) // 4 notifications, all with title (Bug #1)
    expect(expenses).toBe(3)
  })

  it('all seeded notifications have a non-empty title (Bug #1 regression)', async () => {
    const notifications = await prisma.notification.findMany({
      select: { title: true, message: true, type: true },
    })
    expect(notifications.length).toBeGreaterThan(0)
    for (const n of notifications) {
      expect(n.title, `notification ${n.type} missing title`).toBeTruthy()
      expect(n.title.length).toBeGreaterThan(0)
      expect(n.message).toBeTruthy()
    }
  })
})
