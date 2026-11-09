import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ExpenseService, expenseListQuerySchema } from '@/services/ExpenseService'

// GET /api/expenses?scope=mine|all&status=&toReimburse=1 — Finance → Gastos
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const sp = new URL(req.url).searchParams
  const query = expenseListQuerySchema.parse({
    scope: sp.get('scope') ?? undefined,
    status: sp.get('status') ?? undefined,
    toReimburse: sp.get('toReimburse') === '1' ? true : undefined,
  })
  return ExpenseService.list({ currentUser: user, query })
})
