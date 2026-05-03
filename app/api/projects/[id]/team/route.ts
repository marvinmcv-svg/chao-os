import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/projects/:id/team — list team members on a project
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId: params.id },
      include: {
        user: { select: { id: true, name: true, email: true, avatarInitials: true, role: true } },
      },
    })

    return Response.json({ success: true, data: members })
  } catch (error) {
    console.error('GET /api/projects/:id/team error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// POST /api/projects/:id/team — add team member to project
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const { userId, role } = body

    if (!userId || !role) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'userId y role requerido' } }, { status: 400 })
    }

    // Check if already member
    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: params.id, userId } },
    })
    if (existing) {
      return Response.json({ success: false, error: { code: 'CONFLICT', message: 'Ya es miembro del proyecto' } }, { status: 409 })
    }

    const member = await prisma.projectMember.create({
      data: { projectId: params.id, userId, role },
      include: { user: { select: { id: true, name: true, avatarInitials: true, role: true } } },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'ProjectMember',
        entityId: member.id,
        payload: { projectId: params.id, addedUserId: userId, role },
      },
    })

    return Response.json({ success: true, data: member }, { status: 201 })
  } catch (error) {
    console.error('POST /api/projects/:id/team error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}