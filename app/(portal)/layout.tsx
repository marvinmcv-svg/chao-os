export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Portal Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div>
            <span className="font-serif text-xl text-gray-900">CHAO Arquitectura</span>
            <span className="ml-2 text-xs text-gray-400 font-mono">Client Portal</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900" id="portal-client-name">Bienvenido</p>
            <p className="text-xs text-gray-400" id="portal-company-name">Portal del Cliente</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-xs text-gray-400">
          CHAO Arquitectura S.R.L. · Santa Cruz de la Sierra, Bolivia · © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  )
}