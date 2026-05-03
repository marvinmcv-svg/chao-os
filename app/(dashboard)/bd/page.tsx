'use client'

import { useState, useEffect } from 'react'
import { Tabs } from '@/components/ui/Tabs'
import { KanbanBoard } from '@/components/bd/KanbanBoard'
import { NewLeadModal } from '@/components/bd/NewLeadModal'
import { LeadDetailModal } from '@/components/bd/LeadDetailModal'
import { ContactsTable } from '@/components/bd/ContactsTable'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency } from '@/lib/utils'

const TABS = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'contacts', label: 'Contactos' },
  { id: 'analytics', label: 'Analítica' },
  { id: 'settings', label: 'Configuración' },
]

interface FunnelData {
  stage: string
  count: number
  totalValue: number
  weightedValue: number
}

interface FunnelSummary {
  totalLeads: number
  wonLeads: number
  lostLeads: number
  winRate: number
  avgCycleDays: number
}

export default function BDPage() {
  const [activeTab, setActiveTab] = useState('pipeline')
  const [showNewLead, setShowNewLead] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [kanbanRefresh, setKanbanRefresh] = useState(0)
  const [funnelData, setFunnelData] = useState<FunnelData[]>([])
  const [funnelSummary, setFunnelSummary] = useState<FunnelSummary | null>(null)

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchFunnel()
    }
  }, [activeTab])

  async function fetchFunnel() {
    try {
      const res = await fetch('/api/leads/funnel')
      const json = await res.json()
      if (json.success) {
        setFunnelData(json.data.funnel)
        setFunnelSummary(json.data.summary)
      }
    } catch (e) {
      console.error('Failed to fetch funnel', e)
    }
  }

  function handleLeadCreated(_lead: unknown) {
    setShowNewLead(false)
    setKanbanRefresh(n => n + 1)
  }

  function handleCardClick(lead: { id: string }) {
    setSelectedLeadId(lead.id)
  }

  function handleLeadConvert(leadId: string) {
    setSelectedLeadId(null)
    setKanbanRefresh(n => n + 1)
  }

  function handleStageChange(_leadId: string, _stage: string) {
    setKanbanRefresh(n => n + 1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl text-white">Business Development</h1>
        <p className="text-g40 mt-1 text-sm font-mono">Pipeline de oportunidades — CHAO OS</p>
      </div>

      {/* Tab bar */}
      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Pipeline tab */}
      {activeTab === 'pipeline' && (
        <KanbanBoard
          onCardClick={handleCardClick}
          onNewLead={() => setShowNewLead(true)}
          refreshTrigger={kanbanRefresh}
        />
      )}

      {/* Contacts tab */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">
          <div className="text-g50 text-sm mb-2">Los clientes se muestran con fines de referencia. Para ver detalles del cliente, use la sección de Proyectos.</div>
          <ContactsTable onContactClick={(contact) => {
            if (contact.type === 'lead') {
              setSelectedLeadId(contact.id)
            }
          }} />
        </div>
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Summary cards */}
          {funnelSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-mono text-g40 uppercase">Total Leads</p>
                  <p className="font-display text-3xl text-white mt-2">{funnelSummary.totalLeads}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-mono text-g40 uppercase">Tasa de Cierre</p>
                  <p className="font-display text-3xl text-white mt-2">{funnelSummary.winRate}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-mono text-g40 uppercase">Ciclo Promedio</p>
                  <p className="font-display text-3xl text-white mt-2">{funnelSummary.avgCycleDays}d</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs font-mono text-g40 uppercase">Ganados / Perdidos</p>
                  <p className="font-display text-3xl text-white mt-2">
                    <span className="text-green-400">{funnelSummary.wonLeads}</span>
                    {' / '}
                    <span className="text-red-400">{funnelSummary.lostLeads}</span>
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Funnel table */}
          {funnelData.length > 0 && (
            <div className="bg-g85 border border-g80 rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-g80">
                <h2 className="font-mono text-sm text-g40 uppercase tracking-wider">Funnel por Etapa</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-g80">
                    <th className="px-4 py-3 text-left text-xs font-mono text-g40 uppercase">Etapa</th>
                    <th className="px-4 py-3 text-right text-xs font-mono text-g40 uppercase">Leads</th>
                    <th className="px-4 py-3 text-right text-xs font-mono text-g40 uppercase">Valor Total</th>
                    <th className="px-4 py-3 text-right text-xs font-mono text-g40 uppercase">Valor Ponderado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-g80/50">
                  {funnelData.map(row => (
                    <tr key={row.stage} className="hover:bg-g80/30">
                      <td className="px-4 py-3">
                        <Badge variant={
                          row.stage === 'WON' ? 'green' :
                          row.stage === 'LOST' ? 'red' :
                          row.stage === 'QUALIFIED' ? 'blue' :
                          'default'
                        }>
                          {row.stage.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-g20">{row.count}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-g20">{formatCurrency(row.totalValue)}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-white">{formatCurrency(row.weightedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-g85 border border-g80 rounded-md p-6">
            <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-4">Configuración BD</h2>
            <div className="space-y-3 text-sm text-g30">
              <p>• Umbral Go/No-Go: 70 puntos para recomendación GO</p>
              <p>• Probabilidad automática en etapa WON: 100%</p>
              <p>• Notificaciones de leads vencidos: activas</p>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <NewLeadModal
        open={showNewLead}
        onClose={() => setShowNewLead(false)}
        onSuccess={handleLeadCreated}
      />

      <LeadDetailModal
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onConvert={handleLeadConvert}
        onStageChange={handleStageChange}
        onUpdate={() => setKanbanRefresh(n => n + 1)}
      />
    </div>
  )
}
