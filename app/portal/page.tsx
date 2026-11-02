import { redirect } from 'next/navigation'
import { Lock } from 'lucide-react'

interface Props {
  searchParams: { token?: string; projectId?: string }
}

export default function PortalHomePage({ searchParams }: Props) {
  if (searchParams.token && searchParams.projectId) {
    redirect(`/portal/projects/${encodeURIComponent(searchParams.projectId)}?token=${encodeURIComponent(searchParams.token)}`)
  }

  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 rounded-full border border-g70 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-5 h-5 text-accent" />
        </div>
        <h1 className="font-display text-4xl text-white mb-3">Portal del cliente</h1>
        <p className="text-g30">Consulta el avance de tu proyecto, hitos, documentos aprobados y facturas.</p>
        <p className="text-sm text-g40 mt-4">
          Ingresa con el enlace de acceso único que te envió tu director de proyecto. Si no lo tienes, escríbenos y te
          enviaremos uno nuevo.
        </p>
      </div>
    </div>
  )
}
