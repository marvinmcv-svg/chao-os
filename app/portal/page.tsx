import { redirect } from 'next/navigation'

interface Props {
  searchParams: { token?: string; projectId?: string }
}

export default function PortalHomePage({ searchParams }: Props) {
  // If token + projectId provided, show project status
  // Otherwise show a simple "access the portal" message
  if (searchParams.token && searchParams.projectId) {
    redirect(`/portal/projects/${searchParams.projectId}?token=${searchParams.token}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="font-serif text-4xl text-gray-900 mb-4">CHAO Arquitectura</h1>
        <p className="text-gray-600 mb-2">Portal del Cliente</p>
        <p className="text-sm text-gray-400">
          Use su enlace de acceso único para ver el estado de su proyecto.
          <br />
          Si no tiene un enlace, contacte a su项目经理.
        </p>
      </div>
    </div>
  )
}