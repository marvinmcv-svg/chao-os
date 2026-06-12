/**
 * TEST 8: validations.test.ts
 *
 * Verifies all Zod schemas in lib/validations.ts. These schemas gate
 * every API input, so a regression here means bad data hits the DB.
 *
 * Coverage:
 *  - 9 enum schemas: all valid values accepted, invalid rejected
 *  - CreateUserSchema: name/email/password constraints + default role
 *  - CreateLeadSchema: required fields, email, positive value, probability range, cuid
 *  - UpdateLeadStageSchema: stage required, sortOrder optional
 *  - CreateProjectSchema: code regex (P-YYYY-NNN), dates, cuids, defaults
 *  - UpdateProjectSchema: .partial() — empty object valid
 *  - CreateClientSchema: required fields, default type=PROSPECT
 *  - CreateInvoiceSchema: positive amount, currency enum, default USD
 *  - UpdateInvoiceStatusSchema: status enum only
 *  - CreateTaskSchema: required fields, defaults
 *  - UpdateTaskSchema: .partial() — empty object valid
 *  - CreateTimeEntrySchema: positive hours, required date
 *  - CreateExpenseSchema: positive amount, default USD
 */
import { describe, it, expect } from 'vitest'
import {
  UserRoleSchema, ProjectTypeSchema, ContractTypeSchema, ProjectPhaseSchema,
  ProjectStatusSchema, PipelineStageSchema, InvoiceStatusSchema, TaskStatusSchema,
  TaskPrioritySchema,
  CreateUserSchema, CreateLeadSchema, UpdateLeadStageSchema,
  CreateProjectSchema, UpdateProjectSchema,
  CreateClientSchema,
  CreateInvoiceSchema, UpdateInvoiceStatusSchema,
  CreateTaskSchema, UpdateTaskSchema,
  CreateTimeEntrySchema, CreateExpenseSchema,
} from '@/lib/validations'

// ─── Helpers ──────────────────────────────────────────────────────────────

const validCuid = 'ck1234567890abcdefghij1234'

// ─── Enum schemas ─────────────────────────────────────────────────────────

describe('UserRoleSchema', () => {
  it.each(['PRINCIPAL', 'ARCHITECT_SENIOR', 'ARCHITECT', 'BIM', 'ADMIN'] as const)(
    'accepts %s',
    (role) => {
      expect(UserRoleSchema.parse(role)).toBe(role)
    }
  )
  it('rejects unknown role', () => {
    expect(() => UserRoleSchema.parse('GUEST')).toThrow()
  })
})

describe('ProjectTypeSchema', () => {
  it.each(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'INSTITUTIONAL', 'MIXED'] as const)(
    'accepts %s',
    (type) => {
      expect(ProjectTypeSchema.parse(type)).toBe(type)
    }
  )
  it('rejects unknown type', () => {
    expect(() => ProjectTypeSchema.parse('OTHER')).toThrow()
  })
})

describe('ContractTypeSchema', () => {
  it.each(['FIXED_FEE', 'PERCENTAGE', 'TIME_AND_MATERIALS'] as const)(
    'accepts %s',
    (type) => {
      expect(ContractTypeSchema.parse(type)).toBe(type)
    }
  )
  it('rejects unknown contract type', () => {
    expect(() => ContractTypeSchema.parse('HOURLY')).toThrow()
  })
})

describe('ProjectPhaseSchema', () => {
  it.each(['SD', 'DD', 'CD', 'CA'] as const)('accepts %s', (p) => {
    expect(ProjectPhaseSchema.parse(p)).toBe(p)
  })
  it('rejects unknown phase', () => {
    expect(() => ProjectPhaseSchema.parse('CONSTRUCTION')).toThrow()
  })
})

describe('ProjectStatusSchema', () => {
  it.each(['ON_TRACK', 'AT_RISK', 'OVER_BUDGET', 'CLOSING', 'COMPLETED'] as const)(
    'accepts %s',
    (s) => {
      expect(ProjectStatusSchema.parse(s)).toBe(s)
    }
  )
  it('rejects unknown status', () => {
    expect(() => ProjectStatusSchema.parse('CANCELLED')).toThrow()
  })
})

