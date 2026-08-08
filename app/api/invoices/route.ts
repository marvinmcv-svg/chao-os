import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { InvoiceService } from '@/services/InvoiceService'
import { CreateInvoiceSchema } from '@/lib/validations'

// GET /api/invoices — list invoices (optional status/projectId filters)
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  return InvoiceService.list({
    currentUser: user,
    status: searchParams.get('status') ?? undefined,
    projectId: searchParams.get('projectId') ?? undefined,
  })
})

// POST /api/invoices — create invoice (clientId derived from project when omitted)
export const POST = withApiHandler(
  async (req: NextRequest) => {
    const user = await requireAuth()
    const body = CreateInvoiceSchema.parse(await req.json())
    return InvoiceService.create({ currentUser: user, data: body })
  },
  { status: 201 },
)