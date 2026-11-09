import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { FiscalService, clientFiscalSchema } from '@/services/FiscalService'

// PUT /api/clients/:id/fiscal — billing name + NIT/CI printed on fiscal invoices
export const PUT = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  const data = clientFiscalSchema.parse(await req.json())
  return FiscalService.updateClientFiscal({ currentUser: user, clientId: params.id, data })
})
