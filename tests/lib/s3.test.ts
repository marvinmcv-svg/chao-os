/**
 * lib/s3 — signed download URLs. Presigning is a local computation, so a
 * fake key pair is enough to check what the URL grants (no network).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ENV = { AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'AKIAFAKEFAKEFAKE', AWS_SECRET_ACCESS_KEY: 'fake/secret', DOCUMENTS_S3_BUCKET: 'chao-docs' }

describe('getPresignedViewUrl', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    for (const k of Object.keys(ENV)) delete process.env[k]
  })

  it('signs a 5-minute GET for the exact key with a UTF-8 safe filename', async () => {
    Object.assign(process.env, ENV)
    const { getPresignedViewUrl } = await import('@/lib/s3')
    const url = new URL(await getPresignedViewUrl('projects/p1/documents/abc-planta.pdf', 'Planta Ñandú (DD).pdf', 'application/pdf'))
    expect(url.hostname).toContain('chao-docs')
    expect(url.pathname).toBe('/projects/p1/documents/abc-planta.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    const cd = url.searchParams.get('response-content-disposition')!
    expect(cd).toContain('inline; filename="Planta Nandu _DD_.pdf"')
    expect(cd).toContain("filename*=UTF-8''Planta%20%C3%91and%C3%BA%20(DD).pdf")
    expect(url.searchParams.get('response-content-type')).toBe('application/pdf')
  })

  it('attachment disposition for downloads', async () => {
    Object.assign(process.env, ENV)
    const { getPresignedViewUrl } = await import('@/lib/s3')
    const url = new URL(await getPresignedViewUrl('k.dwg', 'Fachada.dwg', 'application/octet-stream', { disposition: 'attachment' }))
    expect(url.searchParams.get('response-content-disposition')).toMatch(/^attachment;/)
  })

  it('throws STORAGE_UNAVAILABLE when S3 is not configured', async () => {
    const { getPresignedViewUrl, getPresignedDownloadUrl, getPresignedUploadUrl } = await import('@/lib/s3')
    await expect(getPresignedViewUrl('k', 'a.pdf', 'application/pdf')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    await expect(getPresignedDownloadUrl('k')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    await expect(getPresignedUploadUrl('a.pdf', 'application/pdf', 'p1', 'x')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
  })
})
