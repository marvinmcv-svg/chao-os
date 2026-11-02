'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, FolderKanban, Briefcase, Receipt, Building2, CornerDownLeft, Plus, Clock } from 'lucide-react'
import { useUI } from '@/lib/stores/ui'
import { api, asList } from '@/lib/api-client'
import { NAV_ITEMS } from './nav'
import { cn, formatCompact } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface Item {
  id: string
  group: string
  label: string
  sub?: string
  icon: LucideIcon
  href: string
  search: string
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const ACTIONS: Item[] = [
  { id: 'a-lead', group: 'Acciones', label: 'Nuevo lead', icon: Plus, href: '/bd?new=1', search: 'nuevo lead crear oportunidad' },
  { id: 'a-project', group: 'Acciones', label: 'Nuevo proyecto', icon: Plus, href: '/projects?new=1', search: 'nuevo proyecto crear' },
  { id: 'a-invoice', group: 'Acciones', label: 'Nueva factura', icon: Plus, href: '/finance?new=1', search: 'nueva factura crear cobrar' },
  { id: 'a-time', group: 'Acciones', label: 'Registrar horas', icon: Clock, href: '/studio?log=1', search: 'registrar horas timesheet tiempo' },
]

export function CommandPalette() {
  const router = useRouter()
  const { paletteOpen, setPalette } = useUI()
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<Item[] | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!useUI.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette])

  // Load searchable records each time the palette opens (cheap, small studio datasets)
  useEffect(() => {
    if (!paletteOpen) return
    setQuery('')
    setActive(0)
    setTimeout(() => inputRef.current?.focus(), 10)
    let cancelled = false
    Promise.allSettled([
      api<unknown>('/api/projects?limit=200'),
      api<unknown>('/api/leads'),
      api<unknown>('/api/invoices'),
      api<unknown>('/api/clients'),
    ]).then(([p, l, i, c]) => {
      if (cancelled) return
      const items: Item[] = []
      if (p.status === 'fulfilled')
        for (const x of asList<any>(p.value, 'projects'))
          items.push({ id: 'p' + x.id, group: 'Proyectos', label: x.name, sub: `${x.code} · ${x.client?.company ?? ''}`, icon: FolderKanban, href: `/projects?id=${x.id}`, search: normalize(`${x.name} ${x.code} ${x.client?.company ?? ''}`) })
      if (l.status === 'fulfilled')
        for (const x of asList<any>(l.value))
          items.push({ id: 'l' + x.id, group: 'Leads', label: x.projectName, sub: `${x.company} · ${formatCompact(x.estimatedValueUSD)}`, icon: Briefcase, href: `/bd?lead=${x.id}`, search: normalize(`${x.projectName} ${x.company} ${x.contactName}`) })
      if (i.status === 'fulfilled')
        for (const x of asList<any>(i.value))
          items.push({ id: 'i' + x.id, group: 'Facturas', label: x.number, sub: `${x.project?.name ?? ''} · ${formatCompact(x.amountUSD)}`, icon: Receipt, href: `/finance?invoice=${x.id}`, search: normalize(`${x.number} ${x.project?.name ?? ''} ${x.client?.name ?? ''}`) })
      if (c.status === 'fulfilled')
        for (const x of asList<any>(c.value))
          items.push({ id: 'c' + x.id, group: 'Clientes', label: x.company, sub: x.name, icon: Building2, href: `/clients?id=${x.id}`, search: normalize(`${x.company} ${x.name} ${x.email}`) })
      setRecords(items)
    })
    return () => { cancelled = true }
  }, [paletteOpen])

  const results = useMemo(() => {
    const q = normalize(query.trim())
    const pages: Item[] = NAV_ITEMS.map((n) => ({ id: 'n' + n.href, group: 'Ir a', label: n.label, icon: n.icon, href: n.href, search: normalize(`${n.label} ${n.keywords ?? ''}`) }))
    const all = [...pages, ...ACTIONS, ...(records ?? [])]
    if (!q) return [...pages, ...ACTIONS]
    const terms = q.split(/\s+/)
    return all.filter((it) => terms.every((t) => it.search.includes(t) || normalize(it.label).includes(t))).slice(0, 40)
  }, [query, records])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!paletteOpen) return null

  function go(item: Item) {
    setPalette(false)
    router.push(item.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
    else if (e.key === 'Escape') setPalette(false)
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label="Buscar">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setPalette(false)} />
      <div className="relative w-full max-w-xl bg-g90 border border-g70 rounded-xl shadow-panel overflow-hidden animate-pop-in">
        <div className="flex items-center gap-3 px-4 border-b border-g80">
          <Search className="w-4 h-4 text-g40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar o saltar a…"
            className="flex-1 h-12 bg-transparent text-sm text-white placeholder:text-g50 focus:outline-none"
            aria-label="Buscar"
          />
          <kbd className="text-[10px] font-mono text-g40 border border-g70 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
          {query && records === null && <p className="px-4 py-3 text-xs text-g40 font-mono">Cargando registros…</p>}
          {results.length === 0 && records !== null && (
            <p className="px-4 py-8 text-center text-sm text-g40">Sin resultados para “{query}”</p>
          )}
          {results.map((it, idx) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.id}>
                {header && <p className="px-4 pt-2 pb-1 text-[10px] font-mono text-g50 uppercase tracking-[0.2em]">{header}</p>}
                <button
                  data-idx={idx}
                  onMouseMove={() => setActive(idx)}
                  onClick={() => go(it)}
                  className={cn('w-full flex items-center gap-3 px-4 py-2 text-left', idx === active ? 'bg-g80' : '')}
                >
                  <it.icon className={cn('w-4 h-4 flex-shrink-0', idx === active ? 'text-accent' : 'text-g40')} />
                  <span className="text-sm text-g10 truncate">{it.label}</span>
                  {it.sub && <span className="text-xs text-g40 truncate">{it.sub}</span>}
                  {idx === active && <CornerDownLeft className="w-3.5 h-3.5 text-g40 ml-auto flex-shrink-0" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
