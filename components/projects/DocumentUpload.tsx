'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, X, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectedFile {
  file: File
  previewUrl: string
}

type UploadState =
  | { status: 'idle' }
  | { status: 'selected'; file: SelectedFile }
  | { status: 'uploading'; file: SelectedFile; progress: number }
  | { status: 'success' }
  | { status: 'error'; message: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/octet-stream', // CAD files
]

const ALLOWED_EXTENSIONS = '.pdf, .png, .jpg, .jpeg, .dwg, .dxf, .ifc'
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DocumentUploadProps {
  projectId: string
  phase?: string
  onUploadComplete?: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DocumentUpload({ projectId, phase, onUploadComplete }: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files?.[0]) handleFileSelect(files[0])
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.[0]) handleFileSelect(files[0])
  }, [])

  // ── File selection + validation ──────────────────────────────────────────

  function handleFileSelect(file: File) {
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadState({ status: 'error', message: `Tipo de archivo no permitido: ${file.type}` })
      return
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      setUploadState({
        status: 'error',
        message: `El archivo excede el límite de 50 MB (${formatBytes(file.size)})`,
      })
      return
    }

    const previewUrl = URL.createObjectURL(file)
    setUploadState({ status: 'selected', file: { file, previewUrl } })
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (uploadState.status !== 'selected') return

    const selectedFile = uploadState.file

    setUploadState({ status: 'uploading', file: selectedFile, progress: 0 })

    try {
      // 1. Create document record → get presigned URL
      const createRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          phase: phase ?? undefined,
          filename: selectedFile.file.name,
          mimeType: selectedFile.file.type,
          sizeBytes: selectedFile.file.size,
        }),
      })

      const createJson = await createRes.json()

      if (!createJson.success) {
        setUploadState({ status: 'error', message: createJson.error?.message ?? 'Error al crear registro' })
        return
      }

      const { uploadUrl } = createJson.data

      // 2. Upload to S3 via XHR for progress tracking
      await uploadToS3(uploadUrl, selectedFile.file, (progress) => {
        setUploadState({ status: 'uploading', file: selectedFile, progress })
      })

      // 3. Success
      setUploadState({ status: 'success' })
      onUploadComplete?.()

      // Reset after 3s
      setTimeout(() => {
        setUploadState({ status: 'idle' })
        if (inputRef.current) inputRef.current.value = ''
      }, 3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setUploadState({ status: 'error', message })
    }
  }

  function uploadToS3(
    url: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.onabort = () => reject(new Error('Upload aborted'))

      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
  }

  function handleCancel() {
    xhrRef.current?.abort()
    setUploadState({ status: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {uploadState.status === 'idle' || uploadState.status === 'error' ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-md cursor-pointer
            transition-colors select-none
            ${dragActive
              ? 'border-blue-400 bg-blue-400/5'
              : 'border-g70 bg-g85 hover:border-g60 hover:bg-g80'}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS}
            onChange={handleInputChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
            <Upload className="w-8 h-8 text-g40" />
            <div>
              <p className="text-sm text-g20">
                Arrastra el archivo aquí o <span className="text-white underline">haz clic</span>
              </p>
              <p className="text-xs text-g40 mt-1">
                PDF, PNG, JPG — máx 50 MB
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Error */}
      {uploadState.status === 'error' && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/10 border border-red-800 rounded-md px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadState.message}</span>
          <button onClick={handleCancel} className="ml-auto p-1 hover:text-red-300">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Selected file */}
      {uploadState.status === 'selected' && (
        <div className="flex items-center gap-3 bg-g85 border border-g80 rounded-md px-4 py-3">
          <FileText className="w-5 h-5 text-g30 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{uploadState.file.file.name}</p>
            <p className="text-xs text-g40">
              {formatBytes(uploadState.file.file.size)} · {uploadState.file.file.type}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit}>
              Subir
            </Button>
          </div>
        </div>
      )}

      {/* Uploading */}
      {uploadState.status === 'uploading' && (
        <div className="bg-g85 border border-g80 rounded-md px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{uploadState.file.file.name}</p>
              <p className="text-xs text-g40">
                {formatBytes(uploadState.file.file.size)} · Subiendo...
              </p>
            </div>
            <button
              onClick={() => xhrRef.current?.abort()}
              className="p-1 text-g40 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ProgressBar value={uploadState.progress} variant="blue" showLabel />
        </div>
      )}

      {/* Success */}
      {uploadState.status === 'success' && (
        <div className="flex items-center gap-2 text-green-400 text-sm bg-green-900/10 border border-green-800 rounded-md px-3 py-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>¡Documento subido con éxito!</span>
        </div>
      )}
    </div>
  )
}