import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateProjectSchema } from '@/lib/validations'

// GET /api/projects — list all projects
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const clientId = searchParams.get('clientId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (clientId) where.clientId = clientId

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, company: true } },
          projectManager: { select: { id: true, name: true, avatarInitials: true } },
          phases: { orderBy: { phase: 'asc' } },
          _count: { select: { tasks: true, invoices: true } },
        },
        orderBy: { code: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where }),
    ])

    return Response.json({
      success: true,
      data: projects,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('GET /api/projects error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// POST /api/projects — create project
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = CreateProjectSchema.safeParse(body)
    
    if (!parsed.success) {
      return Response.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', field: parsed.error.issues[0].path.join('.') }
      }, { status: 400 })
    }

    const data = parsed.data

    // Check code uniqueness
    const existing = await prisma.project.findUnique({ where: { code: data.code } })
    if (existing) {
      return Response.json({ success: false, error: { code: 'CONFLICT', message: 'Código de proyecto ya existe' } }, { status: 409 })
    }

    // Create project with default phases
    const project = await prisma.project.create({
      data: {
        code: data.code,
        name: data.name,
        clientId: data.clientId,
        projectManagerId: data.projectManagerId,
        type: data.type,
        contractType: data.contractType,
        currentPhase: data.currentPhase,
        totalBudgetUSD: data.totalBudgetUSD,
        startDate: new Date(data.startDate),
        estimatedEndDate: new Date(data.estimatedEndDate),
        phases: {
          create: [
            { phase: 'SD', label: 'Schematic Design', budgetUSD: data.totalBudgetUSD * 0.15, status: 'NOT_STARTED' },
            { phase: 'DD', label: 'Design Development', budgetUSD: data.totalBudgetUSD * 0.25, status: 'NOT_STARTED' },
            { phase: 'CD', label: 'Construction Documents', budgetUSD: data.totalBudgetUSD * 0.40, status: 'NOT_STARTED' },
            { phase: 'CA', label: 'Construction Administration', budgetUSD: data.totalBudgetUSD * 0.20, status: 'NOT_STARTED' },
          ],
        },
      },
      include: {
        client: true,
        projectManager: true,
        phases: true,
      },
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Project',
        entityId: project.id,
        payload: { data: project },
      },
    })

    return Response.json({ success: true, data: project }, { status: 201 })
  } catch (error) {
    console.error('POST /api/projects error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}