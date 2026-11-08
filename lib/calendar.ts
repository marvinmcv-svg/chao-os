/**
 * Working-calendar engine for capacity planning.
 *
 * All calendar maths runs on UTC "day keys" (`YYYY-MM-DD`). Dates are
 * stored as instants (time entries at 12:00 UTC, time-off / allocations
 * at 00:00 UTC), so reading their UTC calendar day is stable. "Today" is
 * the only thing that depends on a wall clock, and it is taken in the
 * studio's zone (America/La_Paz).
 *
 * Holidays: Bolivian national holidays (fixed + Easter-based movable
 * feasts), the Santa Cruz departmental holiday, and studio closures that
 * admins add in the database. Under DS 1210 a fixed-date national holiday
 * that falls on a Sunday is observed on the following Monday.
 */

export const STUDIO_TZ = 'America/La_Paz'
const DAY_MS = 86_400_000

export type DayKey = string // YYYY-MM-DD

export interface HolidayInfo {
  date: DayKey
  name: string
  scope: 'NATIONAL' | 'DEPARTMENTAL' | 'STUDIO'
  /** Present when the holiday was moved from a Sunday. */
  observedFrom?: DayKey
  id?: string
}

// ─── Day keys ──────────────────────────────────────────────────────────────

export function dayKey(d: Date): DayKey {
  return d.toISOString().slice(0, 10)
}

export function parseDay(key: DayKey): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error(`Invalid day key: ${key}`)
  return new Date(`${key}T00:00:00.000Z`)
}

export function addDays(key: DayKey, n: number): DayKey {
  return dayKey(new Date(parseDay(key).getTime() + n * DAY_MS))
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: DayKey): number {
  return parseDay(key).getUTCDay()
}

export function isWeekend(key: DayKey): boolean {
  const w = weekday(key)
  return w === 0 || w === 6
}

/** Monday of the week containing `key`. */
export function mondayOf(key: DayKey): DayKey {
  const w = weekday(key)
  return addDays(key, w === 0 ? -6 : 1 - w)
}

/** Today's calendar day in the studio's time zone. */
export function todayKey(now: Date = new Date()): DayKey {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: STUDIO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function daysBetween(fromKey: DayKey, toKey: DayKey): number {
  return Math.round((parseDay(toKey).getTime() - parseDay(fromKey).getTime()) / DAY_MS)
}

/** Inclusive list of day keys. */
export function eachDay(fromKey: DayKey, toKey: DayKey): DayKey[] {
  const out: DayKey[] = []
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) out.push(k)
  return out
}

/** Monday-start week keys: `count` weeks beginning at the week of `fromKey`. */
export function weekStarts(fromKey: DayKey, count: number): DayKey[] {
  const first = mondayOf(fromKey)
  return Array.from({ length: count }, (_, i) => addDays(first, i * 7))
}

// ─── Holidays ──────────────────────────────────────────────────────────────

