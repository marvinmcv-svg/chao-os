import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/leads/funnel — BD pipeline analytics: win rate, avg cycle, weighted value per stage
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const stages = ['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const

    const funnel = await Promise.all(
      stages.map(async (stage) => {
        const leads = await prisma.lead.findMany({
          where: { pipelineStage: stage },
          select: { estimatedValueUSD: true, closeProbability: true, createdAt: true, updatedAt: true },
        })
        const totalValue = leads.reduce((sum, l) => sum + l.estimatedValueUSD, 0)
        const weightedValue = leads.reduce((sum, l) => sum + (l.estimatedValueUSD * l.closeProbability) / 100, 0)
        const wonInStage = stage === 'WON' ? leads.length : 0
        const lostInStage = stage === 'LOST' ? leads.length : 0
        return { stage, count: leads.length, totalValue, weightedValue: Math.round(weightedValue), wonInStage, lostInStage }
      })
    )

    const allLeads = await prisma.lead.findMany({
      select: { pipelineStage: true, createdAt: true, updatedAt: true },
    })
    const totalLeads = allLeads.length
    const wonLeads = allLeads.filter(l => l.pipelineStage === 'WON').length
    const lostLeads = allLeads.filter(l => l.pipelineStage === 'LOST').length
    const winRate = totalLeads > 0 ? Math.round((wonLeads / (wonLeads + lostLeads)) * 100) : 0

    const closedWon = await prisma.lead.findMany({
      where: { pipelineStage: 'WON', convertedFromLeadId: { not: null } },
      select: { createdAt: true, updatedAt: true },
    })
    const avgCycleDays = closedWon.length > 0
      ? Math.round(closedWon.reduce((sum, l) => sum + (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24), 0) / closedWon.length)
      : 0

    return Response.json({
      success: true,
      data: {
        funnel,
        summary: { totalLeads, wonLeads, lostLeads, winRate, avgCycleDays },
      },
    })
  } catch (error) {
    console.error('GET /api/leads/funnel error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}