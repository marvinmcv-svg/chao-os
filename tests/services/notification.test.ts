/**
 * TEST: notification.test.ts
 *
 * Verifies NotificationService with a mocked Prisma client.
 * No DB connection needed — we verify the right Prisma calls are made
 * with the right arguments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NotificationType } from '@prisma/client'

// Mock @/lib/prisma BEFORE importing the service
const mockNotificationCreate = vi.fn()
const mockNotificationCreateMany = vi.fn()
const mockNotificationUpdateMany = vi.fn()
const mockNotificationCount = vi.fn()
const mockUserFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
      createMany: (...args: unknown[]) => mockNotificationCreateMany(...args),
      updateMany: (...args: unknown[]) => mockNotificationUpdateMany(...args),
      count: (...args: unknown[]) => mockNotificationCount(...args),
    },
    user: {
      findMany: (...args: unknown[]) => mockUserFindMany(...args),
    },
  },
}))

import { NotificationService } from '@/services/NotificationService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotificationService.create', () => {
  it('calls prisma.notification.create with the input fields', async () => {
    mockNotificationCreate.mockResolvedValueOnce({ id: 'n1' })
    const result = await NotificationService.create({
      userId: 'u1',
      type: 'LEAD_ASSIGNED' as NotificationType,
      title: 'New lead',
      message: 'You have been assigned a new lead',
    })
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'LEAD_ASSIGNED',
        title: 'New lead',
        message: 'You have been assigned a new lead',
        linkUrl: undefined,
        data: undefined,
      },
    })
    expect(result).toEqual({ id: 'n1' })
  })

  it('includes linkUrl and data when provided', async () => {
    mockNotificationCreate.mockResolvedValueOnce({ id: 'n2' })
    await NotificationService.create({
      userId: 'u1',
      type: 'INVOICE_PAID' as NotificationType,
      title: 'Invoice paid',
      message: 'Invoice INV-001 was paid',
      linkUrl: '/invoices/123',
      data: { invoiceId: '123' },
    })
    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'INVOICE_PAID',
        title: 'Invoice paid',
        message: 'Invoice INV-001 was paid',
        linkUrl: '/invoices/123',
        data: { invoiceId: '123' },
      },
    })
  })
})

describe('NotificationService.createManyForRole', () => {
  it('finds users by role then creates one notification per user', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }])
    mockNotificationCreateMany.mockResolvedValueOnce({ count: 2 })

    const result = await NotificationService.createManyForRole(
      'ARCHITECT',
      'LEAD_ASSIGNED' as NotificationType,
      'New lead',
      'A new lead is available'
    )

    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: { role: 'ARCHITECT' },
      select: { id: true },
    })
    expect(mockNotificationCreateMany).toHaveBeenCalledWith({
      data: [
        { userId: 'u1', type: 'LEAD_ASSIGNED', title: 'New lead', message: 'A new lead is available', linkUrl: undefined, data: undefined },
        { userId: 'u2', type: 'LEAD_ASSIGNED', title: 'New lead', message: 'A new lead is available', linkUrl: undefined, data: undefined },
      ],
    })
    expect(result).toEqual({ count: 2 })
  })

  it('returns { count: 0 } when no users match the role (no DB write)', async () => {
    mockUserFindMany.mockResolvedValueOnce([])
    const result = await NotificationService.createManyForRole(
      'NONEXISTENT_ROLE',
      'LEAD_ASSIGNED' as NotificationType,
      'New lead',
      'A new lead is available'
    )
    expect(result).toEqual({ count: 0 })
    expect(mockNotificationCreateMany).not.toHaveBeenCalled()
  })

  it('passes linkUrl and data through to every notification', async () => {
    mockUserFindMany.mockResolvedValueOnce([{ id: 'u1' }])
    mockNotificationCreateMany.mockResolvedValueOnce({ count: 1 })
    await NotificationService.createManyForRole(
      'ADMIN',
      'INVOICE_OVERDUE' as NotificationType,
      'Invoice overdue',
      'Invoice INV-001 is overdue',
      { linkUrl: '/invoices/123', data: { invoiceId: '123' } }
    )
    expect(mockNotificationCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'u1',
          type: 'INVOICE_OVERDUE',
          title: 'Invoice overdue',
          message: 'Invoice INV-001 is overdue',
          linkUrl: '/invoices/123',
          data: { invoiceId: '123' },
        },
      ],
    })
  })
})

describe('NotificationService.markAllRead', () => {
  it('calls updateMany with userId + read=false filter and returns the count', async () => {
    mockNotificationUpdateMany.mockResolvedValueOnce({ count: 7 })
    const count = await NotificationService.markAllRead('u1')
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', read: false },
      data: { read: true },
    })
    expect(count).toBe(7)
  })

  it('returns 0 when there are no unread notifications', async () => {
    mockNotificationUpdateMany.mockResolvedValueOnce({ count: 0 })
    const count = await NotificationService.markAllRead('u1')
    expect(count).toBe(0)
  })
})

describe('NotificationService.getUnreadCount', () => {
  it('calls prisma.notification.count with the unread filter', async () => {
    mockNotificationCount.mockResolvedValueOnce(3)
    const count = await NotificationService.getUnreadCount('u1')
    expect(mockNotificationCount).toHaveBeenCalledWith({
      where: { userId: 'u1', read: false },
    })
    expect(count).toBe(3)
  })

  it('returns 0 when the user has no notifications', async () => {
    mockNotificationCount.mockResolvedValueOnce(0)
    expect(await NotificationService.getUnreadCount('u1')).toBe(0)
  })
})
