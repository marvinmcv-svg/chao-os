import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/leads/:id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, avatarInitials: true, role: true } },
        convertedToProject: { select: { id: true, code: true, name: true, status: true } },
      },
    })

    if (!lead) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } }, { status: 404 })
    }

    return Response.json({ success: true, data: lead })
  } catch (error) {
    console.error('GET /api/leads/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// PUT /api/leads/:id — full update
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const existing = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } }, { status: 404 })
    }

    const updateData: any = {}
    const fields = ['projectName', 'company', 'contactName', 'contactEmail', 'contactPhone',
      'estimatedValueUSD', 'projectType', 'closeProbability', 'notes', 'sourceType', 'assignedToId']
    for (const field of fields) {
      if (body[field] !== undefined) updateData[field] = body[field]
    }

    const lead = await prisma.lead.update({
      where: { id: params.id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true, avatarInitials: true } },
        convertedToProject: { select: { id: true, code: true, name: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Lead',
        entityId: lead.id,
        payload: { before: existing, after: lead },
      },
    })

    return Response.json({ success: true, data: lead })
  } catch (error) {
    console.error('PUT /api/leads/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// DELETE /api/leads/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const existing = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } }, { status: 404 })
    }

    await prisma.lead.delete({ where: { id: params.id } })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Lead',
        entityId: params.id,
        payload: { before: existing },
      },
    })

    return Response.json({ success: true, data: { id: params.id } })
  } catch (error) {
    console.error('DELETE /api/leads/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}