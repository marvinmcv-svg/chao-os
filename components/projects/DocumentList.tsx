'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Download, RefreshCw, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Document {
  id: string
  projectId: string
  phase: string | null
  filename: string
  url: string
  mimeType: string | null
  sizeBytes: number | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  uploadedById: string
  uploadedBy: { id: string; name: string; avatarInitials: string }
  uploadedAt: string
}

interface DocumentListProps {
  projectId: string
  currentUserId: string
  currentUserRole: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusVariant(status: Document['status']): 'yellow' | 'green' | 'red' {
  if (status === 'PENDING') return 'yellow'
  if (status === 'APPROVED') return 'green'
  return 'red'
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DocumentList({ projectId, currentUserId, currentUserRole }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const isAdmin = currentUserRole === 'ADMIN'

  const fetchDocuments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await fetch(`/api/documents?projectId=${projectId}`)
      const json = await res.json()
      if (json.success) setDocuments(json.data)
    } finally {
      if (!silent) setLoading(false)
      else setRefreshing(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // ── Download ────────────────────────────────────────────────────────────

  async function handleDownload(doc: Document) {
    setDownloadingId(doc.id)
    try {
      const res = await fetch(`/api/documents/${doc.id}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message)
      if (!json.data.downloadUrl) throw new Error('No download URL available')
      window.open(json.data.downloadUrl, '_blank', 'noopener')
    } catch (err) {
      console.error('Download error:', err)
    } finally {
      setDownloadingId(null)
    }
  }

  // ── Status change ───────────────────────────────────────────────────────

  async function handleStatusChange(docId: string, newStatus: Document['status']) {
    setOpenDropdown(null)
    const endpoint =
      newStatus === 'APPROVED'
        ? `/api/documents/${docId}/approve`
        : `/api/documents/${docId}/reject`

    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message)
      await fetchDocuments(true)
    } catch (err) {
      console.error('Status change error:', err)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-8 text-center text-g40 text-sm font-mono">
        Cargando documentos...
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="py-8 text-center text-g40 text-sm">
        Sin documentos cargados
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={() => fetchDocuments(true)}
          disabled={refreshing}
          className="p-1.5 text-g40 hover:text-white transition-colors disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* List */}
      <div className="space-y-1.5">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-3 bg-g85 border border-g80 rounded-md px-4 py-3"
          >
            {/* Icon */}
            <FileText className="w-4 h-4 text-g30 shrink-0" />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{doc.filename}</p>
              <p className="text-xs text-g40">
                {formatBytes(doc.sizeBytes)}
                {doc.phase ? ` · ${doc.phase}` : null}
                {' · '}
                {doc.uploadedBy.name}
                {' · '}
                {formatDate(doc.uploadedAt)}
              </p>
            </div>

            {/* Status badge */}
            <Badge variant={statusVariant(doc.status)}>{doc.status}</Badge>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Download — only APPROVED */}
              {doc.status === 'APPROVED' && (
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  className="p-1.5 text-g40 hover:text-white transition-colors disabled:opacity-50"
                  title="Descargar"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Status dropdown — admin only */}
              {isAdmin && doc.status !== 'APPROVED' && (
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === doc.id ? null : doc.id)}
                    className="p-1.5 text-g40 hover:text-white transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {openDropdown === doc.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenDropdown(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-g85 border border-g80 rounded-md shadow-lg overflow-hidden min-w-[120px]">
                        <button
                          onClick={() => handleStatusChange(doc.id, 'APPROVED')}
                          className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-g80 transition-colors"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => handleStatusChange(doc.id, 'REJECTED')}
                          className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-g80 transition-colors"
                        >
                          Rechazar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}