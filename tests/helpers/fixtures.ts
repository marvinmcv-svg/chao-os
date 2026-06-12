// Factory functions for creating test entities with sensible defaults.
// Override only the fields you care about; everything else is realistic.

import { prisma } from './db'

let counter = 0
const uniq = (prefix: string) => `${prefix}-${Date.now()}-${++counter}`

export async function makeClient(overrides: Partial<{
  name: string
  company: string
  email: string
  phone: string
  type: 'ACTIVE' | 'PROSPECT' | 'PAST'
}> = {}) {
  return prisma.client.create({
    data: {
      name: overrides.name ?? 'Cliente Test',
      company: overrides.company ?? 'Empresa Test SRL',
      email: overrides.email ?? uniq('client'),
      phone: overrides.phone ?? '+591 70000000',
      type: overrides.type ?? 'ACTIVE',
    },
  })
}

export async function makeProject(overrides: Partial<{
  code: string
  name: string
  type: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'INSTITUTIONAL' | 'MIXED'
  contractType: 'FIXED_FEE' | 'PERCENTAGE' | 'TIME_AND_MATERIALS'
  totalBudgetUSD: number
  clientId: string
  projectManagerId: string
}> = {}) {
  if (!overrides.clientId) throw new Error('makeProject: clientId is required')
  if (!overrides.projectManagerId) throw new Error('makeProject: projectManagerId is required')
  return prisma.project.create({
    data: {
      code: overrides.code ?? uniq('P-2025-'),
      name: overrides.name ?? 'Proyecto Test',
      clientId: overrides.clientId,
      projectManagerId: overrides.projectManagerId,
      type: overrides.type ?? 'RESIDENTIAL',
      contractType: overrides.contractType ?? 'FIXED_FEE',
      currentPhase: 'SD',
      totalBudgetUSD: overrides.totalBudgetUSD ?? 100_000,
      startDate: new Date('2025-01-01'),
      estimatedEndDate: new Date('2025-12-31'),
    },
  })
}

export async function makeLead(overrides: Partial<{
  projectName: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  estimatedValueUSD: number
  projectType: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'INSTITUTIONAL' | 'MIXED'
  pipelineStage: 'PROSPECT' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST'
  closeProbability: number
  sourceType: 'REFERRAL' | 'DIRECT' | 'ONLINE' | 'NETWORK'
  assignedToId: string
}> = {}) {
  if (!overrides.assignedToId) throw new Error('makeLead: assignedToId is required')
  return prisma.lead.create({
    data: {
      projectName: overrides.projectName ?? 'Lead Test',
      company: overrides.company ?? 'Empresa Lead SRL',
      contactName: overrides.contactName ?? 'Contacto Test',
      contactEmail: overrides.contactEmail ?? uniq('lead'),
      contactPhone: overrides.contactPhone ?? '+591 70000000',
      estimatedValueUSD: overrides.estimatedValueUSD ?? 50_000,
      projectType: overrides.projectType ?? 'RESIDENTIAL',
      pipelineStage: overrides.pipelineStage ?? 'PROSPECT',
      closeProbability: overrides.closeProbability ?? 30,
      sourceType: overrides.sourceType ?? 'REFERRAL',
      assignedToId: overrides.assignedToId,
    },
  })
}

export async function makeInvoice(overrides: Partial<{
  number: string
  projectId: string
  clientId: string
  amountUSD: number
  status: 'DRAFT' | 'SENT' | 'PENDING' | 'OVERDUE' | 'PAID'
  dueDate: Date
  paidAt: Date | null
}> = {}) {
  if (!overrides.projectId) throw new Error('makeInvoice: projectId is required')
  if (!overrides.clientId) throw new Error('makeInvoice: clientId is required')
  return prisma.invoice.create({
    data: {
      number: overrides.number ?? uniq('INV-'),
      projectId: overrides.projectId,
      clientId: overrides.clientId,
      amountUSD: overrides.amountUSD ?? 10_000,
      status: overrides.status ?? 'DRAFT',
      dueDate: overrides.dueDate ?? new Date('2025-12-31'),
      paidAt: overrides.paidAt ?? null,
    },
  })
}

export async function makePayment(overrides: Partial<{
  invoiceId: string
  amountUSD: number
}> = {}) {
  if (!overrides.invoiceId) throw new Error('makePayment: invoiceId is required')
  return prisma.payment.create({
    data: {
      invoiceId: overrides.invoiceId,
      amountUSD: overrides.amountUSD ?? 5_000,
    },
  })
}
