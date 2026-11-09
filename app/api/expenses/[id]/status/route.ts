import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ExpenseService, expenseActionSchema } from '@/services/ExpenseService'

// POST /api/expenses/:id/status  { action: approve | reject (note) | reimburse }
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  const input = expenseActionSchema.parse(await req.json())
  return ExpenseService.transition({ currentUser: user, id: params.id, input })
})
