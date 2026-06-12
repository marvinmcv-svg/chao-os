/**
 * TEST 1: auth.test.ts
 *
 * Verifies the credentials provider's authorizeCredentials function.
 * This is the single point of truth for the entire login flow — every
 * route, every page, every API call depends on it working correctly.
 *
 * Coverage:
 *  - correct email + password returns user object
 *  - wrong password returns null (no user-enumeration leak)
 *  - non-existent email returns null (same shape as wrong password)
 *  - empty inputs return null
 *  - returned object includes teamMember when present
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { authorizeCredentials } from '@/lib/auth'
import { truncateAll, seedAdminUser, prisma } from '../helpers/db'

describe('authorizeCredentials', () => {
  beforeEach(async () => {
    await truncateAll()
    await seedAdminUser()
  })

  it('returns the user when given correct credentials', async () => {
    const result = await authorizeCredentials(
      'admin@chaoarquitectura.bo',
      'Cha0Admin2025!'
    )

    expect(result).not.toBeNull()
    expect(result).toMatchObject({
      email: 'admin@chaoarquitectura.bo',
      name: 'Administrador',
      role: 'ADMIN',
      avatarInitials: 'AD',
    })
    expect(result).toHaveProperty('id')
    // Must NOT leak the password hash
    expect(result).not.toHaveProperty('passwordHash')
  })

  it('returns null when the password is wrong', async () => {
    const result = await authorizeCredentials(
      'admin@chaoarquitectura.bo',
      'wrong-password'
    )
    expect(result).toBeNull()
  })

  it('returns null when the email does not exist', async () => {
    const result = await authorizeCredentials(
      'ghost@chaoarquitectura.bo',
      'Cha0Admin2025!'
    )
    expect(result).toBeNull()
  })

  it('returns the same null shape for "user not found" and "wrong password" (no enumeration)', async () => {
    const wrongPassword = await authorizeCredentials(
      'admin@chaoarquitectura.bo',
      'wrong-password'
    )
    const noUser = await authorizeCredentials(
      'ghost@chaoarquitectura.bo',
      'Cha0Admin2025!'
    )
    // Both must be strictly null (not undefined, not an object with an error)
    expect(wrongPassword).toBeNull()
    expect(noUser).toBeNull()
  })

  it('returns null for empty inputs', async () => {
    expect(await authorizeCredentials('', '')).toBeNull()
    expect(await authorizeCredentials('admin@chaoarquitectura.bo', '')).toBeNull()
    expect(await authorizeCredentials('', 'Cha0Admin2025!')).toBeNull()
  })

  it('includes teamMember data when present', async () => {
    // Upgrade the admin to have a TeamMember record
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@chaoarquitectura.bo' },
    })
    await prisma.teamMember.create({
      data: {
        userId: admin.id,
        role: 'Principal',
        weeklyHoursCapacity: 40,
        utilizationPercent: 75,
      },
    })

    const result = await authorizeCredentials(
      'admin@chaoarquitectura.bo',
      'Cha0Admin2025!'
    )

    expect(result).toMatchObject({
      email: 'admin@chaoarquitectura.bo',
      teamMember: {
        role: 'Principal',
        weeklyHoursCapacity: 40,
        utilizationPercent: 75,
      },
    })
  })
})
