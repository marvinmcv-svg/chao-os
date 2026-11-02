'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setError('Credenciales inválidas') // Same message for both cases (no user enumeration)
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Left: editorial plate */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 border-r border-g80 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full text-g80" aria-hidden>
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {/* Plan drawing */}
        <svg viewBox="0 0 400 300" className="absolute right-[-40px] bottom-[-20px] w-[620px] text-accent/40" fill="none" aria-hidden>
          <rect x="20" y="20" width="360" height="260" stroke="currentColor" strokeWidth="2" />
          <path d="M20 140 H220 M220 20 V280 M220 200 H380" stroke="currentColor" strokeWidth="1.5" />
          <path d="M220 110 A 30 30 0 0 1 250 140" stroke="currentColor" strokeDasharray="3 3" />
          <path d="M120 140 A 30 30 0 0 0 90 170" stroke="currentColor" strokeDasharray="3 3" />
          <path d="M300 200 A 30 30 0 0 1 330 230" stroke="currentColor" strokeDasharray="3 3" />
          <circle cx="300" cy="80" r="26" stroke="currentColor" />
          <path d="M40 300 H380" stroke="currentColor" strokeWidth="0.75" />
          <text x="40" y="296" fill="currentColor" fontSize="8" fontFamily="DM Mono">0     2     4     6 m</text>
        </svg>

        <div className="relative flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 22 22" fill="none" aria-hidden className="text-accent">
            <rect x="1" y="1" width="20" height="20" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1 21 A 12 12 0 0 1 13 9" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
            <path d="M13 9 V 21" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="font-display text-2xl text-white">CHAO</span>
          <span className="font-mono text-2xs text-g40 border border-g70 rounded px-1">OS</span>
        </div>

        <div className="relative max-w-md">
          <p className="text-2xs font-mono text-accent uppercase tracking-[0.25em] mb-4">Sistema operativo del estudio</p>
          <h1 className="font-display text-5xl text-white leading-[1.05]">Proyectos, honorarios y equipo en un solo plano.</h1>
          <p className="text-g30 mt-5 leading-relaxed">
            Pipeline comercial, fases y honorarios, cobranza, capacidad del equipo y portal del cliente — diseñado para
            estudios de arquitectura.
          </p>
        </div>

        <p className="relative text-2xs font-mono text-g50">CHAO Arquitectura S.R.L. · Santa Cruz de la Sierra, Bolivia</p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10 text-center">
            <span className="font-display text-4xl text-white">CHAO</span>
            <span className="font-mono text-xs text-g40 ml-2">OS</span>
          </div>
          <h2 className="font-display text-3xl text-white">Ingresar</h2>
          <p className="text-sm text-g40 mt-1 mb-8">Accede con tu cuenta del estudio.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@chaoarquitectura.bo" required autoComplete="email" autoFocus />
            <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />

            {error && (
              <div role="alert" className="p-3 rounded-md bg-red-950/40 border border-red-900/60 text-sm text-red-300">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {loading ? 'Ingresando…' : <>Ingresar <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>

          <p className="text-2xs text-g50 mt-10 text-center">¿Eres cliente? Usa el enlace del portal que te envió tu director de proyecto.</p>
        </div>
      </div>
    </div>
  )
}
