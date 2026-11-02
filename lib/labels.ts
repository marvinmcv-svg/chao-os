/**
 * Single source of truth for user-facing (Spanish) labels and status tones.
 * Previously each page kept its own copy (and several showed raw enum
 * values such as "PAID" or "IN_PROGRESS" to users).
 */
import type { BadgeVariant } from '@/components/ui/Badge'

type Meta = { label: string; variant: BadgeVariant }

export const PROJECT_STATUS: Record<string, Meta> = {
  ON_TRACK: { label: 'En curso', variant: 'green' },
  AT_RISK: { label: 'En riesgo', variant: 'yellow' },
  OVER_BUDGET: { label: 'Sobre presupuesto', variant: 'red' },
  CLOSING: { label: 'Cierre', variant: 'blue' },
  COMPLETED: { label: 'Completado', variant: 'default' },
}

export const PHASE: Record<string, { short: string; label: string }> = {
  SD: { short: 'EP', label: 'Esquema preliminar' },
  DD: { short: 'DD', label: 'Desarrollo de diseño' },
  CD: { short: 'DC', label: 'Documentos de construcción' },
  CA: { short: 'AO', label: 'Administración de obra' },
}

export const PHASE_STATUS: Record<string, Meta> = {
  NOT_STARTED: { label: 'No iniciada', variant: 'default' },
  IN_PROGRESS: { label: 'En progreso', variant: 'blue' },
  COMPLETE: { label: 'Completa', variant: 'green' },
}

export const INVOICE_STATUS: Record<string, Meta> = {
  DRAFT: { label: 'Borrador', variant: 'default' },
  SENT: { label: 'Enviada', variant: 'blue' },
  PENDING: { label: 'Pendiente', variant: 'yellow' },
  OVERDUE: { label: 'Vencida', variant: 'red' },
  PAID: { label: 'Pagada', variant: 'green' },
}

export const PIPELINE_STAGE: Record<string, Meta & { probability: number }> = {
  PROSPECT: { label: 'Prospecto', variant: 'default', probability: 10 },
  QUALIFIED: { label: 'Calificado', variant: 'blue', probability: 30 },
  PROPOSAL: { label: 'Propuesta', variant: 'yellow', probability: 50 },
  NEGOTIATION: { label: 'Negociación', variant: 'yellow', probability: 75 },
  WON: { label: 'Ganado', variant: 'green', probability: 100 },
  LOST: { label: 'Perdido', variant: 'red', probability: 0 },
}

export const TASK_STATUS: Record<string, Meta> = {
  TODO: { label: 'Por hacer', variant: 'default' },
  IN_PROGRESS: { label: 'En curso', variant: 'blue' },
  REVIEW: { label: 'Revisión', variant: 'yellow' },
  DONE: { label: 'Hecha', variant: 'green' },
}

export const PROJECT_TYPE: Record<string, string> = {
  RESIDENTIAL: 'Residencial',
  COMMERCIAL: 'Comercial',
  INDUSTRIAL: 'Industrial',
  INSTITUTIONAL: 'Institucional',
  MIXED: 'Uso mixto',
}

export const CONTRACT_TYPE: Record<string, string> = {
  FIXED_FEE: 'Honorario fijo',
  PERCENTAGE: '% de obra',
  TIME_AND_MATERIALS: 'Tiempo y materiales',
}

export const SOURCE_TYPE: Record<string, string> = {
  REFERRAL: 'Recomendación',
  DIRECT: 'Contacto directo',
  ONLINE: 'Online',
  NETWORK: 'Red de contactos',
}

export const USER_ROLE: Record<string, string> = {
  PRINCIPAL: 'Socio principal',
  ARCHITECT_SENIOR: 'Arquitecto senior',
  ARCHITECT: 'Arquitecto',
  BIM: 'BIM',
  ADMIN: 'Administración',
}

export function meta(map: Record<string, Meta>, key: string | null | undefined): Meta {
  return (key && map[key]) || { label: key ?? '—', variant: 'default' }
}

export function utilizationVariant(pct: number): 'green' | 'yellow' | 'red' | 'blue' {
  if (pct >= 100) return 'red'
  if (pct >= 85) return 'yellow'
  if (pct >= 50) return 'green'
  return 'blue'
}
