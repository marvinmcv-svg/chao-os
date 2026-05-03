import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { scoreLead } from '@/lib/claude'

// GET /api/leads/:id/ai-score — return current score
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        projectName: true,
        company: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        estimatedValueUSD: true,
        projectType: true,
        pipelineStage: true,
        closeProbability: true,
        sourceType: true,
        notes: true,
        aiScore: true,
        aiScoreBreakdown: true,
        aiRecommendation: true,
        aiAnalysis: true,
        assignedTo: { select: { name: true } },
      },
    })

    if (!lead) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } }, { status: 404 })
    }

    // If no AI score exists, return null data (client shows "no score")
    if (!lead.aiScore) {
      return Response.json({ success: true, data: null })
    }

    return Response.json({
      success: true,
      data: {
        overallScore: lead.aiScore,
        breakdown: lead.aiScoreBreakdown as {
          financialScore: number
          technicalScore: number
          commercialScore: number
          legalScore: number
          executionScore: number
        } | null,
        recommendation: lead.aiRecommendation,
        summary: lead.aiAnalysis ?? null,
        keyStrengths: [],
        keyRisks: [],
        nextSteps: [],
      },
    })
  } catch (error) {
    console.error('GET /api/leads/:id/ai-score error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// POST /api/leads/:id/ai-score — trigger re-score
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      include: { assignedTo: { select: { name: true } } },
    })

    if (!lead) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } }, { status: 404 })
    }

    // Call Claude to score the lead
    const result = await scoreLead({
      projectName: lead.projectName,
      company: lead.company,
      contactName: lead.contactName,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      estimatedValueUSD: lead.estimatedValueUSD,
      projectType: lead.projectType,
      pipelineStage: lead.pipelineStage,
      closeProbability: lead.closeProbability,
      sourceType: lead.sourceType,
      notes: lead.notes,
      assignedToName: lead.assignedTo.name,
    })

    // Persist scores to database
    const breakdown = {
      financialScore: result.financialScore,
      technicalScore: result.technicalScore,
      commercialScore: result.commercialScore,
      legalScore: result.legalScore,
      executionScore: result.executionScore,
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        aiScore: result.overallScore,
        aiScoreBreakdown: breakdown,
        aiRecommendation: result.recommendation,
        aiAnalysis: result.summary,
      },
    })

    return Response.json({
      success: true,
      data: {
        overallScore: result.overallScore,
        breakdown,
        recommendation: result.recommendation,
        summary: result.summary,
        keyStrengths: result.keyStrengths,
        keyRisks: result.keyRisks,
        nextSteps: result.nextSteps,
      },
    })
  } catch (error) {
    console.error('POST /api/leads/:id/ai-score error:', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}