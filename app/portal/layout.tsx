export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-g80 bg-g95/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden className="text-accent">
              <rect x="1" y="1" width="20" height="20" stroke="currentColor" strokeWidth="1.5" />
              <path d="M1 21 A 12 12 0 0 1 13 9" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
              <path d="M13 9 V 21" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className="font-display text-xl text-white">CHAO Arquitectura</span>
          </div>
          <span className="text-2xs font-mono text-g40 uppercase tracking-[0.2em]">Portal del cliente</span>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-10">{children}</main>
      <footer className="border-t border-g80">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-2xs font-mono text-g50">
          CHAO Arquitectura S.R.L. · Santa Cruz de la Sierra, Bolivia · © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  )
}
