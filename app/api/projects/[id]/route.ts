import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UpdateProjectSchema } from '@/lib/validations'

// GET /api/projects/:id — get single project with full detail
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        projectManager: { select: { id: true, name: true, email: true, avatarInitials: true, role: true } },
        phases: { orderBy: { phase: 'asc' } },
        milestones: { orderBy: { dueDate: 'asc' } },
        teamMembers: { include: { user: { select: { id: true, name: true, avatarInitials: true, role: true } } } },
        tasks: { 
          where: { status: { not: 'DONE' } },
          orderBy: { dueDate: 'asc' },
          take: 10,
          include: { assignedTo: { select: { id: true, name: true, avatarInitials: true } } },
        },
        invoices: { orderBy: { issuedAt: 'desc' } },
        expenses: { orderBy: { incurredAt: 'desc' } },
        _count: { select: { tasks: true, documents: true } },
      },
    })

    if (!project) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } }, { status: 404 })
    }

    return Response.json({ success: true, data: project })
  } catch (error) {
    console.error('GET /api/projects/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// PUT /api/projects/:id — full update
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = UpdateProjectSchema.safeParse(body)
    
    if (!parsed.success) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, { status: 400 })
    }

    const existing = await prisma.project.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } }, { status: 404 })
    }

    const data = parsed.data
    const updateData: Record<string, unknown> = { ...data }
    
    if (data.startDate) updateData.startDate = new Date(data.startDate)
    if (data.estimatedEndDate) updateData.estimatedEndDate = new Date(data.estimatedEndDate)
    if (data.actualEndDate) updateData.actualEndDate = new Date(data.actualEndDate)

    const project = await prisma.project.update({
      where: { id: params.id },
      data: updateData,
      include: { client: true, projectManager: true, phases: true },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Project',
        entityId: project.id,
        payload: { before: existing, after: project },
      },
    })

    return Response.json({ success: true, data: project })
  } catch (error) {
    console.error('PUT /api/projects/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// DELETE /api/projects/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const existing = await prisma.project.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } }, { status: 404 })
    }

    // Only admin or principal can delete
    if (!['ADMIN', 'PRINCIPAL'].includes(session.user.role)) {
      return Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'Sin permiso para eliminar' } }, { status: 403 })
    }

    await prisma.project.delete({ where: { id: params.id } })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Project',
        entityId: params.id,
        payload: { before: existing },
      },
    })

    return Response.json({ success: true, data: { id: params.id } })
  } catch (error) {
    console.error('DELETE /api/projects/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}