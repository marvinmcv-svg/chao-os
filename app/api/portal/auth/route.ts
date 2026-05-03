import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPortalToken } from '@/lib/portal-auth'

// POST /api/portal/auth — verify token and return access
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, projectId } = body

    if (!token || !projectId) {
      return Response.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Token y projectId requeridos' } }, { status: 400 })
    }

    // Hash the incoming token and find client with matching portalTokenHash + portalAccessEnabled
    const tokenHash = hashPortalToken(token)
    const client = await prisma.client.findFirst({
      where: { portalTokenHash: tokenHash, portalAccessEnabled: true },
      include: { projects: { where: { id: projectId } } },
    })

    if (!client) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Acceso denegado' } }, { status: 401 })
    }

    // Check if this project belongs to this client
    if (client.projects.length === 0) {
      return Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'Este proyecto no pertenece a este cliente' } }, { status: 403 })
    }

    // Update last login
    await prisma.client.update({
      where: { id: client.id },
      data: { portalLastLogin: new Date() },
    })

    return Response.json({
      success: true,
      data: {
        clientId: client.id,
        clientName: client.name,
        company: client.company,
        projectId,
      },
    })
  } catch (error) {
    console.error('POST /api/portal/auth error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}