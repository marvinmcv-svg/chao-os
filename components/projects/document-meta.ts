import type { BadgeVariant } from '@/components/ui/Badge'

export const DOCUMENT_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'En revisión', variant: 'yellow' },
  APPROVED: { label: 'Aprobado', variant: 'green' },
  REJECTED: { label: 'Rechazado', variant: 'red' },
}
