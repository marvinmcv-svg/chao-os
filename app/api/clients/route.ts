import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { CreateClientSchema } from '@/lib/validations'

// GET /api/clients — all clients, alphabetical
export const GET = withApiHandler(async (_req: NextRequest) => {
  await requireAuth()
  const clients = await prisma.client.findMany({
    orderBy: { company: 'asc' },
    select: {
      id: true,
      name: true,
      company: true,
      email: true,
      phone: true,
      type: true,
      notes: true,
      portalAccessEnabled: true,
      portalLastLogin: true,
      createdAt: true,
      billingName: true,
      docType: true,
      docNumber: true,
      docComplement: true,
      projects: {
        select: { id: true, code: true, name: true, status: true, overallProgressPercent: true, totalBudgetUSD: true },
        orderBy: { code: 'desc' },
      },
      invoices: { select: { amountUSD: true, status: true } },
    },
  })
  // Never expose portalTokenHash; add billing roll-ups instead of the raw invoice list.
  return clients.map(({ invoices, ...c }) => ({
    ...c,
    billedUSD: invoices.filter((i) => i.status !== 'DRAFT').reduce((s, i) => s + i.amountUSD, 0),
    paidUSD: invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.amountUSD, 0),
    outstandingUSD: invoices.filter((i) => ['SENT', 'PENDING', 'OVERDUE'].includes(i.status)).reduce((s, i) => s + i.amountUSD, 0),
  }))
})

// POST /api/clients — create client
export const POST = withApiHandler(
  async (req: NextRequest) => {
    await requireAuth()
    const body = CreateClientSchema.parse(await req.json())
    return prisma.client.create({ data: body })
  },
  { status: 201 },
)