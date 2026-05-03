import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedDownloadUrl, deleteObject } from '@/lib/s3'

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/octet-stream',
])

const MAX_SIZE_BYTES = 50 * 1024 * 1024

// GET /api/documents/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const document = await prisma.document.findUnique({
      where: { id: params.id },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarInitials: true } },
      },
    })

    if (!document) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } },
        { status: 404 }
      )
    }

    // Generate presigned download URL (only for APPROVED documents, or if user owns it)
    let downloadUrl: string | null = null
    const canDownload =
      document.status === 'APPROVED' ||
      document.uploadedById === session.user.id ||
      session.user.role === 'ADMIN'

    if (canDownload) {
      const result = await getPresignedDownloadUrl(document.url)
      downloadUrl = result.downloadUrl
    }

    return Response.json({
      success: true,
      data: {
        ...document,
        downloadUrl,
      },
    })
  } catch (error) {
    console.error('GET /api/documents/[id] error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}

// PATCH /api/documents/[id] — update status (admin only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    // Only admins can change status
    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Solo admins pueden cambiar el estado' } },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { status } = body

    if (!status || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'status inválido' },
        },
        { status: 400 }
      )
    }

    const document = await prisma.document.findUnique({ where: { id: params.id } })
    if (!document) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } },
        { status: 404 }
      )
    }

    const updated = await prisma.document.update({
      where: { id: params.id },
      data: { status },
    })

    return Response.json({ success: true, data: updated })
  } catch (error) {
    console.error('PATCH /api/documents/[id] error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}

// DELETE /api/documents/[id] — remove from S3 + DB (admin only)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Solo admins pueden eliminar documentos' } },
        { status: 403 }
      )
    }

    const document = await prisma.document.findUnique({ where: { id: params.id } })
    if (!document) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } },
        { status: 404 }
      )
    }

    // Delete from S3
    try {
      await deleteObject(document.url)
    } catch (s3Err) {
      console.error('S3 delete error (non-fatal):', s3Err)
    }

    // Delete DB record
    await prisma.document.delete({ where: { id: params.id } })

    return Response.json({ success: true, data: { deletedId: params.id } })
  } catch (error) {
    console.error('DELETE /api/documents/[id] error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}