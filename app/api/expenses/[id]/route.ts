import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ExpenseService, expenseInputSchema } from '@/services/ExpenseService'

type Ctx = { params: { id: string } }

// PUT /api/expenses/:id — edit (resubmits a rejected expense)
export const PUT = withApiHandler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  const data = expenseInputSchema.parse(await req.json())
  return ExpenseService.update({ currentUser: user, id: params.id, data })
})

// DELETE /api/expenses/:id
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return ExpenseService.remove({ currentUser: user, id: params.id })
})
