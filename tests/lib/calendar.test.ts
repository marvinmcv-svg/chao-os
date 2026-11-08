import { describe, it, expect } from 'vitest'
import {
  addDays,
  bolivianHolidays,
  countWorkingDays,
  easterSunday,
  expectedHoursToDate,
  holidaysBetween,
  mondayOf,
  todayKey,
  weekAvailability,
  weekStarts,
} from '@/lib/calendar'

describe('day-key helpers', () => {
  it('finds the Monday of any day (Sunday belongs to the previous week)', () => {
    expect(mondayOf('2026-11-11')).toBe('2026-11-09')
    expect(mondayOf('2026-11-09')).toBe('2026-11-09')
    expect(mondayOf('2026-11-15')).toBe('2026-11-09') // Sunday
    expect(mondayOf('2027-01-01')).toBe('2026-12-28') // across a year boundary
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('takes today in La Paz, not UTC', () => {
    // 02:00 UTC on the 12th is still 22:00 on the 11th in La Paz (UTC-4)
    expect(todayKey(new Date('2026-11-12T02:00:00Z'))).toBe('2026-11-11')
  })

  it('lists consecutive Monday week starts', () => {
    expect(weekStarts('2026-11-11', 3)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
  })
})

describe('Bolivian holidays', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
  ])('computes Easter %i', (year, easter) => {
    expect(easterSunday(year)).toBe(easter)
  })

  it('derives the movable feasts from Easter (2026)', () => {
    const h = Object.fromEntries(bolivianHolidays(2026).map((x) => [x.name, x.date]))
    expect(h['Carnaval (lunes)']).toBe('2026-02-16')
    expect(h['Carnaval (martes)']).toBe('2026-02-17')
    expect(h['Viernes Santo']).toBe('2026-04-03')
    expect(h['Corpus Christi']).toBe('2026-06-04')
  })

  it('includes the fixed national holidays and the Santa Cruz anniversary by default', () => {
    const dates = bolivianHolidays(2026).map((x) => x.date)
    for (const d of ['2026-01-01', '2026-01-22', '2026-05-01', '2026-06-22', '2026-08-06', '2026-11-02', '2026-12-25', '2026-09-24']) {
      expect(dates).toContain(d)
    }
    expect(bolivianHolidays(2026, null).some((x) => x.scope === 'DEPARTMENTAL')).toBe(false)
    expect(bolivianHolidays(2026, 'LPZ').find((x) => x.scope === 'DEPARTMENTAL')?.date).toBe('2026-07-16')
  })

  it('moves a fixed holiday that falls on Sunday to Monday', () => {
    // 21 Jun 2026 and 22 Jan 2023 are Sundays
    const andean = bolivianHolidays(2026).find((x) => x.name === 'Año Nuevo Andino Amazónico')
    expect(andean).toMatchObject({ date: '2026-06-22', observedFrom: '2026-06-21' })
    const plurinacional = bolivianHolidays(2023).find((x) => x.name === 'Día del Estado Plurinacional')
    expect(plurinacional).toMatchObject({ date: '2023-01-23', observedFrom: '2023-01-22' })
  })

  it('merges studio closures without duplicating a statutory day', () => {
    const list = holidaysBetween('2026-12-20', '2026-12-31', [
      { id: 'c1', date: new Date('2026-12-24T00:00:00Z'), name: 'Nochebuena' },
      { id: 'c2', date: '2026-12-25', name: 'Duplicado' },
    ])
    expect(list).toEqual([
      { date: '2026-12-24', name: 'Nochebuena', scope: 'STUDIO', id: 'c1' },
      { date: '2026-12-25', name: 'Navidad', scope: 'NATIONAL' },
    ])
  })

  it('spans multiple years', () => {
    const names = holidaysBetween('2026-12-20', '2027-01-05').map((h) => h.name)
    expect(names).toEqual(['Navidad', 'Año Nuevo'])
  })
})

describe('availability', () => {
  const holidays = new Set(['2026-11-02'])

  it('spreads weekly hours over five days and removes holidays and absences', () => {
    expect(weekAvailability('2026-11-02', 40, holidays)).toMatchObject({ holidayDays: 1, timeOffDays: 0, workingDays: 4, capacityHours: 32 })
    expect(weekAvailability('2026-11-02', 40, holidays, [{ start: '2026-11-05', end: '2026-11-10' }])).toMatchObject({
      holidayDays: 1,
      timeOffDays: 2,
      capacityHours: 16,
    })
  })

  it('does not double-count an absence that covers a holiday', () => {
    const a = weekAvailability('2026-11-02', 40, holidays, [{ start: '2026-11-01', end: '2026-11-03' }])
    expect(a).toMatchObject({ holidayDays: 1, timeOffDays: 1, capacityHours: 24 })
  })

  it('handles part-time contracts', () => {
    expect(weekAvailability('2026-11-09', 20, new Set()).capacityHours).toBe(20)
    expect(weekAvailability('2026-11-02', 20, holidays).capacityHours).toBe(16)
  })

  it('computes hours expected so far on working days only', () => {
    expect(expectedHoursToDate('2026-11-09', '2026-11-11', 40, new Set())).toBe(24)
    expect(expectedHoursToDate('2026-11-02', '2026-11-02', 40, holidays)).toBe(0)
    expect(expectedHoursToDate('2026-11-02', '2026-11-08', 40, holidays)).toBe(32) // full week incl. weekend
    expect(expectedHoursToDate('2026-11-09', '2026-11-11', 40, new Set(), [{ start: '2026-11-09', end: '2026-11-09' }])).toBe(16)
  })

  it('counts working days in a span', () => {
    expect(countWorkingDays('2026-10-30', '2026-11-06', holidays)).toBe(5) // Fri + Tue–Fri
  })
})
