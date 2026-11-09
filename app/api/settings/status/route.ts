import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { isSiatConfigured } from '@/lib/siat'

// GET /api/settings/status — which integrations are configured (booleans only, never secrets)
export const GET = withApiHandler(async (_req: NextRequest) => {
  await requireAuth()
  const env = process.env
  return {
    ai: !!env.ANTHROPIC_API_KEY,
    email: !!env.RESEND_API_KEY,
    siat: isSiatConfigured(),
    storage: !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.DOCUMENTS_S3_BUCKET),
    portalUrl: env.CLIENT_PORTAL_URL || null,
    defaultHourlyRate: Number(env.DEFAULT_HOURLY_RATE) || 50,
    timezone: 'America/La_Paz',
    baseCurrency: 'USD',
    secondaryCurrency: 'BOB',
  }
})
