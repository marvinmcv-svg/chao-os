import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedUploadUrl, getPresignedDownloadUrl, deleteObject } from '@/lib/s3'
import { z } from 'zod'

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/octet-stream', // CAD files: .dwg, .dxf, .ifc
])

// 50 MB max
const MAX_SIZE_BYTES = 50 * 1024 * 1024

// ── Validation Schemas ────────────────────────────────────────────────────────

const CreateDocumentSchema = z.object({
  projectId: z.string().min(1, 'projectId es requerido'),
  phase: z.enum(['SD', 'DD', 'CD', 'CA']).optional(),
  filename: z.string().min(1, 'filename es requerido'),
  mimeType: z.string().min(1, 'mimeType es requerido'),
  sizeBytes: z.number().int().positive('sizeBytes debe ser un entero positivo'),
})

// ── POST — Create document record + presigned upload URL ───────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = CreateDocumentSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Datos inválidos',
            field: parsed.error.issues[0].path.join('.'),
          },
        },
        { status: 400 }
      )
    }

    const { projectId, phase, filename, mimeType, sizeBytes } = parsed.data

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'INVALID_MIME_TYPE',
            message: `Tipo de archivo no permitido: ${mimeType}`,
          },
        },
        { status: 400 }
      )
    }

    if (sizeBytes > MAX_SIZE_BYTES) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `El archivo excede el límite de 50 MB`,
          },
        },
        { status: 400 }
      )
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } },
        { status: 404 }
      )
    }

    // Generate CUID for this document's S3 object
    const { default: cuid } = await import('cuid')
    const docId = cuid()

    const { uploadUrl, fileKey, expiresAt } = await getPresignedUploadUrl(
      filename,
      mimeType,
      projectId,
      docId
    )

    const document = await prisma.document.create({
      data: {
        projectId,
        phase: phase ?? null,
        filename,
        url: fileKey,
        mimeType,
        sizeBytes,
        status: 'PENDING',
        uploadedById: session.user.id,
      },
    })

    return Response.json(
      {
        success: true,
        data: {
          documentId: document.id,
          uploadUrl,
          fileKey,
          expiresAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/documents error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}

// ── GET — List documents for a project ──────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return Response.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'projectId es requerido' } },
        { status: 400 }
      )
    }

    const documents = await prisma.document.findMany({
      where: { projectId },
      include: {
        uploadedBy: { select: { id: true, name: true, avatarInitials: true } },
      },
      orderBy: { uploadedAt: 'desc' },
    })

    return Response.json({ success: true, data: documents })
  } catch (error) {
    console.error('GET /api/documents error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}