import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { generatePortalToken } from '@/lib/portal-auth'
import { ForbiddenError, NotFoundError } from '@/lib/result'

const STAFF_ROLES = ['PRINCIPAL', 'ADMIN', 'ARCHITECT_SENIOR']

/**
 * POST /api/clients/:id/portal — enable portal access and mint a NEW link.
 * Only the SHA-256 hash is stored, so the raw token can only be shown once;
 * calling this again rotates the token and invalidates previous links.
 */
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  if (!STAFF_ROLES.includes(user.role)) throw new ForbiddenError('Solo socios, administración o arquitectos senior pueden compartir el portal')

  const client = await prisma.client.findUnique({
    where: { id: params.id },
    select: { id: true, projects: { select: { id: true, code: true, name: true }, orderBy: { code: 'desc' } } },
  })
  if (!client) throw new NotFoundError('Client', params.id)

  const { raw, hash } = generatePortalToken()
  await prisma.client.update({ where: { id: client.id }, data: { portalTokenHash: hash, portalAccessEnabled: true } })
  await prisma.auditLog.create({
    data: { userId: user.id, action: 'PORTAL_LINK_ROTATED', entityType: 'Client', entityId: client.id },
  })

  const base = process.env.CLIENT_PORTAL_URL || new URL(req.url).origin
  return {
    links: client.projects.map((p) => ({
      projectId: p.id,
      code: p.code,
      name: p.name,
      url: `${base}/portal/projects/${p.id}?token=${raw}`,
    })),
  }
})

/** DELETE /api/clients/:id/portal — revoke portal access. */
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  if (!STAFF_ROLES.includes(user.role)) throw new ForbiddenError('Sin permiso para revocar el acceso')
  await prisma.client.update({ where: { id: params.id }, data: { portalAccessEnabled: false, portalTokenHash: null } })
  await prisma.auditLog.create({ data: { userId: user.id, action: 'PORTAL_REVOKED', entityType: 'Client', entityId: params.id } })
  return { revoked: true }
})
