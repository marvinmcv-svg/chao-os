// Test database helpers.
// All tests share the chao_os_test Postgres database. Each test should
// call `truncateAll()` in beforeEach to start from a clean slate.

import { prisma } from '@/lib/prisma'

export { prisma }

/**
 * Order matters: children first, then parents (Postgres CASCADE
 * handles it, but being explicit makes the intent clear).
 */
const TABLES_IN_TRUNCATE_ORDER = [
  'AuditLog',
  'Notification',
  'Payment',
  'InvoiceLineItem',
  'Invoice',
  'TimeEntry',
  'Expense',
  'Task',
  'Document',
  'Comment',
  'Milestone',
  'Phase',
  'ProjectMember',
  'Project',
  'Lead',
  'ProposalDraft',
  'Client',
  'PasswordChange',
  'TeamMember',
  'User',
] as const

/**
 * Truncate all tables. RESTART IDENTITY clears any auto-increment
 * counters (cuid is text so this is just hygiene).
 */
export async function truncateAll(): Promise<void> {
  const tables = TABLES_IN_TRUNCATE_ORDER.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
}

/**
 * Seed a minimal admin user for tests that need a logged-in session.
 * Password is the same as the dev seed for consistency.
 */
export async function seedAdminUser() {
  const bcrypt = await import('bcryptjs')
  return prisma.user.create({
    data: {
      email: 'admin@chaoarquitectura.bo',
      name: 'Administrador',
      passwordHash: await bcrypt.default.hash('Cha0Admin2025!', 10),
      role: 'ADMIN',
      avatarInitials: 'AD',
    },
  })
}

/**
 * Seed a minimal non-admin user (ARCHITECT) for role-based tests.
 */
export async function seedArchitectUser() {
  const bcrypt = await import('bcryptjs')
  return prisma.user.create({
    data: {
      email: 'arq@chaoarquitectura.bo',
      name: 'Arquitecto Test',
      passwordHash: await bcrypt.default.hash('ArqTest2025!', 10),
      role: 'ARCHITECT',
      avatarInitials: 'AT',
    },
  })
}
