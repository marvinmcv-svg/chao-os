import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/finance/cashflow — 90-day cash flow forecast
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const today = new Date()
    const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)

    // Get all invoices with due dates in the next 90 days
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        dueDate: { lte: ninetyDaysFromNow },
      },
      include: {
        project: { select: { name: true, code: true } },
        client: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    // Group by week
    const weeklyForecast: { week: string; expected: number; overdue: number }[] = []
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(today.getTime() + i * 7 * 24 * 60 * 60 * 1000)
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
      const weekLabel = `Semana ${i + 1}`

      const weekInvoices = invoices.filter(inv => {
        const due = new Date(inv.dueDate)
        return due >= weekStart && due < weekEnd
      })

      const expected = weekInvoices
        .filter(i => i.status === 'PENDING')
        .reduce((sum, i) => sum + i.amountUSD, 0)
      const overdue = weekInvoices
        .filter(i => i.status === 'OVERDUE')
        .reduce((sum, i) => sum + i.amountUSD, 0)

      weeklyForecast.push({ week: weekLabel, expected, overdue })
    }

    // Summary stats
    const totalExpected = invoices.filter(i => i.status === 'PENDING').reduce((sum, i) => sum + i.amountUSD, 0)
    const totalOverdue = invoices.filter(i => i.status === 'OVERDUE').reduce((sum, i) => sum + i.amountUSD, 0)

    return Response.json({
      success: true,
      data: {
        weekly: weeklyForecast,
        summary: {
          totalExpected,
          totalOverdue,
          invoiceCount: invoices.length,
        },
      },
    })
  } catch (error) {
    console.error('GET /api/finance/cashflow error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}