import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ExpenseService, expenseInvoiceSchema } from '@/services/ExpenseService'

// POST /api/projects/:id/expenses/invoice — draft invoice from unbilled reimbursables
export const POST = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = expenseInvoiceSchema.parse(await req.json().catch(() => ({})))
    return ExpenseService.invoice({ currentUser: user, projectId: params.id, expenseIds: body.expenseIds })
  },
  { status: 201 }
)
