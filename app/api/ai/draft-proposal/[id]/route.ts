import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { proposalStore } from '@/lib/proposal-store'

// GET /api/ai/draft-proposal/:id — retrieve a previously generated proposal
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const { id } = params

    const proposal = await proposalStore.findById(id)

    if (!proposal) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Propuesta no encontrada' } },
        { status: 404 }
      )
    }

    return Response.json({ success: true, data: proposal })
  } catch (error) {
    console.error('GET /api/ai/draft-proposal/:id error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}