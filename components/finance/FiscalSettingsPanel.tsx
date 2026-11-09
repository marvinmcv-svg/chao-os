'use client'

import { useEffect, useState } from 'react'
import { Landmark, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Panel } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'

type Account = { code: string; name: string }
interface Settings {
  nit: string
  razonSocial: string
  municipio: string
  direccion: string
  telefono: string
  actividadEconomica: string
  codigoProductoSin: string
  sucursal: number
  puntoVenta: number
  modalidad: 1 | 2
  ambiente: 1 | 2
  leyenda: string
  exchangeRate: number
  nextFiscalNumber: number
  accounts: Record<string, Account>
}
interface View {
  settings: Settings
  missing: string[]
  siatConnected: boolean
  canEdit: boolean
}

const ACCOUNT_LABELS: Record<string, string> = {
  clientes: 'Cuentas por cobrar',
  bancos: 'Bancos',
  ingresos: 'Ingresos por servicios',
  ivaDebito: 'Débito fiscal IVA',
  itPorPagar: 'IT por pagar',
  gastoIt: 'Gasto IT',
}

/** Settings → Datos fiscales (SIN). PRINCIPAL / ADMIN can edit. */
export function FiscalSettingsPanel() {
  const [view, setView] = useState<View | null>(null)
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api<View>('/api/settings/fiscal')
      .then((v) => {
        setView(v)
        setForm(v.settings)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos fiscales'))
  }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSaved(false)
    setForm((f) => (f ? { ...f, [k]: v } : f))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const { nextFiscalNumber: _n, ...rest } = form
      const v = await api<View>('/api/settings/fiscal', { method: 'PUT', body: JSON.stringify({ ...rest, exchangeRate: Number(form.exchangeRate) }) })
      setView(v)
      setForm(v.settings)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const ro = !view?.canEdit
  return (
    <Panel title="Datos fiscales (SIN)" action={<Landmark className="w-4 h-4 text-g50" />} bodyClassName="p-5">
      <div id="fiscal" className="scroll-mt-24" />
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {!form || !view ? (
        <Skeleton className="h-64" />
      ) : (
        <form onSubmit={save} className="space-y-5">
          {view.missing.length > 0 ? (
            <p className="flex gap-2 text-xs text-yellow-200/90 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Para emitir facturas fiscales falta: {view.missing.join(', ')}.
            </p>
          ) : (
            <p className="flex gap-2 text-xs text-green-300 items-center">
              <CheckCircle2 className="w-4 h-4" /> Listo para emitir · próxima factura N° {form.nextFiscalNumber}
            </p>
          )}
          <fieldset disabled={ro} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="NIT del estudio" inputMode="numeric" value={form.nit} onChange={(e) => set('nit', e.target.value.trim())} placeholder="1234567019" />
              <div className="sm:col-span-2">
                <Input label="Razón social" value={form.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Municipio" value={form.municipio} onChange={(e) => set('municipio', e.target.value)} />
              <Input label="Dirección" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Av. … N° …, Zona …" />
              <Input label="Teléfono" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Input label="Actividad (CAEB)" inputMode="numeric" value={form.actividadEconomica} onChange={(e) => set('actividadEconomica', e.target.value.trim())} hint="Según tu NIT" />
              <Input label="Código producto SIN" inputMode="numeric" value={form.codigoProductoSin} onChange={(e) => set('codigoProductoSin', e.target.value.trim())} hint="Catálogo SIN" />
              <Input label="Sucursal" type="number" min={0} value={form.sucursal} onChange={(e) => set('sucursal', Number(e.target.value) || 0)} hint="0 = casa matriz" />
              <Input label="Punto de venta" type="number" min={0} value={form.puntoVenta} onChange={(e) => set('puntoVenta', Number(e.target.value) || 0)} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Select label="Modalidad" value={String(form.modalidad)} onChange={(e) => set('modalidad', Number(e.target.value) as 1 | 2)} options={[{ value: '2', label: 'Computarizada en línea' }, { value: '1', label: 'Electrónica en línea' }]} />
              <Select label="Ambiente" value={String(form.ambiente)} onChange={(e) => set('ambiente', Number(e.target.value) as 1 | 2)} options={[{ value: '2', label: 'Pruebas (piloto)' }, { value: '1', label: 'Producción' }]} />
              <Input label="Tipo de cambio (Bs/USD)" type="number" step="0.01" min={0.01} value={form.exchangeRate} onChange={(e) => set('exchangeRate', e.target.value as unknown as number)} hint="Por defecto en facturas nuevas" />
            </div>
            <Input label="Leyenda (Ley 453)" value={form.leyenda} onChange={(e) => set('leyenda', e.target.value)} hint="Del catálogo de leyendas del SIN para tu actividad" />

            <details className="rounded-lg border border-g80">
              <summary className="px-4 py-3 text-sm text-g20 cursor-pointer">Plan de cuentas para el libro diario</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 pt-1">
                {Object.entries(ACCOUNT_LABELS).map(([k, label]) => (
                  <div key={k} className="grid grid-cols-[110px_1fr] gap-2 items-end">
                    <Input label={label} value={form.accounts[k]?.code ?? ''} onChange={(e) => set('accounts', { ...form.accounts, [k]: { ...form.accounts[k], code: e.target.value } })} />
                    <Input aria-label={`${label} — nombre`} value={form.accounts[k]?.name ?? ''} onChange={(e) => set('accounts', { ...form.accounts, [k]: { ...form.accounts[k], name: e.target.value } })} />
                  </div>
                ))}
              </div>
            </details>
          </fieldset>
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs text-g50">
              {view.siatConnected
                ? 'SIAT: credenciales presentes.'
                : 'SIAT no conectado: las facturas se emiten fuera de línea y quedan pendientes de validación del SIN.'}
              {ro && ' Solo socios y administración pueden editar.'}
            </p>
            {!ro && (
              <div className="flex items-center gap-3">
                {saved && <span className="text-xs text-green-300">Guardado</span>}
                <Button type="submit" size="sm" loading={saving}>Guardar datos fiscales</Button>
              </div>
            )}
          </div>
        </form>
      )}
    </Panel>
  )
}
