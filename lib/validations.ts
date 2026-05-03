import { z } from 'zod'

// Enums
export const UserRoleSchema = z.enum(['PRINCIPAL', 'ARCHITECT_SENIOR', 'ARCHITECT', 'BIM', 'ADMIN'])
export const ProjectTypeSchema = z.enum(['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'INSTITUTIONAL', 'MIXED'])
export const ContractTypeSchema = z.enum(['FIXED_FEE', 'PERCENTAGE', 'TIME_AND_MATERIALS'])
export const ProjectPhaseSchema = z.enum(['SD', 'DD', 'CD', 'CA'])
export const ProjectStatusSchema = z.enum(['ON_TRACK', 'AT_RISK', 'OVER_BUDGET', 'CLOSING', 'COMPLETED'])
export const PipelineStageSchema = z.enum(['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'])
export const InvoiceStatusSchema = z.enum(['DRAFT', 'SENT', 'PENDING', 'OVERDUE', 'PAID'])
export const TaskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

// User
export const CreateUserSchema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: UserRoleSchema.default('ARCHITECT'),
})

// Lead
export const CreateLeadSchema = z.object({
  projectName: z.string().min(1, 'Nombre del proyecto requerido'),
  company: z.string().min(1, 'Empresa requerida'),
  contactName: z.string().min(1, 'Contacto requerido'),
  contactEmail: z.string().email('Email inválido'),
  contactPhone: z.string().optional(),
  estimatedValueUSD: z.number().positive('Valor debe ser positivo'),
  projectType: ProjectTypeSchema,
  pipelineStage: PipelineStageSchema.default('PROSPECT'),
  closeProbability: z.number().min(0).max(100).default(0),
  sourceType: z.enum(['REFERRAL', 'DIRECT', 'ONLINE', 'NETWORK']),
  notes: z.string().optional(),
  assignedToId: z.string().cuid('ID de usuario inválido'),
})

export const UpdateLeadStageSchema = z.object({
  pipelineStage: PipelineStageSchema,
  sortOrder: z.number().optional(),
})

// Project
export const CreateProjectSchema = z.object({
  code: z.string().regex(/^P-\d{4}-\d{3}$/, 'Código debe seguir formato P-YYYY-NNN'),
  name: z.string().min(1, 'Nombre requerido'),
  clientId: z.string().cuid(),
  projectManagerId: z.string().cuid(),
  type: ProjectTypeSchema,
  contractType: ContractTypeSchema,
  currentPhase: ProjectPhaseSchema.default('SD'),
  totalBudgetUSD: z.number().positive(),
  startDate: z.string().datetime(),
  estimatedEndDate: z.string().datetime(),
})

export const UpdateProjectSchema = CreateProjectSchema.partial()

// Client
export const CreateClientSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  company: z.string().min(1, 'Empresa requerida'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  type: z.enum(['ACTIVE', 'PROSPECT', 'PAST']).default('PROSPECT'),
  notes: z.string().optional(),
})

// Invoice
export const CreateInvoiceSchema = z.object({
  projectId: z.string().cuid(),
  clientId: z.string().cuid(),
  milestoneLabel: z.string().min(1, 'Hito requerido'),
  amountUSD: z.number().positive('Monto debe ser positivo'),
  currency: z.enum(['USD', 'BOB']).default('USD'),
  exchangeRate: z.number().positive().default(1),
  dueDate: z.string().datetime(),
  notes: z.string().optional(),
})

export const UpdateInvoiceStatusSchema = z.object({
  status: InvoiceStatusSchema,
})

// Task
export const CreateTaskSchema = z.object({
  projectId: z.string().cuid(),
  phaseId: z.string().cuid().optional(),
  assignedToId: z.string().cuid(),
  title: z.string().min(1, 'Título requerido'),
  description: z.string().optional(),
  phase: ProjectPhaseSchema,
  status: TaskStatusSchema.default('TODO'),
  priority: TaskPrioritySchema.default('MEDIUM'),
  dueDate: z.string().datetime(),
  estimatedHours: z.number().positive(),
})

export const UpdateTaskSchema = CreateTaskSchema.partial()

// TimeEntry
export const CreateTimeEntrySchema = z.object({
  projectId: z.string().cuid(),
  phaseId: z.string().cuid().optional(),
  taskId: z.string().cuid().optional(),
  description: z.string().min(1, 'Descripción requerida'),
  hours: z.number().positive('Horas debe ser positivo'),
  date: z.string().datetime(),
})

// Expense
export const CreateExpenseSchema = z.object({
  projectId: z.string().cuid(),
  description: z.string().min(1, 'Descripción requerida'),
  amountUSD: z.number().positive(),
  currency: z.enum(['USD', 'BOB']).default('USD'),
  incurredAt: z.string().datetime(),
})
