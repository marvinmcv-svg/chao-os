/**
 * TEST 4: invoices-status.test.ts
 *
 * Verifies the invoice status transition logic:
 *  - PAID requires sufficient payments (returns 400 INSUFFICIENT_PAYMENTS otherwise)
 *  - PAID with sufficient payments sets paidAt
 *  - PENDING auto-transitions to OVERDUE if past dueDate
 *  - SENT / DRAFT / other transitions work
 *  - 404 for missing invoice
 *  - 401 without session
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PATCH } from '@/app/api/invoices/[id]/status/route'
import { truncateAll, seedAdminUser, prisma } from '../helpers/db'
import { makeClient, makeProject, makeInvoice, makePayment } from '../helpers/fixtures'
import { makeRequest, parseJson, type ApiResponse } from '../helpers/api'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
import { auth } from '@/lib/auth'
// Cast to `any`: NextAuth's `auth` is overloaded (handler / middleware /
// getter), so `vi.mocked(auth)` picks the wrong overload and rejects
// `Session`-shaped values. We only need it as a typed mock.
const mockAuth = vi.mocked(auth) as any

describe('PATCH /api/invoices/:id/status', () => {
  let admin: Awaited<ReturnType<typeof seedAdminUser>>
  let client: Awaited<ReturnType<typeof makeClient>>
  let project: Awaited<ReturnType<typeof makeProject>>

  beforeEach(async () => {
    await truncateAll()
    admin = await seedAdminUser()
    client = await makeClient()
    project = await makeProject({ clientId: client.id, projectManagerId: admin.id })
    mockAuth.mockResolvedValue({
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        avatarInitials: admin.avatarInitials,
      },
    })
  })

  it('returns 400 INSUFFICIENT_PAYMENTS when PAID is set with no payments', async () => {
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
      amountUSD: 10_000,
      status: 'PENDING',
    })

    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'PAID' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })

    expect(res.status).toBe(400)
    const body = (await parseJson<ApiResponse<any>>(res)) as any
    expect(body.error?.code).toBe('INSUFFICIENT_PAYMENTS')
  })

  it('returns 400 INSUFFICIENT_PAYMENTS when PAID is set with partial payments', async () => {
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
      amountUSD: 10_000,
      status: 'PENDING',
    })
    await makePayment({ invoiceId: invoice.id, amountUSD: 4_000 }) // only 40%

    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'PAID' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })

    expect(res.status).toBe(400)
    const body = (await parseJson<ApiResponse<any>>(res)) as any
    expect(body.error?.code).toBe('INSUFFICIENT_PAYMENTS')
  })

  it('transitions to PAID and sets paidAt when payments cover the total', async () => {
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
      amountUSD: 10_000,
      status: 'PENDING',
    })
    await makePayment({ invoiceId: invoice.id, amountUSD: 10_000 })

    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'PAID' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })

    expect(res.status).toBe(200)
    const body = (await parseJson<ApiResponse<any>>(res)) as any
    expect(body.data.status).toBe('PAID')
    expect(body.data.paidAt).toBeTruthy()

    // DB state matches
    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } })
    expect(updated?.status).toBe('PAID')
    expect(updated?.paidAt).not.toBeNull()
  })

  it('transitions to PAID with multiple partial payments that sum to total', async () => {
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
      amountUSD: 10_000,
    })
    await makePayment({ invoiceId: invoice.id, amountUSD: 6_000 })
    await makePayment({ invoiceId: invoice.id, amountUSD: 4_000 })

    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'PAID' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })

    expect(res.status).toBe(200)
    const body = (await parseJson<ApiResponse<any>>(res)) as any
    expect(body.data.status).toBe('PAID')
  })

  it('auto-transitions PENDING to OVERDUE when dueDate is in the past', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
      amountUSD: 10_000,
      status: 'DRAFT',
      dueDate: yesterday,
    })

    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'PENDING' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })

    expect(res.status).toBe(200)
    const body = (await parseJson<ApiResponse<any>>(res)) as any
    expect(body.data.status).toBe('OVERDUE') // not PENDING
  })

  it('keeps PENDING when dueDate is in the future', async () => {
    const nextMonth = new Date()
    nextMonth.setDate(nextMonth.getDate() + 30)
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
      amountUSD: 10_000,
      status: 'DRAFT',
      dueDate: nextMonth,
    })

    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'PENDING' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })

    expect(res.status).toBe(200)
    const body = (await parseJson<ApiResponse<any>>(res)) as any
    expect(body.data.status).toBe('PENDING')
  })

  it('transitions DRAFT to SENT without payment requirement', async () => {
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
      amountUSD: 10_000,
      status: 'DRAFT',
    })

    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'SENT' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })

    expect(res.status).toBe(200)
    const body = (await parseJson<ApiResponse<any>>(res)) as any
    expect(body.data.status).toBe('SENT')
  })

  it('returns 400 VALIDATION_ERROR for an invalid status string', async () => {
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
    })
    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'BOGUS' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a non-existent invoice', async () => {
    const req = makeRequest('PATCH', 'http://localhost:3000/api/invoices/nope/status', {
      body: { status: 'SENT' },
    })
    const res = await PATCH(req, { params: { id: 'nope' } })
    expect(res.status).toBe(404)
  })

  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const invoice = await makeInvoice({
      projectId: project.id,
      clientId: client.id,
    })
    const req = makeRequest('PATCH', `http://localhost:3000/api/invoices/${invoice.id}/status`, {
      body: { status: 'SENT' },
    })
    const res = await PATCH(req, { params: { id: invoice.id } })
    expect(res.status).toBe(401)
  })
})
