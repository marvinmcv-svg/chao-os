import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/team — list all team members with capacity data
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const team = await prisma.teamMember.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarInitials: true, role: true, capacityPercent: true },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })

    return Response.json({ success: true, data: team })
  } catch (error) {
    console.error('GET /api/team error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}