import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RATE_CARD,
  FeePhasesSchema,
  PHASE_SPLIT,
  buildTemplatePhases,
  computeProposal,
  schedulePhases,
  type FeePhase,
} from '@/lib/fees'

const phase = (code: FeePhase['phase'], lines: FeePhase['lines'], extra: Partial<FeePhase> = {}): FeePhase => ({
  phase: code,
  label: code,
  durationWeeks: 4,
  included: true,
  lines,
  ...extra,
})

const four = (sd: FeePhase['lines'], dd: FeePhase['lines'] = [], cd: FeePhase['lines'] = [], ca: FeePhase['lines'] = []) => [
  phase('SD', sd),
  phase('DD', dd),
  phase('CD', cd),
  phase('CA', ca),
]

describe('buildTemplatePhases', () => {
  it('returns the four phases in order with zero hours when no area is given', () => {
    const ps = buildTemplatePhases({})
    expect(ps.map((p) => p.phase)).toEqual(['SD', 'DD', 'CD', 'CA'])
    expect(ps.every((p) => p.lines.every((l) => l.hours === 0))).toBe(true)
    expect(FeePhasesSchema.safeParse(ps).success).toBe(true)
  })

  it('derives hours from area × hours/m² and splits them by phase', () => {
    const ps = buildTemplatePhases({ areaM2: 1000, projectType: 'RESIDENTIAL' })
    const hours = ps.map((p) => p.lines.reduce((s, l) => s + l.hours, 0))
    const total = hours.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(850)
    expect(total).toBeLessThan(950) // 1000 m² × 0.9 h/m², rounded to 5 h per line
    expect(hours[2] / total).toBeCloseTo(PHASE_SPLIT.CD, 1)
  })

  it('uses the default rate card unless rates are overridden', () => {
    const ps = buildTemplatePhases({ areaM2: 500, rates: { ARCHITECT: 99 } })
    const arch = ps[0].lines.find((l) => l.role === 'ARCHITECT')!
    const principal = ps[0].lines.find((l) => l.role === 'PRINCIPAL')!
    expect(arch.rateUSD).toBe(99)
    expect(principal.rateUSD).toBe(DEFAULT_RATE_CARD.PRINCIPAL)
  })

  it('scales durations with size, within bounds', () => {
    const small = buildTemplatePhases({ areaM2: 100 })
    const big = buildTemplatePhases({ areaM2: 50_000 })
    expect(small[2].durationWeeks).toBeLessThan(big[2].durationWeeks)
    expect(big[2].durationWeeks).toBe(20) // 8 weeks × 2.5 cap
  })
})

describe('computeProposal', () => {
  const lines = (h: number, rate = 50, role: 'ARCHITECT' | 'PRINCIPAL' = 'ARCHITECT') => [{ role, description: '', hours: h, rateUSD: rate }]

  it('sums fee, hours, cost and margin across phases', () => {
    const t = computeProposal(four(lines(10), lines(20), lines(30), lines(40)), { costRates: { ARCHITECT: 20 } })
    expect(t.hours).toBe(100)
    expect(t.subtotalUSD).toBe(5000)
    expect(t.feeUSD).toBe(5000)
    expect(t.costUSD).toBe(2000)
    expect(t.marginUSD).toBe(3000)
    expect(t.marginPercent).toBe(60)
    expect(t.blendedRateUSD).toBe(50)
    expect(t.phases.map((p) => p.sharePercent)).toEqual([10, 20, 30, 40])
  })

  it('applies the discount to the total and to each phase budget', () => {
    const t = computeProposal(four(lines(100), lines(100)), { discountPercent: 10 })
    expect(t.subtotalUSD).toBe(10000)
    expect(t.discountUSD).toBe(1000)
    expect(t.feeUSD).toBe(9000)
    expect(t.phases[0].feeUSD).toBe(4500)
    expect(t.phases[0].grossUSD).toBe(5000)
  })

  it('ignores excluded phases entirely', () => {
    const ps = four(lines(10), lines(10))
    ps[1].included = false
    const t = computeProposal(ps)
    expect(t.hours).toBe(10)
    expect(t.phases[1]).toMatchObject({ feeUSD: 0, hours: 0, included: false })
    expect(t.durationWeeks).toBe(12) // DD's 4 weeks dropped
  })

  it('falls back to the default cost rate for roles without one', () => {
    const t = computeProposal(four(lines(10, 80, 'PRINCIPAL')), { costRates: {}, defaultCostRate: 30 })
    expect(t.costUSD).toBe(300)
  })

  it('is safe with an empty proposal', () => {
    const t = computeProposal(four([]))
    expect(t).toMatchObject({ feeUSD: 0, marginPercent: 0, blendedRateUSD: 0 })
    expect(t.phases.every((p) => p.sharePercent === 0)).toBe(true)
  })

  it('clamps the discount to 0–100%', () => {
    expect(computeProposal(four(lines(1)), { discountPercent: -20 }).feeUSD).toBe(50)
    expect(computeProposal(four(lines(1)), { discountPercent: 150 }).feeUSD).toBe(0)
  })
})

describe('schedulePhases', () => {
  it('lays phases end-to-end and skips excluded ones', () => {
    const start = new Date('2026-01-05T00:00:00Z')
    const s = schedulePhases(
      [
        { phase: 'SD', durationWeeks: 2, included: true },
        { phase: 'DD', durationWeeks: 3, included: false },
        { phase: 'CD', durationWeeks: 1, included: true },
        { phase: 'CA', durationWeeks: 0, included: true },
      ],
      start,
    )
    expect(s[0].startDate?.toISOString().slice(0, 10)).toBe('2026-01-05')
    expect(s[0].endDate?.toISOString().slice(0, 10)).toBe('2026-01-18')
    expect(s[1]).toMatchObject({ startDate: null, endDate: null })
    expect(s[2].startDate?.toISOString().slice(0, 10)).toBe('2026-01-19')
    expect(s[2].endDate?.toISOString().slice(0, 10)).toBe('2026-01-25')
    expect(s[3].startDate).toBeNull()
  })
})

describe('FeePhasesSchema', () => {
  it('rejects phases out of order or missing', () => {
    const ps = buildTemplatePhases({})
    expect(FeePhasesSchema.safeParse([ps[1], ps[0], ps[2], ps[3]]).success).toBe(false)
    expect(FeePhasesSchema.safeParse(ps.slice(0, 3)).success).toBe(false)
  })

  it('rejects negative hours', () => {
    const ps = buildTemplatePhases({ areaM2: 100 })
    ps[0].lines[0].hours = -1
    expect(FeePhasesSchema.safeParse(ps).success).toBe(false)
  })
})
