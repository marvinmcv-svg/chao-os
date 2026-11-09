import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { NotFoundError } from '@/lib/result'
import { FiscalService, monthSchema } from '@/services/FiscalService'

export const dynamic = 'force-dynamic'

type Ctx = { params: { kind: string } }

// GET /api/finance/exports/ventas?month=YYYY-MM  — Registro de Ventas (SIN RCV), CSV
// GET /api/finance/exports/diario?month=YYYY-MM  — accounting journal, CSV
export async function GET(req: NextRequest, ctx: Ctx) {
  let file: { filename: string; csv: string } | null = null
  const res = await withApiHandler(async (r: NextRequest, { params }: Ctx) => {
    const user = await requireAuth()
    const month = monthSchema.parse(new URL(r.url).searchParams.get('month'))
    if (params.kind === 'ventas') file = await FiscalService.salesBook({ currentUser: user, month })
    else if (params.kind === 'diario') file = await FiscalService.journal({ currentUser: user, month })
    else throw new NotFoundError('Exportación', params.kind)
    return null
  })(req, ctx)
  const f = file as { filename: string; csv: string } | null
  if (!f) return res
  return new NextResponse(f.csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${f.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
