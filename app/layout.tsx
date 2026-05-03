import type { Metadata } from 'next'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { PWASetup } from '@/components/PWASetup'
import './globals.css'

export const metadata: Metadata = {
  title: 'CHAO OS',
  description: 'CRM & Operating System para Estudios de Arquitectura',
  manifest: '/manifest.json',
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'CHAO OS',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icon-192.png',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f0f0f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body className="font-ui antialiased">
        <SessionProvider>
          <PWASetup />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
