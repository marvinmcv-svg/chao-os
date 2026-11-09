import { NextRequest, NextResponse } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ValidationError } from '@/lib/result'
import { ExpenseService, RECEIPT_MAX_BYTES } from '@/services/ExpenseService'

type Ctx = { params: { id: string } }

export const dynamic = 'force-dynamic'

// POST /api/expenses/:id/receipt — multipart field "file" (PDF/JPG/PNG/WEBP/HEIC, ≤ 4 MB)
export const POST = withApiHandler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  const len = Number(req.headers.get('content-length') || 0)
  if (len > RECEIPT_MAX_BYTES + 64 * 1024) throw new ValidationError('El comprobante excede 4 MB', 'file')
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') throw new ValidationError('Adjunta un archivo', 'file')
  const bytes = new Uint8Array(await file.arrayBuffer())
  return ExpenseService.attachReceipt({ currentUser: user, id: params.id, filename: file.name, mimeType: file.type, bytes })
})

// DELETE /api/expenses/:id/receipt
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return ExpenseService.removeReceipt({ currentUser: user, id: params.id })
})

// GET /api/expenses/:id/receipt — opens the receipt (S3 redirect or inline bytes).
// withApiHandler supplies auth + error mapping; a success becomes a file response.
export async function GET(req: NextRequest, ctx: Ctx) {
  let receipt: Awaited<ReturnType<typeof ExpenseService.getReceipt>> | null = null
  const res = await withApiHandler(async (_r: NextRequest, { params }: Ctx) => {
    const user = await requireAuth()
    receipt = await ExpenseService.getReceipt({ currentUser: user, id: params.id })
    return null
  })(req, ctx)
  const r = receipt as Awaited<ReturnType<typeof ExpenseService.getReceipt>> | null
  if (!r) return res
  if (r.kind === 'redirect') return NextResponse.redirect(r.url, 302)
  return new NextResponse(new Uint8Array(r.data), {
    headers: {
      'Content-Type': r.mimeType,
      'Content-Disposition': `inline; filename="${r.filename.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
