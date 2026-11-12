import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'
import { DomainError } from '@/lib/result'
import { PortalService } from '@/services/PortalService'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string; docId: string } }

/**
 * GET /api/portal/project/:id/documents/:docId?token=XXX
 *
 * A browser navigation from the client portal: on success it redirects to
 * a 5-minute signed S3 URL. Failures redirect back to the portal page
 * with `?doc=<reason>` so the client sees a message instead of raw JSON.
 * The response is never cached (the target URL expires).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? undefined
  const back = (reason: string) => {
    const to = new URL(`/portal/projects/${encodeURIComponent(params.id)}`, url.origin)
    if (token) to.searchParams.set('token', token)
    to.searchParams.set('doc', reason)
    to.hash = 'documentos'
    return NextResponse.redirect(to, { status: 303, headers: { 'Cache-Control': 'no-store' } })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(`portal-doc:${ip}`, 30).success) return back('rate')

  try {
    const { url: signed } = await PortalService.getDocumentDownload({ token, projectId: params.id, documentId: params.docId })
    return NextResponse.redirect(signed, { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch (e) {
    if (e instanceof DomainError) {
      if (e.code === 'UNAUTHORIZED') return back('auth')
      if (e.code === 'STORAGE_UNAVAILABLE') return back('storage')
      return back('notfound')
    }
    console.error('[portal] document download failed', e)
    return back('error')
  }
}
