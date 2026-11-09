import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { FiscalService, fiscalSettingsSchema } from '@/services/FiscalService'

// GET /api/settings/fiscal — studio fiscal data (NIT, CAEB, leyenda, rate, accounts)
export const GET = withApiHandler(async (_req: NextRequest) => {
  const user = await requireAuth()
  return FiscalService.settingsView({ currentUser: user })
})

// PUT /api/settings/fiscal — PRINCIPAL / ADMIN
export const PUT = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const data = fiscalSettingsSchema.parse(await req.json())
  return FiscalService.updateSettings({ currentUser: user, data })
})
