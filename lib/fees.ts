/**
 * Fee proposal math — pure functions shared by the API (FeeProposalService),
 * the editor UI and the printable proposal.
 *
 * A proposal is built bottom-up, the way studios actually estimate:
 *   phase (SD/DD/CD/CA) → staff lines (role × hours × billing rate)
 * then a discount is applied on the subtotal. Internal cost is the same
 * hours priced at the team's cost rates, which yields the estimated margin.
 */
import { z } from 'zod'

export const PHASES = ['SD', 'DD', 'CD', 'CA'] as const
export type PhaseCode = (typeof PHASES)[number]

export const STAFF_ROLES = ['PRINCIPAL', 'ARCHITECT_SENIOR', 'ARCHITECT', 'BIM', 'ADMIN'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** Default billing rates (USD/h). Editable per line in every proposal. */
export const DEFAULT_RATE_CARD: Record<StaffRole, number> = {
  PRINCIPAL: 85,
  ARCHITECT_SENIOR: 65,
  ARCHITECT: 45,
  BIM: 38,
  ADMIN: 30,
}

/** Phase fee split used by the template (and the legacy lead conversion). */
export const PHASE_SPLIT: Record<PhaseCode, number> = { SD: 0.15, DD: 0.25, CD: 0.4, CA: 0.2 }

/** Default duration of each phase in weeks, scaled by project size in the template. */
const BASE_WEEKS: Record<PhaseCode, number> = { SD: 4, DD: 6, CD: 8, CA: 12 }

/** Design hours per built m², by project type (studio rule of thumb). */
export const HOURS_PER_M2: Record<string, number> = {
  RESIDENTIAL: 0.9,
  COMMERCIAL: 0.7,
  INDUSTRIAL: 0.35,
  INSTITUTIONAL: 0.8,
  MIXED: 0.75,
  URBAN: 0.5,
  INTERIOR: 1.2,
}

/** How each phase's hours are shared between roles. */
const ROLE_MIX: Record<PhaseCode, Partial<Record<StaffRole, number>>> = {
  SD: { PRINCIPAL: 0.3, ARCHITECT_SENIOR: 0.3, ARCHITECT: 0.4 },
  DD: { PRINCIPAL: 0.15, ARCHITECT_SENIOR: 0.35, ARCHITECT: 0.35, BIM: 0.15 },
  CD: { PRINCIPAL: 0.05, ARCHITECT_SENIOR: 0.25, ARCHITECT: 0.3, BIM: 0.4 },
  CA: { PRINCIPAL: 0.2, ARCHITECT_SENIOR: 0.5, ARCHITECT: 0.2, ADMIN: 0.1 },
}

const ROLE_TASK: Record<StaffRole, string> = {
  PRINCIPAL: 'Dirección de proyecto',
  ARCHITECT_SENIOR: 'Coordinación y diseño',
  ARCHITECT: 'Diseño y documentación',
  BIM: 'Modelado BIM y planos',
  ADMIN: 'Gestión administrativa',
}

// ─── Schema ──────────────────────────────────────────────────────────────────

export const FeeLineSchema = z.object({
  role: z.enum(STAFF_ROLES),
  description: z.string().max(200).default(''),
  hours: z.number().min(0).max(100_000),
  rateUSD: z.number().min(0).max(10_000),
})
export type FeeLine = z.infer<typeof FeeLineSchema>

export const FeePhaseSchema = z.object({
  phase: z.enum(PHASES),
  label: z.string().min(1).max(80),
  durationWeeks: z.number().int().min(0).max(260),
  included: z.boolean().default(true),
  lines: z.array(FeeLineSchema).max(30),
})
export type FeePhase = z.infer<typeof FeePhaseSchema>

export const FeePhasesSchema = z
  .array(FeePhaseSchema)
  .length(4)
  .refine((ps) => PHASES.every((p, i) => ps[i]?.phase === p), 'Las fases deben ser SD, DD, CD, CA en orden')

// ─── Template ────────────────────────────────────────────────────────────────

const round = (n: number, step = 1) => Math.round(n / step) * step
const money = (n: number) => Math.round(n * 100) / 100

export const DEFAULT_PHASE_LABEL: Record<PhaseCode, string> = {
  SD: 'Esquema preliminar',
  DD: 'Desarrollo de diseño',
  CD: 'Documentos de construcción',
  CA: 'Administración de obra',
}

/**
 * Starting estimate from built area and project type. Total design hours
 * = area × hours/m², split by phase and role; durations scale with size.
 * With no area it returns the phase skeleton with zero hours.
 */
export function buildTemplatePhases(args: {
  areaM2?: number | null
  projectType?: string
  rates?: Partial<Record<StaffRole, number>>
}): FeePhase[] {
  const area = args.areaM2 && args.areaM2 > 0 ? args.areaM2 : 0
  const totalHours = area * (HOURS_PER_M2[args.projectType ?? ''] ?? 0.75)
  // 1000 m² ≈ base durations; grows with the square root of size, bounded
  const scale = area ? Math.min(2.5, Math.max(0.5, Math.sqrt(area / 1000))) : 1
  const rate = (r: StaffRole) => args.rates?.[r] ?? DEFAULT_RATE_CARD[r]

  return PHASES.map((phase) => {
    const phaseHours = totalHours * PHASE_SPLIT[phase]
    const lines = (Object.entries(ROLE_MIX[phase]) as [StaffRole, number][]).map(([role, share]) => ({
      role,
      description: ROLE_TASK[role],
      hours: round(phaseHours * share, 5),
      rateUSD: rate(role),
    }))
    return {
      phase,
      label: DEFAULT_PHASE_LABEL[phase],
      durationWeeks: Math.max(1, round(BASE_WEEKS[phase] * scale)),
      included: true,
      lines,
    }
  })
}

// ─── Totals ──────────────────────────────────────────────────────────────────

export interface PhaseTotals {
  phase: PhaseCode
  label: string
  included: boolean
  hours: number
  /** Fee before discount */
  grossUSD: number
  /** Fee after the proposal discount — this becomes the phase budget */
  feeUSD: number
  costUSD: number
  sharePercent: number
}

export interface ProposalTotals {
  phases: PhaseTotals[]
  hours: number
  subtotalUSD: number
  discountUSD: number
  feeUSD: number
  costUSD: number
  marginUSD: number
  marginPercent: number
  durationWeeks: number
  /** Effective blended rate the client pays per hour */
  blendedRateUSD: number
}

/**
 * Compute every figure the editor, PDF and conversion need.
 * Excluded phases contribute nothing. `costRates` are internal cost per
 * hour by role; roles without one fall back to `defaultCostRate`.
 */
export function computeProposal(
  phases: FeePhase[],
  opts: { discountPercent?: number; costRates?: Partial<Record<string, number>>; defaultCostRate?: number } = {},
): ProposalTotals {
  const discount = Math.min(100, Math.max(0, opts.discountPercent ?? 0)) / 100
  const fallbackCost = opts.defaultCostRate ?? 25
  const costOf = (role: string) => opts.costRates?.[role] ?? fallbackCost

  const raw = phases.map((p) => {
    const lines = p.included ? p.lines : []
    return {
      phase: p.phase,
      label: p.label,
      included: p.included,
      durationWeeks: p.included ? p.durationWeeks : 0,
      hours: lines.reduce((s, l) => s + l.hours, 0),
      grossUSD: lines.reduce((s, l) => s + l.hours * l.rateUSD, 0),
      costUSD: lines.reduce((s, l) => s + l.hours * costOf(l.role), 0),
    }
  })

  const subtotal = raw.reduce((s, p) => s + p.grossUSD, 0)
  const fee = subtotal * (1 - discount)
  const cost = raw.reduce((s, p) => s + p.costUSD, 0)
  const hours = raw.reduce((s, p) => s + p.hours, 0)

  return {
    phases: raw.map((p) => ({
      phase: p.phase,
      label: p.label,
      included: p.included,
      hours: p.hours,
      grossUSD: money(p.grossUSD),
      feeUSD: money(p.grossUSD * (1 - discount)),
      costUSD: money(p.costUSD),
      sharePercent: subtotal ? Math.round((p.grossUSD / subtotal) * 1000) / 10 : 0,
    })),
    hours,
    subtotalUSD: money(subtotal),
    discountUSD: money(subtotal - fee),
    feeUSD: money(fee),
    costUSD: money(cost),
    marginUSD: money(fee - cost),
    marginPercent: fee ? Math.round(((fee - cost) / fee) * 1000) / 10 : 0,
    durationWeeks: raw.reduce((s, p) => s + p.durationWeeks, 0),
    blendedRateUSD: hours ? money(fee / hours) : 0,
  }
}

/**
 * Lay phases end-to-end from a start date. Excluded phases get no dates.
 * Returns ISO-free Date objects so the service can write them directly.
 */
export function schedulePhases(
  phases: Pick<FeePhase, 'phase' | 'durationWeeks' | 'included'>[],
  start: Date,
): { phase: PhaseCode; startDate: Date | null; endDate: Date | null }[] {
  let cursor = new Date(start)
  return phases.map((p) => {
    if (!p.included || p.durationWeeks <= 0) return { phase: p.phase, startDate: null, endDate: null }
    const s = new Date(cursor)
    const e = new Date(cursor.getTime() + p.durationWeeks * 7 * 86_400_000 - 86_400_000)
    cursor = new Date(e.getTime() + 86_400_000)
    return { phase: p.phase, startDate: s, endDate: e }
  })
}
