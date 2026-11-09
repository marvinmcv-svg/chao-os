import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { FiscalService, monthSchema } from '@/services/FiscalService'

// GET /api/finance/fiscal?month=YYYY-MM — fiscal invoices, IVA and IT for the month
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const month = monthSchema.parse(new URL(req.url).searchParams.get('month'))
  return FiscalService.monthSummary({ currentUser: user, month })
})
