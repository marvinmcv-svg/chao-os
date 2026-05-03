import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-g95">
      {/* Sidebar — fixed left */}
      <Sidebar />
      
      {/* Topbar — fixed top, offset by sidebar */}
      <Topbar />
      
      {/* Main content — offset by sidebar + topbar */}
      <main className="ml-[240px] mt-14 min-h-[calc(100vh-56px)]">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
