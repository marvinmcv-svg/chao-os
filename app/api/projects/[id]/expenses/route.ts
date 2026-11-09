import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ExpenseService, expenseInputSchema } from '@/services/ExpenseService'

type Ctx = { params: { id: string } }

// GET /api/projects/:id/expenses — list + totals (cost, pending, unbilled)
export const GET = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return ExpenseService.listForProject({ currentUser: user, projectId: params.id })
})

// POST /api/projects/:id/expenses — record an expense (approvers' are auto-approved)
export const POST = withApiHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const user = await requireAuth()
    const data = expenseInputSchema.parse(await req.json())
    return ExpenseService.create({ currentUser: user, projectId: params.id, data })
  },
  { status: 201 }
)
