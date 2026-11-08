import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { checkRateLimit } from '@/lib/ratelimit'
import { DomainError } from '@/lib/result'
import { PortalService } from '@/services/PortalService'
import { portalDecisionSchema } from '@/services/ChangeOrderService'

class RateLimitedError extends DomainError {
  constructor() {
    super('RATE_LIMITED', 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.')
  }
}

// POST /api/portal/project/:id/change-orders/:coId
//   { token, decision: approve | reject, name, note }
// The token travels in the body, not the URL, so it stays out of access logs
// for the one request that changes data.
export const POST = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string; coId: string } }) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRateLimit(`portal-co:${ip}`).success) throw new RateLimitedError()
    const body = portalDecisionSchema.parse(await req.json())
    return PortalService.decideChangeOrder({ ...body, projectId: params.id, changeOrderId: params.coId })
  }
)
