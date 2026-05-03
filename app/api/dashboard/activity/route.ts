import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

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

    return Response.json({
      success: true,
      data: {
        projects: recentProjects,
        invoices: recentInvoices,
      },
    })
  } catch (error) {
    console.error('GET /api/dashboard/activity error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}