'use client'

import { useState, useEffect } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'

interface Contact {
  id: string
  name: string
  company: string
  email: string
  phone: string
  type: 'lead' | 'client'
  projectName?: string
  pipelineStage?: string
  estimatedValueUSD?: number
}

interface Props {
  onContactClick: (contact: Contact) => void
}

export function ContactsTable({ onContactClick }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'name' | 'company' | 'email'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    fetchContacts()
  }, [])

  async function fetchContacts() {
    try {
      // Fetch leads as contacts
      const [leadsRes, clientsRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/clients'),
      ])
      const leadsJson = await leadsRes.json()
      const clientsJson = await clientsRes.json()

      const leadContacts: Contact[] = (leadsJson.success ? leadsJson.data : []).map((l: any) => ({
        id: l.id,
        name: l.contactName,
        company: l.company,
        email: l.contactEmail,
        phone: l.contactPhone || '',
        type: 'lead' as const,
        projectName: l.projectName,
        pipelineStage: l.pipelineStage,
        estimatedValueUSD: l.estimatedValueUSD,
      }))

      const clientContacts: Contact[] = (clientsJson.success ? clientsJson.data : []).map((c: any) => ({
        id: c.id,
        name: c.name,
        company: c.company,
        email: c.email,
        phone: c.phone || '',
        type: 'client' as const,
      }))

      const merged = [...leadContacts, ...clientContacts]
      const deduplicated = merged.filter((contact, index, self) =>
        index === self.findIndex(c => c.email === contact.email)
      )
      setContacts(deduplicated)
    } catch (e) {
      console.error('Failed to fetch contacts', e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = contacts.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortField] || ''
    const bVal = b[sortField] || ''
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal))
  })

  function toggleSort(field: 'name' | 'company' | 'email') {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const stageVariant: Record<string, 'default' | 'green' | 'yellow' | 'red' | 'blue'> = {
    PROSPECT: 'default',
    QUALIFIED: 'blue',
    PROPOSAL: 'yellow',
    NEGOTIATION: 'yellow',
    WON: 'green',
    LOST: 'red',
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g50" />
        <input
          type="text"
          placeholder="Buscar por nombre, empresa o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-4 bg-g90 border border-g70 rounded-md text-sm text-g20 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-g40 text-sm font-mono">Cargando...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-8 text-g40 text-sm font-mono">No hay contactos</div>
      ) : (
        <div className="border border-g80 rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-white">
                    Nombre <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort('company')} className="flex items-center gap-1 hover:text-white">
                    Empresa <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead>
                  <button onClick={() => toggleSort('email')} className="flex items-center gap-1 hover:text-white">
                    Email <ArrowUpDown className="w-3 h-3" />
                  </button>
                </TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Proyecto / Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(contact => (
                <TableRow
                  key={contact.id}
                  onClick={() => onContactClick(contact)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar initials={contact.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)} size="sm" />
                      <span className="text-white">{contact.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-g30">{contact.company}</TableCell>
                  <TableCell className="text-g30">{contact.email}</TableCell>
                  <TableCell className="text-g30">{contact.phone || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={contact.type === 'client' ? 'green' : 'default'}>
                      {contact.type === 'client' ? 'Cliente' : 'Lead'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {contact.type === 'lead' && contact.pipelineStage ? (
                      <div>
                        <p className="text-sm text-g20">{contact.projectName}</p>
                        <Badge variant={stageVariant[contact.pipelineStage]} className="mt-0.5">
                          {contact.pipelineStage.replace('_', ' ')}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-g40 text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}