import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/finance/pnl — P&L per project (revenue - expenses - time cost)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    const where: any = {}
    if (projectId) where.id = projectId

    const projects = await prisma.project.findMany({
      where,
      include: {
        invoices: {
          where: { status: { in: ['PAID', 'PENDING'] } },
          select: { amountUSD: true, status: true },
        },
        expenses: { select: { amountUSD: true } },
        timeEntries: {
          select: { hours: true },
        },
        teamMembers: {
          include: {
            user: { select: { hourlyRate: true } },
          },
        },
      },
    })

    // Default hourly rate if not set
    const DEFAULT_HOURLY_RATE = Number(process.env.DEFAULT_HOURLY_RATE) || 50

    const pnlData = projects.map(project => {
      const revenue = project.invoices
        .filter(i => i.status === 'PAID' || i.status === 'PENDING')
        .reduce((sum, i) => sum + i.amountUSD, 0)
      const expenses = project.expenses.reduce((sum, e) => sum + e.amountUSD, 0)
      const hoursLogged = project.timeEntries.reduce((sum, t) => sum + t.hours, 0)
      // Approximate labor cost: average hourly rate × total hours
      // (Per-member hour tracking not available in current schema)
      const totalHourlyRate = project.teamMembers.reduce((sum, m) => sum + (m.user.hourlyRate ?? DEFAULT_HOURLY_RATE), 0)
      const avgHourlyRate = project.teamMembers.length > 0 ? totalHourlyRate / project.teamMembers.length : DEFAULT_HOURLY_RATE
      const laborCost = avgHourlyRate * hoursLogged
      const netProfit = revenue - expenses - laborCost
      const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0

      return {
        projectId: project.id,
        code: project.code,
        name: project.name,
        revenue,
        expenses,
        laborCost,
        netProfit,
        margin,
        hoursLogged,
      }
    })

    return Response.json({ success: true, data: pnlData })
  } catch (error) {
    console.error('GET /api/finance/pnl error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}