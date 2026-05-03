'use client'

import { useState, useEffect } from 'react'
import { Clock, Users, AlertTriangle, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { TimeTrackingWidget } from '@/components/studio/TimeTrackingWidget'
import { formatCurrency } from '@/lib/utils'

interface TeamMember {
  id: string
  userId: string
  name: string
  avatarInitials: string
  role: string
  weeklyHoursCapacity: number
  weeklyHoursLogged: number
  utilizationPercent: number
  activeTasks: number
  isOverloaded: boolean
  startDate: string | null
  hourlyRate: number | null
}

interface CapacitySummary {
  avgUtilization: number
  overloadedCount: number
  totalCapacity: number
  totalLogged: number
  totalAvailable: number
}

function UtilizationBar({ percent, size = 'md' }: { percent: number; size?: 'sm' | 'md' }) {
  const variant = percent >= 90 ? 'red' : percent >= 75 ? 'yellow' : 'green'
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={percent} variant={variant} className="flex-1" />
      <span className={`font-mono text-g30 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        {percent}%
      </span>
    </div>
  )
}

export default function StudioPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [summary, setSummary] = useState<CapacitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTimeTracking, setShowTimeTracking] = useState(false)

  useEffect(() => {
    fetchCapacity()
  }, [])

  async function fetchCapacity() {
    try {
      const res = await fetch('/api/studio/capacity')
      const json = await res.json()
      if (json.success) {
        setMembers(json.data.members)
        setSummary(json.data.summary)
      }
    } catch (e) {
      console.error('Failed to fetch capacity', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Estudio</h1>
          <p className="text-g40 mt-1 text-sm font-mono">Equipo y capacidad — CHAO OS</p>
        </div>
        <Button onClick={() => setShowTimeTracking(true)}>
          <Clock className="w-4 h-4 mr-2" />
          Registrar Horas
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-g40" />
                <p className="text-xs font-mono text-g40 uppercase">Miembros</p>
              </div>
              <p className="font-display text-3xl text-white">{members.length}</p>
              <p className="text-xs text-g40 mt-1">equipo activo</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-g40" />
                <p className="text-xs font-mono text-g40 uppercase">Utilización Promedio</p>
              </div>
              <p className={`font-display text-3xl ${summary.avgUtilization >= 80 ? 'text-yellow-400' : 'text-white'}`}>
                {summary.avgUtilization}%
              </p>
              <UtilizationBar percent={summary.avgUtilization} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-g40" />
                <p className="text-xs font-mono text-g40 uppercase">Horas Semana</p>
              </div>
              <p className="font-display text-3xl text-white">
                {summary.totalLogged}
                <span className="text-lg text-g40"> / {summary.totalCapacity}</span>
              </p>
              <p className="text-xs text-g40 mt-1">registradas esta semana</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-g40" />
                <p className="text-xs font-mono text-g40 uppercase">Sobrecargados</p>
              </div>
              <p className={`font-display text-3xl ${summary.overloadedCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {summary.overloadedCount}
              </p>
              <p className="text-xs text-g40 mt-1">≥90% utilización</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Capacity grid */}
      <div className="bg-g85 border border-g80 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-g80">
          <h2 className="font-mono text-sm text-g40 uppercase tracking-wider">Capacidad del Equipo</h2>
        </div>

        {loading ? (
          <div className="text-center py-12 text-g40 text-sm font-mono">Cargando...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-g80">
                <th className="px-4 py-3 text-left text-xs font-mono text-g40 uppercase">Miembro</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-g40 uppercase">Rol</th>
                <th className="px-4 py-3 text-center text-xs font-mono text-g40 uppercase">Tareas Activas</th>
                <th className="px-4 py-3 text-center text-xs font-mono text-g40 uppercase">Horas Semana</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-g40 uppercase">Utilización</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-g40 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-g80/50">
              {members.map(member => (
                <tr key={member.id} className="hover:bg-g80/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar initials={member.avatarInitials} size="md" />
                      <div>
                        <p className="text-sm font-medium text-white">{member.name}</p>
                        {member.isOverloaded && (
                          <p className="text-xs text-red-400 mt-0.5">⚠ Sobrecargado</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-g30">{member.role}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={member.activeTasks >= 5 ? 'yellow' : member.activeTasks >= 3 ? 'blue' : 'default'}>
                      {member.activeTasks}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div>
                      <p className="text-sm font-mono text-white">
                        {member.weeklyHoursLogged}
                        <span className="text-g40"> / {member.weeklyHoursCapacity}h</span>
                      </p>
                      <p className="text-xs text-g40">
                        {member.weeklyHoursCapacity - member.weeklyHoursLogged}h disponibles
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[160px]">
                    <UtilizationBar percent={member.utilizationPercent} />
                  </td>
                  <td className="px-4 py-3">
                    {member.isOverloaded ? (
                      <Badge variant="red">Sobrecargado</Badge>
                    ) : member.utilizationPercent >= 75 ? (
                      <Badge variant="yellow">Alto</Badge>
                    ) : (
                      <Badge variant="green">Normal</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Time tracking widget (modal/drawer) */}
      {showTimeTracking && (
        <TimeTrackingWidget
          onClose={() => setShowTimeTracking(false)}
          onEntryAdded={fetchCapacity}
        />
      )}
    </div>
  )
}