'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { CheckCircle2, CircleDashed, KeyRound, Users, Building, Plug } from 'lucide-react'
import { Panel } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { api } from '@/lib/api-client'
import { USER_ROLE } from '@/lib/labels'

interface Member {
  id: string
  role: string
  weeklyHoursCapacity: number
  hourlyRate: number | null
  user: { id: string; name: string; email: string; avatarInitials: string; role: string }
}

interface Status {
  ai: boolean
  email: boolean
  storage: boolean
  portalUrl: string | null
  defaultHourlyRate: number
  timezone: string
  baseCurrency: string
  secondaryCurrency: string
}

function Integration({ ok, name, desc, env }: { ok: boolean; name: string; desc: string; env: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      {ok ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" /> : <CircleDashed className="w-4 h-4 text-g50 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm text-g10">{name}</p>
          <Badge variant={ok ? 'green' : 'outline'}>{ok ? 'Conectado' : 'No configurado'}</Badge>
        </div>
        <p className="text-xs text-g40 mt-0.5">{desc}</p>
        {!ok && <p className="text-2xs font-mono text-g50 mt-1">Variable: {env}</p>}
      </div>
    </div>
  )
}

function MemberRow({ m, canEdit, onSaved }: { m: Member; canEdit: boolean; onSaved: () => void }) {
  const [cap, setCap] = useState(String(m.weeklyHoursCapacity))
  const [rate, setRate] = useState(m.hourlyRate != null ? String(m.hourlyRate) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dirty = cap !== String(m.weeklyHoursCapacity) || rate !== (m.hourlyRate != null ? String(m.hourlyRate) : '')

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      await api(`/api/team/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          weeklyHoursCapacity: Number(cap),
          ...(rate ? { hourlyRate: Number(rate) } : {}),
        }),
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-20 h-8 px-2 text-right text-sm font-mono bg-g95 border border-g70 rounded text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60 tabular'
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar initials={m.user.avatarInitials} />
          <div className="min-w-0">
            <p className="text-sm text-white truncate">{m.user.name}</p>
            <p className="text-xs text-g40 truncate">{m.user.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <p className="text-sm text-g20">{m.role}</p>
        <p className="text-2xs font-mono text-g40">{USER_ROLE[m.user.role] ?? m.user.role}</p>
      </TableCell>
      <TableCell className="text-right">
        <input aria-label="Capacidad semanal" type="number" min={1} max={80} value={cap} disabled={!canEdit} onChange={(e) => setCap(e.target.value)} className={field} />
        <span className="text-2xs text-g40 ml-1">h</span>
      </TableCell>
      <TableCell className="text-right">
        <span className="text-2xs text-g40 mr-1">$</span>
        <input aria-label="Costo por hora" type="number" min={1} step="0.5" value={rate} placeholder="—" disabled={!canEdit} onChange={(e) => setRate(e.target.value)} className={field} />
      </TableCell>
      <TableCell className="text-right w-28">
        {canEdit && dirty && <Button size="sm" onClick={save} loading={saving}>Guardar</Button>}
        {err && <p className="text-2xs text-red-300">{err}</p>}
      </TableCell>
    </TableRow>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [team, setTeam] = useState<Member[] | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [pwState, setPwState] = useState<{ busy: boolean; error: string | null; ok: boolean }>({ busy: false, error: null, ok: false })
  const user = session?.user
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PRINCIPAL'

  const load = useCallback(() => {
    api<Member[]>('/api/team').then(setTeam).catch(() => setTeam([]))
    api<Status>('/api/settings/status').then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(load, [load])

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pw.newPassword !== pw.confirm) return setPwState({ busy: false, error: 'Las contraseñas no coinciden', ok: false })
    setPwState({ busy: true, error: null, ok: false })
    try {
      await api('/api/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }) })
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      setPwState({ busy: false, error: null, ok: true })
    } catch (err) {
      setPwState({ busy: false, error: err instanceof Error ? err.message : 'Error', ok: false })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" subtitle="Perfil, equipo, parámetros del estudio e integraciones" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Mi perfil" bodyClassName="p-5">
          <div className="flex items-center gap-4">
            <Avatar initials={user?.avatarInitials ?? '··'} size="lg" />
            <div className="min-w-0">
              <p className="text-white">{user?.name}</p>
              <p className="text-xs text-g40 truncate">{user?.email}</p>
              <Badge variant="outline" className="mt-1.5">{(user?.role && USER_ROLE[user.role]) || '—'}</Badge>
            </div>
          </div>

          <form onSubmit={changePassword} className="mt-6 pt-5 border-t border-g80 space-y-3">
            <p className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2"><KeyRound className="w-3.5 h-3.5" /> Cambiar contraseña</p>
            {pwState.error && <ErrorBanner message={pwState.error} />}
            {pwState.ok && <p className="text-xs text-green-300">Contraseña actualizada.</p>}
            <Input label="Actual" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
            <Input label="Nueva" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} hint="Mínimo 10 caracteres, con letras y números" required />
            <Input label="Confirmar" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
            <Button type="submit" size="sm" loading={pwState.busy}>Actualizar contraseña</Button>
          </form>
        </Panel>

        <Panel title="Estudio" className="xl:col-span-2" action={<Building className="w-4 h-4 text-g50" />} bodyClassName="p-5">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {[
              ['Razón social', 'CHAO Arquitectura S.R.L.'],
              ['Ubicación', 'Santa Cruz de la Sierra, Bolivia'],
              ['Zona horaria', status?.timezone ?? 'America/La_Paz'],
              ['Monedas', status ? `${status.baseCurrency} (base) · ${status.secondaryCurrency}` : 'USD · BOB'],
              ['Costo hora por defecto', status ? `$${status.defaultHourlyRate} / h (si el miembro no tiene tarifa propia)` : '—'],
              ['Reparto de honorario por fase', 'EP 15% · DD 25% · DC 40% · AO 20%'],
              ['Umbral Go / No-Go', '≥ 70 avanzar · 50–69 revisar · < 50 no avanzar'],
              ['URL del portal', status?.portalUrl ?? 'Mismo dominio de la app'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-2xs font-mono text-g40 uppercase tracking-wider">{k}</dt>
                <dd className="text-sm text-g10 mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel title="Equipo y capacidad" action={<Users className="w-4 h-4 text-g50" />}>
        {!team ? (
          <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Miembro</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Capacidad semanal</TableHead>
                  <TableHead className="text-right">Costo / hora</TableHead>
                  <TableHead />
                </tr>
              </TableHeader>
              <TableBody>
                {team.map((m) => <MemberRow key={m.id} m={m} canEdit={!!canEdit} onSaved={load} />)}
              </TableBody>
            </Table>
            <p className="px-5 py-3 text-2xs text-g50 border-t border-g80">
              La capacidad alimenta la utilización y el mapa de carga; el costo por hora alimenta la rentabilidad (P&L) de cada proyecto.
              {!canEdit && ' Solo socios y administración pueden editar.'}
            </p>
          </>
        )}
      </Panel>

      <Panel title="Integraciones" action={<Plug className="w-4 h-4 text-g50" />}>
        {!status ? (
          <div className="p-5"><Skeleton className="h-24" /></div>
        ) : (
          <div className="divide-y divide-g80">
            <Integration ok={status.ai} name="Claude (Anthropic)" env="ANTHROPIC_API_KEY" desc="Chat con datos del estudio, scoring Go/No-Go y redacción de alertas. Sin clave, alertas y scoring usan reglas determinísticas." />
            <Integration ok={status.email} name="Email (Resend)" env="RESEND_API_KEY" desc="Envío de facturas, avisos de pago y actualizaciones de fase al cliente." />
            <Integration ok={status.storage} name="Almacenamiento (S3 / R2)" env="AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY · DOCUMENTS_S3_BUCKET" desc="Carga y descarga de planos y documentos de proyecto." />
          </div>
        )}
      </Panel>
    </div>
  )
}