describe('PipelineStageSchema', () => {
  it.each(['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const)(
    'accepts %s',
    (s) => {
      expect(PipelineStageSchema.parse(s)).toBe(s)
    }
  )
  it('rejects unknown stage', () => {
    expect(() => PipelineStageSchema.parse('COLD')).toThrow()
  })
})

describe('InvoiceStatusSchema', () => {
  it.each(['DRAFT', 'SENT', 'PENDING', 'OVERDUE', 'PAID'] as const)('accepts %s', (s) => {
    expect(InvoiceStatusSchema.parse(s)).toBe(s)
  })
  it('rejects unknown invoice status', () => {
    expect(() => InvoiceStatusSchema.parse('CANCELLED')).toThrow()
  })
})

describe('TaskStatusSchema', () => {
  it.each(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const)('accepts %s', (s) => {
    expect(TaskStatusSchema.parse(s)).toBe(s)
  })
  it('rejects unknown task status', () => {
    expect(() => TaskStatusSchema.parse('BLOCKED')).toThrow()
  })
})

describe('TaskPrioritySchema', () => {
  it.each(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const)('accepts %s', (p) => {
    expect(TaskPrioritySchema.parse(p)).toBe(p)
  })
  it('rejects unknown priority', () => {
    expect(() => TaskPrioritySchema.parse('CRITICAL')).toThrow()
  })
})

// ─── CreateUserSchema ─────────────────────────────────────────────────────

describe('CreateUserSchema', () => {
  const valid = { name: 'Marvin', email: 'marvin@example.com', password: 'password123' }

  it('accepts a valid user', () => {
    const result = CreateUserSchema.parse(valid)
    expect(result.name).toBe('Marvin')
    expect(result.email).toBe('marvin@example.com')
  })

  it('applies default role ARCHITECT when not provided', () => {
    expect(CreateUserSchema.parse(valid).role).toBe('ARCHITECT')
  })

  it('rejects name shorter than 2 chars with Spanish error', () => {
    expect(() => CreateUserSchema.parse({ ...valid, name: 'A' })).toThrow(/Nombre/)
  })

  it('rejects invalid email', () => {
    expect(() => CreateUserSchema.parse({ ...valid, email: 'not-an-email' })).toThrow(/Email/)
  })

  it('rejects password shorter than 8 chars with Spanish error', () => {
    expect(() => CreateUserSchema.parse({ ...valid, password: 'short' })).toThrow(/8 caracteres/)
  })
})

// ─── CreateLeadSchema ─────────────────────────────────────────────────────

describe('CreateLeadSchema', () => {
  const valid = {
    projectName: 'Casa Test',
    company: 'Test Co',
    contactName: 'Jane Doe',
    contactEmail: 'jane@test.com',
    estimatedValueUSD: 50000,
    projectType: 'RESIDENTIAL' as const,
    sourceType: 'REFERRAL' as const,
    assignedToId: validCuid,
  }

  it('accepts a valid lead and applies defaults (stage=PROSPECT, probability=0)', () => {
    const result = CreateLeadSchema.parse(valid)
    expect(result.pipelineStage).toBe('PROSPECT')
    expect(result.closeProbability).toBe(0)
  })

  it('rejects missing projectName', () => {
    expect(() => CreateLeadSchema.parse({ ...valid, projectName: '' })).toThrow()
  })

  it('rejects negative estimatedValueUSD', () => {
    expect(() => CreateLeadSchema.parse({ ...valid, estimatedValueUSD: -1 })).toThrow(/positivo/)
  })

  it('rejects zero estimatedValueUSD (not positive)', () => {
    expect(() => CreateLeadSchema.parse({ ...valid, estimatedValueUSD: 0 })).toThrow()
  })

  it('rejects closeProbability above 100', () => {
    expect(() =>
      CreateLeadSchema.parse({ ...valid, closeProbability: 101 })
    ).toThrow()
  })

  it('rejects closeProbability below 0', () => {
    expect(() =>
      CreateLeadSchema.parse({ ...valid, closeProbability: -5 })
    ).toThrow()
  })

  it('rejects invalid assignedToId (not a cuid)', () => {
    expect(() =>
      CreateLeadSchema.parse({ ...valid, assignedToId: 'not-a-cuid' })
    ).toThrow(/ID de usuario/)
  })

  it('rejects invalid sourceType', () => {
    expect(() =>
      CreateLeadSchema.parse({ ...valid, sourceType: 'COLD_CALL' as 'REFERRAL' })
    ).toThrow()
  })
})

// ─── UpdateLeadStageSchema ────────────────────────────────────────────────

describe('UpdateLeadStageSchema', () => {
  it('accepts stage only (sortOrder optional)', () => {
    const result = UpdateLeadStageSchema.parse({ pipelineStage: 'WON' })
    expect(result.pipelineStage).toBe('WON')
    expect(result.sortOrder).toBeUndefined()
  })

  it('accepts stage + sortOrder', () => {
    const result = UpdateLeadStageSchema.parse({ pipelineStage: 'NEGOTIATION', sortOrder: 3 })
    expect(result.sortOrder).toBe(3)
  })
})

// ─── CreateProjectSchema ──────────────────────────────────────────────────

describe('CreateProjectSchema', () => {
  const valid = {
    code: 'P-2026-001',
    name: 'Casa Ejemplo',
    clientId: validCuid,
    projectManagerId: validCuid,
    type: 'RESIDENTIAL' as const,
    contractType: 'FIXED_FEE' as const,
    totalBudgetUSD: 100000,
    startDate: '2026-07-01T00:00:00.000Z',
    estimatedEndDate: '2027-01-01T00:00:00.000Z',
  }

  it('accepts a valid project and applies default currentPhase=SD', () => {
    const result = CreateProjectSchema.parse(valid)
    expect(result.currentPhase).toBe('SD')
  })

  it('rejects code not matching P-YYYY-NNN pattern', () => {
    expect(() =>
      CreateProjectSchema.parse({ ...valid, code: 'INVALID' })
    ).toThrow(/P-YYYY-NNN/)
  })

  it('rejects code with wrong year format', () => {
    expect(() =>
      CreateProjectSchema.parse({ ...valid, code: 'P-26-001' })
    ).toThrow()
  })

  it('rejects non-cuid clientId', () => {
    expect(() =>
      CreateProjectSchema.parse({ ...valid, clientId: 'not-cuid' })
    ).toThrow()
  })

  it('rejects negative totalBudgetUSD', () => {
    expect(() =>
      CreateProjectSchema.parse({ ...valid, totalBudgetUSD: -1 })
    ).toThrow()
  })

  it('rejects non-datetime startDate', () => {
    expect(() =>
      CreateProjectSchema.parse({ ...valid, startDate: '2026-07-01' })
    ).toThrow()
  })
})

// ─── UpdateProjectSchema ──────────────────────────────────────────────────

describe('UpdateProjectSchema', () => {
  it('accepts empty object (all fields optional via .partial())', () => {
    expect(() => UpdateProjectSchema.parse({})).not.toThrow()
  })

  it('accepts partial update (only name)', () => {
    const result = UpdateProjectSchema.parse({ name: 'New Name' })
    expect(result.name).toBe('New Name')
  })
})

// ─── CreateClientSchema ───────────────────────────────────────────────────

describe('CreateClientSchema', () => {
  const valid = { name: 'Acme Corp', company: 'Acme SA', email: 'contact@acme.com' }

  it('accepts valid client and applies default type=PROSPECT and phone=""', () => {
    const result = CreateClientSchema.parse(valid)
    expect(result.type).toBe('PROSPECT')
    expect(result.phone).toBe('')
  })

  it('rejects missing name', () => {
    expect(() => CreateClientSchema.parse({ ...valid, name: '' })).toThrow()
  })

  it('rejects invalid email', () => {
    expect(() => CreateClientSchema.parse({ ...valid, email: 'bad' })).toThrow(/Email/)
  })

  it('rejects invalid type enum', () => {
    expect(() =>
      CreateClientSchema.parse({ ...valid, type: 'INACTIVE' as 'PROSPECT' })
    ).toThrow()
  })
})

// ─── CreateInvoiceSchema ──────────────────────────────────────────────────

describe('CreateInvoiceSchema', () => {
  const valid = {
    projectId: validCuid,
    clientId: validCuid,
    milestoneLabel: 'Hito 1 — Diseño',
    amountUSD: 10000,
    dueDate: '2026-08-01T00:00:00.000Z',
  }

  it('accepts a valid invoice and applies defaults (currency=USD, exchangeRate=1)', () => {
    const result = CreateInvoiceSchema.parse(valid)
    expect(result.currency).toBe('USD')
    expect(result.exchangeRate).toBe(1)
  })

  it('rejects zero amountUSD (not positive)', () => {
    expect(() =>
      CreateInvoiceSchema.parse({ ...valid, amountUSD: 0 })
    ).toThrow(/positivo/)
  })

  it('rejects invalid currency', () => {
    expect(() =>
      CreateInvoiceSchema.parse({ ...valid, currency: 'EUR' as 'USD' })
    ).toThrow()
  })

  it('accepts BOB currency', () => {
    const result = CreateInvoiceSchema.parse({ ...valid, currency: 'BOB' })
    expect(result.currency).toBe('BOB')
  })
})

// ─── UpdateInvoiceStatusSchema ────────────────────────────────────────────

describe('UpdateInvoiceStatusSchema', () => {
  it('accepts valid status', () => {
    expect(UpdateInvoiceStatusSchema.parse({ status: 'PAID' }).status).toBe('PAID')
  })

  it('rejects invalid status', () => {
    expect(() => UpdateInvoiceStatusSchema.parse({ status: 'CANCELLED' })).toThrow()
  })
})

// ─── CreateTaskSchema ─────────────────────────────────────────────────────

describe('CreateTaskSchema', () => {
  const valid = {
    projectId: validCuid,
    assignedToId: validCuid,
    title: 'Planos estructurales',
    phase: 'DD' as const,
    dueDate: '2026-07-15T00:00:00.000Z',
    estimatedHours: 8,
  }

  it('accepts valid task and applies defaults (status=TODO, priority=MEDIUM)', () => {
    const result = CreateTaskSchema.parse(valid)
    expect(result.status).toBe('TODO')
    expect(result.priority).toBe('MEDIUM')
  })

  it('rejects empty title', () => {
    expect(() => CreateTaskSchema.parse({ ...valid, title: '' })).toThrow(/Título/)
  })

  it('rejects zero estimatedHours (not positive)', () => {
    expect(() =>
      CreateTaskSchema.parse({ ...valid, estimatedHours: 0 })
    ).toThrow()
  })

  it('rejects negative estimatedHours', () => {
    expect(() =>
      CreateTaskSchema.parse({ ...valid, estimatedHours: -2 })
    ).toThrow()
  })
})

// ─── UpdateTaskSchema ─────────────────────────────────────────────────────

describe('UpdateTaskSchema', () => {
  it('accepts empty object (all fields optional via .partial())', () => {
    expect(() => UpdateTaskSchema.parse({})).not.toThrow()
  })

  it('accepts partial update (only status)', () => {
    const result = UpdateTaskSchema.parse({ status: 'DONE' })
    expect(result.status).toBe('DONE')
  })
})

// ─── CreateTimeEntrySchema ────────────────────────────────────────────────

describe('CreateTimeEntrySchema', () => {
  const valid = {
    projectId: validCuid,
    description: 'Revisión de planos',
    hours: 2.5,
    date: '2026-06-12T00:00:00.000Z',
  }

  it('accepts valid time entry', () => {
    expect(() => CreateTimeEntrySchema.parse(valid)).not.toThrow()
  })

  it('rejects empty description', () => {
    expect(() =>
      CreateTimeEntrySchema.parse({ ...valid, description: '' })
    ).toThrow(/Descripci/)
  })

  it('rejects negative hours', () => {
    expect(() =>
      CreateTimeEntrySchema.parse({ ...valid, hours: -1 })
    ).toThrow(/positivo/)
  })
})

// ─── CreateExpenseSchema ──────────────────────────────────────────────────

describe('CreateExpenseSchema', () => {
  const valid = {
    projectId: validCuid,
    description: 'Licencia software',
    amountUSD: 500,
    incurredAt: '2026-06-10T00:00:00.000Z',
  }

  it('accepts valid expense and applies default currency=USD', () => {
    const result = CreateExpenseSchema.parse(valid)
    expect(result.currency).toBe('USD')
  })

  it('rejects empty description', () => {
    expect(() =>
      CreateExpenseSchema.parse({ ...valid, description: '' })
    ).toThrow()
  })

  it('rejects negative amountUSD', () => {
    expect(() =>
      CreateExpenseSchema.parse({ ...valid, amountUSD: -100 })
    ).toThrow()
  })
})
