'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Building2, Copy, Check, Globe, Link2, Plus, Search, ShieldOff, ArrowUpRight, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { api } from '@/lib/api-client'
import { PROJECT_STATUS, meta } from '@/lib/labels'
import { formatCompact, formatDate, getRelativeTime } from '@/lib/utils'
import { ClientFiscalCard } from '@/components/finance/ClientFiscalCard'

interface Client {
  id: string
  name: string
  company: string
  email: string
  phone: string
  type: 'ACTIVE' | 'PROSPECT' | 'PAST'
  notes: string
  portalAccessEnabled: boolean
  portalLastLogin: string | null
  createdAt: string
  projects: { id: string; code: string; name: string; status: string; overallProgressPercent: number; totalBudgetUSD: number }[]
  billingName: string
  docType: 'CI' | 'CEX' | 'PAS' | 'OD' | 'NIT'
  docNumber: string
  docComplement: string
  billedUSD: number
  paidUSD: number
  outstandingUSD: number
}

const TYPE_META = {
  ACTIVE: { label: 'Activo', variant: 'green' as const },
  PROSPECT: { label: 'Prospecto', variant: 'blue' as const },
  PAST: { label: 'Anterior', variant: 'default' as const },
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      className="p-1.5 rounded text-g40 hover:text-white hover:bg-g80"
      aria-label="Copiar enlace"
    >
      {done ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function ClientsInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [clients, setClients] = useState<Client[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [links, setLinks] = useState<{ projectId: string; code: string; name: string; url: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ company: '', name: '', email: '', phone: '', type: 'PROSPECT', notes: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const id = params.get('id')
    if (id) setSelectedId(id)
  }, [params])

  const load = useCallback(async () => {
    setError(null)
    try {
      setClients(await api<Client[]>('/api/clients'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes')
      setClients([])
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setLinks(null); setPanelError(null) }, [selectedId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (clients ?? []).filter((c) => !q || c.company.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
  }, [clients, search])

  const selected = clients?.find((c) => c.id === selectedId) ?? null
  const totals = useMemo(() => {
    const l = clients ?? []
    return {
      active: l.filter((c) => c.projects.some((p) => p.status !== 'COMPLETED')).length,
      billed: l.reduce((s, c) => s + c.billedUSD, 0),
      outstanding: l.reduce((s, c) => s + c.outstandingUSD, 0),
      portal: l.filter((c) => c.portalAccessEnabled).length,
    }
  }, [clients])

  async function generateLinks() {
    if (!selected) return
    setBusy(true)
    setPanelError(null)
    try {
      const d = await api<{ links: typeof links }>(`/api/clients/${selected.id}/portal`, { method: 'POST' })
      setLinks(d.links)
      load()
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'No se pudo generar el enlace')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    if (!selected || !confirm(`¿Revocar el acceso al portal de ${selected.company}? Los enlaces actuales dejarán de funcionar.`)) return
    setBusy(true)
    setPanelError(null)
    try {
      await api(`/api/clients/${selected.id}/portal`, { method: 'DELETE' })
      setLinks(null)
      load()
    } catch (e) {
      setPanelError(e instanceof Error ? e.message : 'No se pudo revocar')
    } finally {
      setBusy(false)
    }
  }

  async function createClient(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setPanelError(null)
    try {
      const c = await api<{ id: string }>('/api/clients', { method: 'POST', body: JSON.stringify(form) })
      setShowNew(false)
      setForm({ company: '', name: '', email: '', phone: '', type: 'PROSPECT', notes: '' })
      await load()
      setSelectedId(c.id)
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'No se pudo crear el cliente')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        subtitle="Relación comercial, facturación y acceso al portal del cliente"
        actions={<Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> Nuevo cliente</Button>}
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {!clients ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)
        ) : (
          <>
            <StatCard label="Clientes" icon={Building2} value={clients.length} hint={`${totals.active} con proyectos en curso`} />
            <StatCard label="Facturado histórico" value={formatCompact(totals.billed)} />
            <StatCard label="Saldo por cobrar" value={formatCompact(totals.outstanding)} tone={totals.outstanding > 0 ? 'yellow' : 'default'} />
            <StatCard label="Con acceso al portal" icon={Globe} value={totals.portal} hint="Enlaces seguros por cliente" />
          </>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g50" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar empresa, contacto o email…"
          className="w-full h-9 pl-9 pr-3 bg-g90 border border-g80 rounded-md text-sm text-g10 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-accent/60"
        />
      </div>

      <div className="bg-g85 border border-g80 rounded-lg overflow-hidden">
        {!clients ? (
          <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Building2} title="Sin clientes" />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Proyectos</TableHead>
                <TableHead className="text-right">Facturado</TableHead>
                <TableHead className="text-right hidden md:table-cell">Por cobrar</TableHead>
                <TableHead className="text-right">Portal</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const t = TYPE_META[c.type] ?? TYPE_META.PROSPECT
                return (
                  <TableRow key={c.id} onClick={() => setSelectedId(c.id)}>
                    <TableCell>
                      <p className="text-g10">{c.company}</p>
                      <p className="text-xs text-g40">{c.name}</p>
                    </TableCell>
                    <TableCell><Badge variant={t.variant}>{t.label}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {c.projects.slice(0, 3).map((p) => <span key={p.id} className="text-2xs font-mono text-g30 bg-g80 px-1.5 py-0.5 rounded">{p.code}</span>)}
                        {c.projects.length === 0 && <span className="text-xs text-g50">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-g10">{formatCompact(c.billedUSD)}</TableCell>
                    <TableCell className="text-right hidden md:table-cell font-mono tabular">
                      <span className={c.outstandingUSD > 0 ? 'text-yellow-300' : 'text-g50'}>{c.outstandingUSD > 0 ? formatCompact(c.outstandingUSD) : '—'}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.portalAccessEnabled ? <Badge variant="green" dot>Activo</Badge> : <Badge variant="outline">Sin acceso</Badge>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Drawer
        open={!!selected}
        onClose={() => {
          setSelectedId(null)
          if (params.get('id')) router.replace('/clients')
        }}
        eyebrow={selected ? `Cliente desde ${formatDate(selected.createdAt)}` : ''}
        title={selected?.company}
      >
        {selected && (
          <div className="p-6 space-y-6">
            {panelError && <ErrorBanner message={panelError} />}

            <div className="rounded-lg border border-g80 bg-g85 p-4 space-y-2">
              <p className="text-sm text-white">{selected.name}</p>
              <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-xs text-g30 hover:text-white"><Mail className="w-3.5 h-3.5" />{selected.email}</a>
              {selected.phone && <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-xs text-g30 hover:text-white"><Phone className="w-3.5 h-3.5" />{selected.phone}</a>}
              {selected.notes && <p className="text-xs text-g40 pt-2 border-t border-g80 whitespace-pre-wrap">{selected.notes}</p>}
            </div>

            <ClientFiscalCard client={selected} onSaved={load} />

            <div className="grid grid-cols-3 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden">
              {[
                { l: 'Facturado', v: selected.billedUSD },
                { l: 'Cobrado', v: selected.paidUSD },
                { l: 'Por cobrar', v: selected.outstandingUSD },
              ].map((k) => (
                <div key={k.l} className="bg-g85 p-3">
                  <p className="text-2xs font-mono text-g40 uppercase">{k.l}</p>
                  <p className="font-display text-xl text-white tabular mt-0.5">{formatCompact(k.v)}</p>
                </div>
              ))}
            </div>

            <section>
              <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] mb-2">Proyectos ({selected.projects.length})</h3>
              {selected.projects.length === 0 ? (
                <p className="text-sm text-g40">Sin proyectos todavía.</p>
              ) : (
                <div className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
                  {selected.projects.map((p) => {
                    const st = meta(PROJECT_STATUS, p.status)
                    return (
                      <Link key={p.id} href={`/projects?id=${p.id}`} className="block px-4 py-3 bg-g85 hover:bg-g80/60">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-2xs font-mono text-g40">{p.code}</p>
                            <p className="text-sm text-g10 truncate">{p.name}</p>
                          </div>
                          <Badge variant={st.variant} dot>{st.label}</Badge>
                        </div>
                        <ProgressBar className="mt-2" value={p.overallProgressPercent} showLabel />
                      </Link>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-g80 bg-g85 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm text-white flex items-center gap-2"><Globe className="w-4 h-4 text-accent" /> Portal del cliente</h3>
                  <p className="text-xs text-g40 mt-1">
                    {selected.portalAccessEnabled
                      ? selected.portalLastLogin
                        ? `Activo · último acceso ${getRelativeTime(selected.portalLastLogin).toLowerCase()}`
                        : 'Activo · aún no ha ingresado'
                      : 'El cliente no tiene acceso. Genera un enlace seguro para compartir avance, hitos, documentos aprobados y facturas.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" onClick={generateLinks} loading={busy} disabled={selected.projects.length === 0}>
                  <Link2 className="w-4 h-4" /> {selected.portalAccessEnabled ? 'Generar nuevo enlace' : 'Habilitar y generar enlace'}
                </Button>
                {selected.portalAccessEnabled && (
                  <Button size="sm" variant="danger" onClick={revoke} disabled={busy}>
                    <ShieldOff className="w-4 h-4" /> Revocar
                  </Button>
                )}
              </div>
              {selected.portalAccessEnabled && !links && (
                <p className="text-2xs text-g50 mt-2">Por seguridad solo guardamos un hash del enlace: generar uno nuevo invalida el anterior.</p>
              )}
              {links && (
                <div className="mt-4 space-y-2 animate-pop-in">
                  <p className="text-2xs font-mono text-yellow-300">Copia los enlaces ahora — no se volverán a mostrar.</p>
                  {links.map((l) => (
                    <div key={l.projectId} className="flex items-center gap-2 rounded-md border border-g70 bg-g95 pl-3 pr-1 py-1">
                      <span className="text-2xs font-mono text-g40 flex-shrink-0">{l.code}</span>
                      <span className="text-xs text-g20 truncate flex-1 font-mono">{l.url}</span>
                      <CopyButton text={l.url} />
                      <a href={l.url} target="_blank" rel="noreferrer" className="p-1.5 rounded text-g40 hover:text-white hover:bg-g80" aria-label="Abrir portal">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Nuevo cliente">
        <form onSubmit={createClient} className="space-y-4">
          {panelError && <ErrorBanner message={panelError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
            <Input label="Contacto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+591 …" />
          </div>
          <Select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={Object.entries(TYPE_META).map(([value, m]) => ({ value, label: m.label }))} />
          <Textarea label="Notas" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-4 border-t border-g80">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button type="submit" loading={creating}>Crear cliente</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsInner />
    </Suspense>
  )
}
