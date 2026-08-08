import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { LeadService } from '@/services/LeadService'

// GET /api/leads/funnel — BD pipeline analytics: win rate, avg cycle, weighted value per stage
export const GET = withApiHandler(async (_req: NextRequest) => {
  const user = await requireAuth()
  return LeadService.getFunnel({ currentUser: user })
})