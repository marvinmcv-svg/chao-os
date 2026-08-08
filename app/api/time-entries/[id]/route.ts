import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { TimeEntryService } from '@/services/TimeEntryService'

// DELETE /api/time-entries/:id — entry owner or ADMIN
export const DELETE = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    await TimeEntryService.delete({ currentUser: user, id: params.id })
    return { id: params.id }
  },
)