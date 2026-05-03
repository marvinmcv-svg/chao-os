import type { Metadata } from 'next'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { PWASetup } from '@/components/PWASetup'
import './globals.css'

export const metadata: Metadata = {
  title: 'CHAO OS',
  description: 'CRM & Operating System para Estudios de Arquitectura',
  manifest: '/manifest.json',
  themeColor: '#0f0f0f',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
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