/** Gregorian Easter Sunday (anonymous / Meeus–Jones–Butcher algorithm). */
export function easterSunday(year: number): DayKey {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const FIXED_NATIONAL: [string, string][] = [
  ['01-01', 'Año Nuevo'],
  ['01-22', 'Día del Estado Plurinacional'],
  ['05-01', 'Día del Trabajo'],
  ['06-21', 'Año Nuevo Andino Amazónico'],
  ['08-06', 'Día de la Independencia'],
  ['11-02', 'Todos Santos'],
  ['12-25', 'Navidad'],
]

/** Departmental holidays keyed by department code. */
const DEPARTMENTAL: Record<string, [string, string][]> = {
  SCZ: [['09-24', 'Aniversario de Santa Cruz']],
  LPZ: [['07-16', 'Aniversario de La Paz']],
  CBA: [['09-14', 'Aniversario de Cochabamba']],
}

export function bolivianHolidays(year: number, department: string | null = 'SCZ'): HolidayInfo[] {
  const out: HolidayInfo[] = []
  const pushFixed = (md: string, name: string, scope: HolidayInfo['scope']) => {
    const actual = `${year}-${md}`
    if (weekday(actual) === 0) out.push({ date: addDays(actual, 1), name, scope, observedFrom: actual })
    else out.push({ date: actual, name, scope })
  }
  for (const [md, name] of FIXED_NATIONAL) pushFixed(md, name, 'NATIONAL')
  for (const [md, name] of (department && DEPARTMENTAL[department]) || []) pushFixed(md, name, 'DEPARTMENTAL')

  const easter = easterSunday(year)
  out.push({ date: addDays(easter, -48), name: 'Carnaval (lunes)', scope: 'NATIONAL' })
  out.push({ date: addDays(easter, -47), name: 'Carnaval (martes)', scope: 'NATIONAL' })
  out.push({ date: addDays(easter, -2), name: 'Viernes Santo', scope: 'NATIONAL' })
  out.push({ date: addDays(easter, 60), name: 'Corpus Christi', scope: 'NATIONAL' })

  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Statutory + studio holidays falling in [fromKey, toKey], one entry per day. */
export function holidaysBetween(
  fromKey: DayKey,
  toKey: DayKey,
  studioClosures: { id?: string; date: Date | DayKey; name: string }[] = [],
  department: string | null = 'SCZ',
): HolidayInfo[] {
  const byDay = new Map<DayKey, HolidayInfo>()
  const y0 = Number(fromKey.slice(0, 4))
  const y1 = Number(toKey.slice(0, 4))
  for (let y = y0; y <= y1; y++) {
    for (const h of bolivianHolidays(y, department)) {
      if (h.date >= fromKey && h.date <= toKey && !byDay.has(h.date)) byDay.set(h.date, h)
    }
  }
  for (const c of studioClosures) {
    const k = typeof c.date === 'string' ? c.date : dayKey(c.date)
    if (k >= fromKey && k <= toKey && !byDay.has(k)) byDay.set(k, { date: k, name: c.name, scope: 'STUDIO', id: c.id })
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Availability ──────────────────────────────────────────────────────────

export interface AbsenceSpan {
  start: Date | DayKey
  end: Date | DayKey
}

export interface WeekAvailability {
  weekStart: DayKey
  baseHours: number
  /** Weekdays that are holidays. */
  holidayDays: number
  /** Weekdays off due to approved absences (not double-counted with holidays). */
  timeOffDays: number
  workingDays: number
  capacityHours: number
}

const asKey = (d: Date | DayKey) => (typeof d === 'string' ? d : dayKey(d))

/**
 * Capacity for one person for one week. Weekly hours are spread evenly
 * over Monday–Friday; each holiday or absence weekday removes one day.
 */
export function weekAvailability(
  weekStart: DayKey,
  weeklyHours: number,
  holidayKeys: Set<DayKey>,
  absences: AbsenceSpan[] = [],
): WeekAvailability {
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  let holidayDays = 0
  let timeOffDays = 0
  for (const d of days) {
    if (holidayKeys.has(d)) { holidayDays++; continue }
    if (absences.some((a) => asKey(a.start) <= d && d <= asKey(a.end))) timeOffDays++
  }
  const workingDays = 5 - holidayDays - timeOffDays
  return {
    weekStart,
    baseHours: weeklyHours,
    holidayDays,
    timeOffDays,
    workingDays,
    capacityHours: round1((weeklyHours / 5) * workingDays),
  }
}

/**
 * Hours a person was expected to have worked from Monday through
 * `todayK` (inclusive), honouring holidays and absences. Used for the
 * "pace" metric so a holiday Monday does not make everyone look behind.
 */
export function expectedHoursToDate(
  weekStart: DayKey,
  todayK: DayKey,
  weeklyHours: number,
  holidayKeys: Set<DayKey>,
  absences: AbsenceSpan[] = [],
): number {
  let days = 0
  for (let i = 0; i < 5; i++) {
    const d = addDays(weekStart, i)
    if (d > todayK) break
    if (holidayKeys.has(d)) continue
    if (absences.some((a) => asKey(a.start) <= d && d <= asKey(a.end))) continue
    days++
  }
  return round1((weeklyHours / 5) * days)
}

/** Weekdays in an inclusive span that are neither weekend nor holiday. */
export function countWorkingDays(fromKey: DayKey, toKey: DayKey, holidayKeys: Set<DayKey>): number {
  return eachDay(fromKey, toKey).filter((d) => !isWeekend(d) && !holidayKeys.has(d)).length
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
