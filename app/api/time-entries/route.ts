import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { TimeEntryService } from '@/services/TimeEntryService'
import { CreateTimeEntrySchema } from '@/lib/validations'

// GET /api/time-entries — list entries (filter by userId, projectId, date range)
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  return TimeEntryService.list({
    currentUser: user,
    userId: searchParams.get('userId') ?? undefined,
    projectId: searchParams.get('projectId') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  })
})

// POST /api/time-entries — create time entry (task hours + utilization kept in sync)
export const POST = withApiHandler(
  async (req: NextRequest) => {
    const user = await requireAuth()
    const body = CreateTimeEntrySchema.parse(await req.json())
    return TimeEntryService.create({ currentUser: user, data: body })
  },
  { status: 201 },
)