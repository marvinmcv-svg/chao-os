import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { getPresignedUploadUrl } from '@/lib/s3'
import { z } from 'zod'
import { DomainError, NotFoundError, ValidationError } from '@/lib/result'

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

export const POST = withApiHandler(
  async (req: NextRequest) => {
    const user = await requireAuth()
    const parsed = CreateDocumentSchema.parse(await req.json())
    const { projectId, phase, filename, mimeType, sizeBytes } = parsed

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new DomainError('INVALID_MIME_TYPE', `Tipo de archivo no permitido: ${mimeType}`)
    }

    if (sizeBytes > MAX_SIZE_BYTES) {
      throw new DomainError('FILE_TOO_LARGE', 'El archivo excede el límite de 50 MB')
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new NotFoundError('Project', projectId)

    // Generate CUID for this document's S3 object
    const docId = crypto.randomUUID()

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
        uploadedById: user.id,
      },
    })

    return {
      documentId: document.id,
      uploadUrl,
      fileKey,
      expiresAt,
    }
  },
  { status: 201 },
)

// ── GET — List documents for a project ──────────────────────────────────────

export const GET = withApiHandler(async (req: NextRequest) => {
  await requireAuth()

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    throw new ValidationError('projectId es requerido', 'projectId')
  }

  return prisma.document.findMany({
    where: { projectId },
    include: {
      uploadedBy: { select: { id: true, name: true, avatarInitials: true } },
    },
    orderBy: { uploadedAt: 'desc' },
  })
})