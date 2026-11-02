import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { ValidationError } from '@/lib/result'

const Schema = z.object({
  currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
  newPassword: z
    .string()
    .min(10, 'Mínimo 10 caracteres')
    .regex(/[A-Za-z]/, 'Debe incluir letras')
    .regex(/\d/, 'Debe incluir al menos un número'),
})

// POST /api/me/password — change the signed-in user's password
export const POST = withApiHandler(async (req: NextRequest) => {
  const me = await requireAuth()
  const { currentPassword, newPassword } = Schema.parse(await req.json())

  const user = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } })
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ValidationError('La contraseña actual no es correcta', 'currentPassword')
  }
  if (currentPassword === newPassword) {
    throw new ValidationError('La nueva contraseña debe ser distinta', 'newPassword')
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } }),
    prisma.passwordChange.create({ data: { userId: me.id } }),
    prisma.auditLog.create({ data: { userId: me.id, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: me.id } }),
  ])
  return { changed: true }
})
