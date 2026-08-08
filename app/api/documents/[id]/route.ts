import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { getPresignedDownloadUrl, deleteObject } from '@/lib/s3'
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/result'

// GET /api/documents/[id] — single document + presigned download URL
// (APPROVED documents are downloadable by anyone; PENDING/REJECTED only
// by the uploader or an ADMIN)
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()

    const document = await prisma.document.findUnique({
      where: { id: params.id },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarInitials: true } },
      },
    })
    if (!document) throw new NotFoundError('Document', params.id)

    let downloadUrl: string | null = null
    const canDownload =
      document.status === 'APPROVED' ||
      document.uploadedById === user.id ||
      user.role === 'ADMIN'

    if (canDownload) {
      const result = await getPresignedDownloadUrl(document.url)
      downloadUrl = result.downloadUrl
    }

    return { ...document, downloadUrl }
  },
)

// PATCH /api/documents/[id] — update status (admin only)
export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()

    if (user.role !== 'ADMIN') {
      throw new ForbiddenError('Solo admins pueden cambiar el estado')
    }

    const body = await req.json()
    const { status } = body

    if (!status || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      throw new ValidationError('status inválido', 'status')
    }

    const document = await prisma.document.findUnique({ where: { id: params.id } })
    if (!document) throw new NotFoundError('Document', params.id)

    return prisma.document.update({
      where: { id: params.id },
      data: { status },
    })
  },
)

// DELETE /api/documents/[id] — remove from S3 + DB (admin only)
export const DELETE = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()

    if (user.role !== 'ADMIN') {
      throw new ForbiddenError('Solo admins pueden eliminar documentos')
    }

    const document = await prisma.document.findUnique({ where: { id: params.id } })
    if (!document) throw new NotFoundError('Document', params.id)

    // Delete from S3 (non-fatal on failure — record removal is the source of truth)
    try {
      await deleteObject(document.url)
    } catch (s3Err) {
      console.error('S3 delete error (non-fatal):', s3Err)
    }

    await prisma.document.delete({ where: { id: params.id } })

    return { deletedId: params.id }
  },
)