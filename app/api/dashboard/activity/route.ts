import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

// GET /api/dashboard/activity — recent projects and invoices
export const GET = withApiHandler(async (_req: NextRequest) => {
  await requireAuth()

  const recentProjects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: {
      client: { select: { name: true, company: true } },
      projectManager: { select: { name: true, avatarInitials: true } },
    },
  })

  const recentInvoices = await prisma.invoice.findMany({
    orderBy: { issuedAt: 'desc' },
    take: 5,
    include: {
      project: { select: { code: true, name: true } },
      client: { select: { name: true } },
    },
  })

  return {
    projects: recentProjects,
    invoices: recentInvoices,
  }
})