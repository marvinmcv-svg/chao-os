import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  Receipt,
  Users,
  Building2,
  Sparkles,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  keywords?: string
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operación',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, keywords: 'inicio resumen kpi' },
      { href: '/projects', label: 'Proyectos', icon: FolderKanban, keywords: 'fases cronograma gantt documentos' },
      { href: '/studio', label: 'Estudio', icon: Users, keywords: 'equipo capacidad horas timesheet' },
    ],
  },
  {
    label: 'Negocio',
    items: [
      { href: '/bd', label: 'Business Dev', icon: Briefcase, keywords: 'leads pipeline oportunidades ventas' },
      { href: '/clients', label: 'Clientes', icon: Building2, keywords: 'portal contactos' },
      { href: '/finance', label: 'Finanzas', icon: Receipt, keywords: 'facturas pagos flujo caja p&l' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/ai', label: 'Asistente IA', icon: Sparkles, keywords: 'alertas forecast chat' },
      { href: '/settings', label: 'Configuración', icon: Settings, keywords: 'perfil equipo ajustes' },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)
