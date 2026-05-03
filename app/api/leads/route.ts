import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateLeadSchema } from '@/lib/validations'

// GET /api/leads — list leads (optionally by pipeline stage)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const stage = searchParams.get('stage')

    const where: any = {}
    if (stage) where.pipelineStage = stage

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, avatarInitials: true } },
        convertedToProject: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ pipelineStage: 'asc' }, { sortOrder: 'asc' }],
    })

    return Response.json({ success: true, data: leads })
  } catch (error) {
    console.error('GET /api/leads error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// POST /api/leads — create lead
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = CreateLeadSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', field: parsed.error.issues[0].path.join('.') }
      }, { status: 400 })
    }

    const data = parsed.data

    const maxSort = await prisma.lead.aggregate({
      where: { pipelineStage: data.pipelineStage || 'PROSPECT' },
      _max: { sortOrder: true },
    })

    const lead = await prisma.lead.create({
      data: {
        ...data,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: {
        assignedTo: { select: { id: true, name: true, avatarInitials: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Lead',
        entityId: lead.id,
        payload: { data: lead },
      },
    })

    return Response.json({ success: true, data: lead }, { status: 201 })
  } catch (error) {
    console.error('POST /api/leads error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}