/**
 * TEST 3: leads-convert.test.ts
 *
 * Verifies the most complex business operation: converting a WON lead
 * into a project. This locks down:
 *  - the route creates a new Project with 4 phases (15/25/40/20% of budget)
 *  - the route creates a Client if one doesn't exist, or reuses existing
 *  - the route links the lead back via convertedToProjectId
 *  - the route writes an AuditLog entry
 *  - state errors: only WON leads can be converted
 *  - state errors: already-converted leads return 409
 *  - state errors: non-WON leads return 422
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '@/app/api/leads/[id]/convert/route'
import { truncateAll, seedAdminUser, prisma } from '../helpers/db'
import { makeClient, makeLead } from '../helpers/fixtures'
import { makeRequest, parseJson, type ApiResponse } from '../helpers/api'

// Mock @/lib/auth so the route's `auth()` call returns a valid session.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

import { auth } from '@/lib/auth'
const mockAuth = vi.mocked(auth)

describe('POST /api/leads/:id/convert', () => {
  let admin: Awaited<ReturnType<typeof seedAdminUser>>

  beforeEach(async () => {
    await truncateAll()
    admin = await seedAdminUser()
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

  it('converts a WON lead into a project with 4 phases and a new client', async () => {
    const lead = await makeLead({
      pipelineStage: 'WON',
      estimatedValueUSD: 100_000,
      assignedToId: admin.id,
      projectName: 'Torre Test',
      company: 'Test Corp SRL',
    })

    const req = makeRequest('POST', `http://localhost:3000/api/leads/${lead.id}/convert`)
    const res = await POST(req, { params: { id: lead.id } })
    const body = await parseJson<ApiResponse<any>>(res)

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      name: 'Torre Test',
      currentPhase: 'SD',
      totalBudgetUSD: 100_000,
    })
    expect(body.data.code).toMatch(/^P-\d{4}-\d{3}$/)

    // 4 phases created with correct budget split
    expect(body.data.phases).toHaveLength(4)
    const budgetByPhase = Object.fromEntries(
      body.data.phases.map((p: any) => [p.phase, p.budgetUSD])
    )
    expect(budgetByPhase.SD).toBe(15_000) // 15%
    expect(budgetByPhase.DD).toBe(25_000) // 25%
    expect(budgetByPhase.CD).toBe(40_000) // 40%
    expect(budgetByPhase.CA).toBe(20_000) // 20%

    // Client created from lead data
    const newClient = await prisma.client.findUnique({ where: { id: body.data.clientId } })
    expect(newClient).toMatchObject({
      name: lead.contactName,
      company: 'Test Corp SRL',
      type: 'ACTIVE',
    })

    // Lead linked back to project
    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } })
    expect(updatedLead?.convertedToProjectId).toBe(body.data.id)
  })

  it('reuses an existing client when email or company matches', async () => {
    const existing = await makeClient({
      email: 'match@example.com',
      company: 'Match Co',
    })
    const lead = await makeLead({
      pipelineStage: 'WON',
      contactEmail: 'match@example.com',
      company: 'Match Co',
      assignedToId: admin.id,
    })

    const req = makeRequest('POST', `http://localhost:3000/api/leads/${lead.id}/convert`)
    const res = await POST(req, { params: { id: lead.id } })
    const body = await parseJson<ApiResponse<any>>(res)

    expect(res.status).toBe(201)
    expect(body.data.clientId).toBe(existing.id)

    // No duplicate client created
    const clientCount = await prisma.client.count({
      where: { email: 'match@example.com' },
    })
    expect(clientCount).toBe(1)
  })

  it('returns 404 if the lead does not exist', async () => {
    const req = makeRequest('POST', 'http://localhost:3000/api/leads/nonexistent/convert')
    const res = await POST(req, { params: { id: 'nonexistent' } })
    expect(res.status).toBe(404)
    const body = await parseJson<ApiResponse<any>>(res)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('NOT_FOUND')
  })

  it('returns 422 if the lead is not in WON stage', async () => {
    const lead = await makeLead({
      pipelineStage: 'NEGOTIATION',
      assignedToId: admin.id,
    })
    const req = makeRequest('POST', `http://localhost:3000/api/leads/${lead.id}/convert`)
    const res = await POST(req, { params: { id: lead.id } })
    expect(res.status).toBe(422)
    const body = await parseJson<ApiResponse<any>>(res)
    expect(body.error?.code).toBe('INVALID_STATE')
  })

  it('returns 409 if the lead has already been converted', async () => {
    const lead = await makeLead({
      pipelineStage: 'WON',
      assignedToId: admin.id,
    })
    // Pre-link the lead to a project to simulate "already converted"
    const fakeProject = await prisma.project.create({
      data: {
        code: 'P-2025-999',
        name: 'Existing',
        clientId: (await makeClient()).id,
        projectManagerId: admin.id,
        type: 'RESIDENTIAL',
        contractType: 'FIXED_FEE',
        currentPhase: 'SD',
        totalBudgetUSD: 50_000,
        startDate: new Date(),
        estimatedEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    })
    await prisma.lead.update({
      where: { id: lead.id },
      data: { convertedToProjectId: fakeProject.id },
    })

    const req = makeRequest('POST', `http://localhost:3000/api/leads/${lead.id}/convert`)
    const res = await POST(req, { params: { id: lead.id } })
    expect(res.status).toBe(409)
    const body = await parseJson<ApiResponse<any>>(res)
    expect(body.error?.code).toBe('CONFLICT')
  })

  it('returns 401 when no session is present', async () => {
    mockAuth.mockResolvedValueOnce(null)
    const lead = await makeLead({
      pipelineStage: 'WON',
      assignedToId: admin.id,
    })
    const req = makeRequest('POST', `http://localhost:3000/api/leads/${lead.id}/convert`)
    const res = await POST(req, { params: { id: lead.id } })
    expect(res.status).toBe(401)
  })

  it('writes an audit log entry on successful conversion', async () => {
    const lead = await makeLead({
      pipelineStage: 'WON',
      assignedToId: admin.id,
    })
    const req = makeRequest('POST', `http://localhost:3000/api/leads/${lead.id}/convert`)
    const res = await POST(req, { params: { id: lead.id } })
    const body = await parseJson<ApiResponse<any>>(res)

    // The convert route logs the audit with the NEW project's id
    // (entityType: 'Project'), not the lead's id. See app/api/leads/[id]/convert/route.ts:90-98
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: body.data.id, action: 'CREATE' },
    })
    expect(audit, 'audit log for new project should exist').not.toBeNull()
    expect(audit?.entityType).toBe('Project')
    expect(audit?.userId).toBe(admin.id)
  })
})
