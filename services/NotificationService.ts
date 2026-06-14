/**
 * NotificationService — Sprint 2.5.
 *
 * The smallest service in the system. Sets the pattern for all other
 * services: object-literal export, PrismaClient injected via lib/prisma,
 * no business-logic dependencies on other services.
 *
 * Used by:
 *  - LeadService — notify assigned user on stage change / conversion
 *  - InvoiceService — notify PM on status transitions
 *  - ProjectService — notify team on phase advancement
 *  - (any future service that produces user-visible events)
 */
import { Prisma, NotificationType } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  linkUrl?: string
  data?: Prisma.JsonValue
}

export interface CreateForRoleOptions {
  linkUrl?: string
  data?: Prisma.JsonValue
}

export const NotificationService = {
  /**
   * Create a single notification for one user.
   */
  async create(input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        linkUrl: input.linkUrl,
        data: input.data as Prisma.InputJsonValue | undefined,
      },
    })
  },

  /**
   * Create the same notification for every user with a given role.
   * Used for role-wide events (e.g. "new lead assigned to ARCHITECTs").
   * Returns the Prisma createMany result; .count is the number of inserts.
   */
  async createManyForRole(
    role: string,
    type: NotificationType,
    title: string,
    message: string,
    options: CreateForRoleOptions = {}
  ) {
    const users = await prisma.user.findMany({
      where: { role: role as Prisma.UserWhereInput['role'] },
      select: { id: true },
    })
    if (users.length === 0) return { count: 0 }

    return prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        title,
        message,
        linkUrl: options.linkUrl,
        data: options.data as Prisma.InputJsonValue | undefined,
      })),
    })
  },

  /**
   * Mark all of a user's unread notifications as read.
   * Returns the count of notifications updated.
   */
  async markAllRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
    return result.count
  },

  /**
   * Get the count of a user's unread notifications.
   * Cheap query (indexed on userId+read) — used for badge UI.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, read: false },
    })
  },
}

export type NotificationService = typeof NotificationService
